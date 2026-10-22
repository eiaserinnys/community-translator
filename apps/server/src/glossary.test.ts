import { describe, expect, it, vi } from "vitest";

import { loadGlossary, matchGlossaryEntries, parseGlossaryDocument } from "./glossary.js";

const document = `
id: glossary
items:
- id: MC-XAJI0Y
  category: main_characters
  name:
    en: Alden Vale
    kr: 알덴 베일
    ja: アルデン
  epithet:
    en: The Wanderer of Dawn
    kr: 새벽의 방랑자
- id: MC-6DPBHS
  category: main_characters
  name:
    en: Rowan Sterling
    kr: 로완 스털링
  aliases:
  - en: Rowan
    kr: 로완
- id: BS-9XUY41
  category: bosses
  name:
    en: Obsidian Wyrm
    kr: 흑요석 비룡
- id: NO-PAIR
  category: concepts
  name:
    ja: 名前だけ
`;

describe("parseGlossaryDocument", () => {
  it("collects name, alias and epithet pairs that have both languages", () => {
    expect(parseGlossaryDocument(document)).toEqual([
      { en: "Alden Vale", kr: "알덴 베일" },
      { en: "The Wanderer of Dawn", kr: "새벽의 방랑자" },
      { en: "Rowan Sterling", kr: "로완 스털링" },
      { en: "Rowan", kr: "로완" },
      { en: "Obsidian Wyrm", kr: "흑요석 비룡" },
    ]);
  });

  it("skips entries that have no English/Korean pair", () => {
    expect(parseGlossaryDocument(document).some((entry) => entry.en === "名前だけ")).toBe(false);
  });

  it("returns nothing for a document without items", () => {
    expect(parseGlossaryDocument("id: glossary\n")).toEqual([]);
  });
});

describe("matchGlossaryEntries", () => {
  const entries = parseGlossaryDocument(document);

  it("injects only the terms that appear in the request text", () => {
    expect(matchGlossaryEntries("Did Obsidian Wyrm beat alden vale?", entries, 40)).toEqual([
      { en: "Obsidian Wyrm", kr: "흑요석 비룡" },
      { en: "Alden Vale", kr: "알덴 베일" },
    ]);
  });

  it("matches the Korean spelling too", () => {
    expect(matchGlossaryEntries("로완 스털링은 어디 있나요", entries, 1)).toEqual([
      { en: "Rowan Sterling", kr: "로완 스털링" },
    ]);
  });

  it("does not match an English term inside a longer word", () => {
    expect(matchGlossaryEntries("Rowanite is not Rowan", entries, 40)).toEqual([
      { en: "Rowan", kr: "로완" },
    ]);
    expect(matchGlossaryEntries("Rowanite only", entries, 40)).toEqual([]);
  });

  it("returns nothing when the text mentions no glossary term", () => {
    expect(matchGlossaryEntries("good morning everyone", entries, 40)).toEqual([]);
  });

  it("caps the number of injected terms", () => {
    expect(matchGlossaryEntries("Obsidian Wyrm and Rowan and Alden Vale", entries, 2)).toHaveLength(2);
  });
});

describe("loadGlossary", () => {
  it("reads and parses the configured file", async () => {
    const readFile = vi.fn(async () => document);
    await expect(loadGlossary("/srv/glossary.yaml", { readFile })).resolves.toHaveLength(5);
    expect(readFile).toHaveBeenCalledWith("/srv/glossary.yaml", "utf8");
  });

  it("warns and keeps running when the file is missing", async () => {
    const warn = vi.fn();
    const readFile = vi.fn(async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    await expect(loadGlossary("/srv/missing.yaml", { readFile, warn })).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/\/srv\/missing\.yaml/u);
  });

  it("warns and keeps running when the file is not valid YAML", async () => {
    const warn = vi.fn();
    const readFile = vi.fn(async () => "items: [unclosed");

    await expect(loadGlossary("/srv/broken.yaml", { readFile, warn })).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
