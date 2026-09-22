import { describe, expect, it } from "vitest";

import { SITE_SELECTORS, siteFor, TRANSLATED_SITES } from "./site.js";

describe("siteFor", () => {
  it.each([
    ["https://discord.com/channels/1/2", "discord"],
    ["https://www.reddit.com/r/gaming", "reddit"],
    ["https://old.reddit.com/r/gaming", "reddit"],
    ["https://x.com/home", "x"],
    ["https://www.x.com/home", "x"],
    ["https://twitter.com/home", "x"],
    ["https://www.twitter.com/home", "x"],
  ])("maps %s to %s", (url, expected) => {
    expect(siteFor(url)).toBe(expected);
  });

  it("refuses plaintext http so a downgraded page cannot ask for translations", () => {
    expect(siteFor("http://discord.com/channels/1/2")).toBeNull();
  });

  it("refuses a lookalike host", () => {
    expect(siteFor("https://discord.com.evil.example/")).toBeNull();
    expect(siteFor("https://notreddit.com/")).toBeNull();
    expect(siteFor("https://evil.example/?x=https://x.com")).toBeNull();
  });

  it("returns null for anything that is not a URL", () => {
    expect(siteFor("not a url")).toBeNull();
    expect(siteFor("")).toBeNull();
  });
});

describe("SITE_SELECTORS", () => {
  it("covers every translated site", () => {
    expect(Object.keys(SITE_SELECTORS).sort()).toEqual([...TRANSLATED_SITES].sort());
  });

  it("gives each site a message selector and a composer selector", () => {
    for (const site of TRANSLATED_SITES) {
      const selectors = SITE_SELECTORS[site];
      expect(selectors.incoming.length).toBeGreaterThan(0);
      expect(selectors.composer.length).toBeGreaterThan(0);
    }
  });

  it("uses selectors a browser can actually parse", () => {
    for (const site of TRANSLATED_SITES) {
      const selectors = SITE_SELECTORS[site];
      expect(() => document.querySelector(selectors.incoming)).not.toThrow();
      expect(() => document.querySelector(selectors.composer)).not.toThrow();
      for (const anchor of selectors.composerAnchors) {
        expect(() => document.querySelector(anchor)).not.toThrow();
      }
    }
  });
});
