import { describe, expect, it } from "vitest";

import { extensionManifest, SERVER_OPTIONAL_HOST_PERMISSIONS, TRANSLATED_SITE_MATCHES } from "./manifest.js";

describe("extensionManifest", () => {
  it("is named for the reader, in Korean", () => {
    expect(extensionManifest.name).toBe("커뮤니티 번역");
  });

  it("asks for storage and nothing else", () => {
    expect(extensionManifest.permissions).toEqual(["storage"]);
  });

  it("requests no host permission up front", () => {
    expect(extensionManifest).not.toHaveProperty("host_permissions");
  });

  it("keeps the optional server origins to https and loopback http", () => {
    expect([...SERVER_OPTIONAL_HOST_PERMISSIONS]).toEqual([
      "https://*/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
      "http://[::1]/*",
    ]);
    expect(extensionManifest.optional_host_permissions).toEqual([
      ...SERVER_OPTIONAL_HOST_PERMISSIONS,
    ]);
  });

  it("injects only into the three supported communities, over https", () => {
    expect([...TRANSLATED_SITE_MATCHES]).toEqual([
      "https://discord.com/*",
      "https://www.reddit.com/*",
      "https://old.reddit.com/*",
      "https://x.com/*",
      "https://www.x.com/*",
      "https://twitter.com/*",
      "https://www.twitter.com/*",
    ]);
    for (const match of TRANSLATED_SITE_MATCHES) {
      expect(match.startsWith("https://")).toBe(true);
    }
  });

  it("mentions no translation provider the extension does not use", () => {
    const serialized = JSON.stringify(extensionManifest).toLowerCase();
    expect(serialized).not.toContain("deepl");
  });
});
