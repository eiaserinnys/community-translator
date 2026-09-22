import { describe, expect, it } from "vitest";

import {
  isEnglishProse,
  isKoreanDraft,
  isTranslatableLength,
  MAX_TRANSLATION_LENGTH,
} from "./language.js";

describe("isEnglishProse", () => {
  it("accepts an ordinary English message", () => {
    expect(isEnglishProse("Did anyone else beat that boss on the first try?")).toBe(true);
  });

  it("rejects text that already contains Korean", () => {
    expect(isEnglishProse("this is 한국어 mixed in")).toBe(false);
  });

  it.each([
    ["Japanese", "これはテストです"],
    ["Chinese", "这是一个测试"],
    ["Cyrillic", "это тест"],
    ["Arabic", "هذا اختبار"],
    ["Thai", "นี่คือการทดสอบ"],
  ])("rejects %s", (_name, text) => {
    expect(isEnglishProse(text)).toBe(false);
  });

  it("ignores URLs, mentions and emoji names when judging the language", () => {
    expect(isEnglishProse("@someone https://example.com/a/b :sparkles:")).toBe(false);
    expect(isEnglishProse("@someone look at https://example.com it really works")).toBe(true);
  });

  it("rejects a message with almost no letters", () => {
    expect(isEnglishProse("gg")).toBe(false);
    expect(isEnglishProse("123 456 !!!")).toBe(false);
    expect(isEnglishProse("")).toBe(false);
  });
});

describe("isKoreanDraft", () => {
  it("accepts a Korean draft", () => {
    expect(isKoreanDraft("저도 방금 깼어요")).toBe(true);
  });

  it("accepts Korean mixed with English words", () => {
    expect(isKoreanDraft("보스 patch 이후로 쉬워졌어요")).toBe(true);
  });

  it("rejects plain English and other scripts", () => {
    expect(isKoreanDraft("just english here")).toBe(false);
    expect(isKoreanDraft("한국어 and 日本語")).toBe(false);
    expect(isKoreanDraft("")).toBe(false);
  });
});

describe("isTranslatableLength", () => {
  it("allows up to the documented limit", () => {
    expect(MAX_TRANSLATION_LENGTH).toBe(5_000);
    expect(isTranslatableLength("a".repeat(5_000))).toBe(true);
    expect(isTranslatableLength("a".repeat(5_001))).toBe(false);
    expect(isTranslatableLength("   ")).toBe(false);
  });
});
