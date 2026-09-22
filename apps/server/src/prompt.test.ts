import { describe, expect, it } from "vitest";

import { buildTranslationPrompt } from "./prompt.js";

const glossary = [
  { en: "Fenrix Haven", kr: "펜릭스 헤이븐" },
  { en: "Ella", kr: "엘리" },
];

describe("buildTranslationPrompt", () => {
  it("carries the source text inside a delimited block", () => {
    const prompt = buildTranslationPrompt({ glossary: [], target: "KO", text: "Hello there" });
    expect(prompt).toContain("Hello there");
    expect(prompt).toMatch(/<<<MESSAGE\n[\s\S]*Hello there[\s\S]*\nMESSAGE>>>/u);
  });

  it("asks for Korean output when the target is KO", () => {
    const prompt = buildTranslationPrompt({ glossary: [], target: "KO", text: "Hello" });
    expect(prompt).toContain("English");
    expect(prompt).toContain("Korean");
    expect(prompt).not.toContain("tone");
  });

  it("asks for friendly English on a casual draft", () => {
    const prompt = buildTranslationPrompt({
      glossary: [],
      target: "EN-US",
      text: "안녕하세요",
      tone: "casual",
    });
    expect(prompt).toContain("Korean");
    expect(prompt).toContain("English");
    expect(prompt.toLowerCase()).toContain("friendly");
  });

  it("asks for neutral English on a neutral draft", () => {
    const prompt = buildTranslationPrompt({
      glossary: [],
      target: "EN-US",
      text: "안녕하세요",
      tone: "neutral",
    });
    expect(prompt.toLowerCase()).toContain("neutral");
    expect(prompt.toLowerCase()).not.toContain("friendly");
  });

  it("renders matched glossary terms as a bilingual list", () => {
    const prompt = buildTranslationPrompt({ glossary, target: "KO", text: "Fenrix Haven and Ella" });
    expect(prompt).toContain("Fenrix Haven ↔ 펜릭스 헤이븐");
    expect(prompt).toContain("Ella ↔ 엘리");
  });

  it("omits the glossary section when nothing matched", () => {
    const prompt = buildTranslationPrompt({ glossary: [], target: "KO", text: "Hello" });
    expect(prompt).not.toContain("↔");
    expect(prompt.toLowerCase()).not.toContain("glossary");
  });

  it("tells the model to answer with the translation only", () => {
    const prompt = buildTranslationPrompt({ glossary: [], target: "KO", text: "Hello" });
    expect(prompt.toLowerCase()).toContain("only the translation");
  });

  it("mentions the community the message came from", () => {
    const prompt = buildTranslationPrompt({
      glossary: [],
      site: "discord",
      target: "KO",
      text: "Hello",
    });
    expect(prompt).toContain("Discord");
  });
});
