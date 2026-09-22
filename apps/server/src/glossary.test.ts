import { describe, expect, it, vi } from "vitest";

import { loadGlossary, matchGlossaryEntries, parseGlossaryDocument } from "./glossary.js";

const document = `
id: glossary
items:
- id: MC-XAJI0Y
  category: main_characters
  name:
    en: Fenrix Haven
    kr: 펜릭스 헤이븐
    ja: フェンリクス
  epithet:
    en: The Immortal Demon Hunter
    kr: 불사의 악마 사냥꾼
- id: MC-6DPBHS
  category: main_characters
  name:
    en: Ariella Ashwood
    kr: 아리엘라 애시우드
  aliases:
  - en: Ella
    kr: 엘리
- id: BS-9XUY41
  category: bosses
  name:
    en: Asmodeus
    kr: 아스모데우스
- id: NO-PAIR
  category: concepts
  name:
    ja: 名前だけ
`;

describe("parseGlossaryDocument", () => {
  it("collects name, alias and epithet pairs that have both languages", () => {
    expect(parseGlossaryDocument(document)).toEqual([
      { en: "Fenrix Haven", kr: "펜릭스 헤이븐" },
      { en: "The Immortal Demon Hunter", kr: "불사의 악마 사냥꾼" },
      { en: "Ariella Ashwood", kr: "아리엘라 애시우드" },
      { en: "Ella", kr: "엘리" },
      { en: "Asmodeus", kr: "아스모데우스" },
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
    expect(matchGlossaryEntries("Did Asmodeus beat fenrix haven?", entries, 40)).toEqual([
      { en: "Fenrix Haven", kr: "펜릭스 헤이븐" },
      { en: "Asmodeus", kr: "아스모데우스" },
    ]);
  });

  it("matches the Korean spelling too", () => {
    expect(matchGlossaryEntries("아리엘라 애시우드는 어디 있나요", entries, 40)).toEqual([
      { en: "Ariella Ashwood", kr: "아리엘라 애시우드" },
    ]);
  });

  it("does not match an English term inside a longer word", () => {
    expect(matchGlossaryEntries("Ellazar is not Ella", entries, 40)).toEqual([
      { en: "Ella", kr: "엘리" },
    ]);
    expect(matchGlossaryEntries("Ellazar only", entries, 40)).toEqual([]);
  });

  it("returns nothing when the text mentions no glossary term", () => {
    expect(matchGlossaryEntries("good morning everyone", entries, 40)).toEqual([]);
  });

  it("caps the number of injected terms", () => {
    expect(matchGlossaryEntries("Asmodeus and Ella and Fenrix Haven", entries, 2)).toHaveLength(2);
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
