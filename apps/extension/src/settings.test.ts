import { describe, expect, it } from "vitest";

import {
  CACHE_DAY_OPTIONS,
  DEFAULT_SETTINGS,
  isConfigured,
  isSiteEnabled,
  normalizeStoredSettings,
} from "./settings.js";

describe("DEFAULT_SETTINGS", () => {
  it("translates nothing until the reader opts in", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      autoPreview: false,
      cacheDays: 7,
      discord: false,
      reddit: false,
      serverUrl: "",
      token: "",
      tone: "casual",
      x: false,
    });
  });

  it("offers only the documented retention choices", () => {
    expect([...CACHE_DAY_OPTIONS]).toEqual([0, 7, 30]);
  });
});

describe("normalizeStoredSettings", () => {
  it("keeps values that are valid", () => {
    expect(
      normalizeStoredSettings({
        autoPreview: true,
        cacheDays: 30,
        discord: true,
        reddit: false,
        serverUrl: "https://translator.example",
        token: "secret",
        tone: "neutral",
        x: true,
      }),
    ).toEqual({
      autoPreview: true,
      cacheDays: 30,
      discord: true,
      reddit: false,
      serverUrl: "https://translator.example",
      token: "secret",
      tone: "neutral",
      x: true,
    });
  });

  it("falls back to the default for an unsupported retention or tone", () => {
    const settings = normalizeStoredSettings({ cacheDays: 365, tone: "shouty" });
    expect(settings.cacheDays).toBe(7);
    expect(settings.tone).toBe("casual");
  });

  it("ignores values of the wrong type and unknown keys", () => {
    const settings = normalizeStoredSettings({
      deeplApiKey: "there is no DeepL here",
      discord: "yes",
      serverUrl: 42,
    });
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(Object.keys(settings)).not.toContain("deeplApiKey");
  });

  it("reads an empty store as the defaults", () => {
    expect(normalizeStoredSettings({})).toEqual(DEFAULT_SETTINGS);
  });
});

describe("isSiteEnabled", () => {
  it("answers per site", () => {
    const settings = { ...DEFAULT_SETTINGS, discord: true };
    expect(isSiteEnabled(settings, "discord")).toBe(true);
    expect(isSiteEnabled(settings, "reddit")).toBe(false);
    expect(isSiteEnabled(settings, "x")).toBe(false);
  });
});

describe("isConfigured", () => {
  it("requires both a server address and a token", () => {
    expect(isConfigured(DEFAULT_SETTINGS)).toBe(false);
    expect(
      isConfigured({ ...DEFAULT_SETTINGS, serverUrl: "https://translator.example" }),
    ).toBe(false);
    expect(isConfigured({ ...DEFAULT_SETTINGS, token: "secret" })).toBe(false);
    expect(
      isConfigured({
        ...DEFAULT_SETTINGS,
        serverUrl: "https://translator.example",
        token: "secret",
      }),
    ).toBe(true);
  });
});
