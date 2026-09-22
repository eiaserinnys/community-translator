import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { IndexedDbTranslationCache, translationCacheKey } from "./cache.js";

const DAY_MS = 86_400_000;

describe("translationCacheKey", () => {
  it("is a hash, so no source text is stored", async () => {
    const key = await translationCacheKey({ target: "KO", text: "hello there" });
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    expect(key).not.toContain("hello");
  });

  it("is stable for the same request", async () => {
    const first = await translationCacheKey({ target: "KO", text: "hello" });
    const second = await translationCacheKey({ target: "KO", text: "hello" });
    expect(first).toBe(second);
  });

  it("separates different text, targets and tones", async () => {
    const base = await translationCacheKey({ target: "KO", text: "hello" });
    const other = await translationCacheKey({ target: "KO", text: "hello!" });
    const target = await translationCacheKey({ target: "EN-US", text: "hello" });
    const tone = await translationCacheKey({ target: "EN-US", text: "hello", tone: "neutral" });

    expect(new Set([base, other, target, tone]).size).toBe(4);
  });
});

describe("IndexedDbTranslationCache", () => {
  let clockMs = 1_700_000_000_000;
  const clock = () => clockMs;

  function createCache(name: string) {
    return new IndexedDbTranslationCache({ clock, name });
  }

  beforeEach(() => {
    clockMs = 1_700_000_000_000;
  });

  it("returns what it stored", async () => {
    const cache = createCache(`ct-${crypto.randomUUID()}`);
    await cache.put("key-a", "안녕하세요", 7);
    await expect(cache.get("key-a", 7)).resolves.toBe("안녕하세요");
  });

  it("misses on an unknown key", async () => {
    const cache = createCache(`ct-${crypto.randomUUID()}`);
    await expect(cache.get("missing", 7)).resolves.toBeNull();
  });

  it("drops an entry once it is older than the retention window", async () => {
    const cache = createCache(`ct-${crypto.randomUUID()}`);
    await cache.put("key-a", "안녕하세요", 7);

    clockMs += 8 * DAY_MS;
    await expect(cache.get("key-a", 7)).resolves.toBeNull();
  });

  it("keeps an entry that is still inside the window", async () => {
    const cache = createCache(`ct-${crypto.randomUUID()}`);
    await cache.put("key-a", "안녕하세요", 30);

    clockMs += 20 * DAY_MS;
    await expect(cache.get("key-a", 30)).resolves.toBe("안녕하세요");
  });

  it("stores nothing when retention is off", async () => {
    const cache = createCache(`ct-${crypto.randomUUID()}`);
    await cache.put("key-a", "안녕하세요", 0);

    await expect(cache.get("key-a", 0)).resolves.toBeNull();
    await expect(cache.stats()).resolves.toMatchObject({ count: 0 });
  });

  it("reports and clears what it is holding", async () => {
    const cache = createCache(`ct-${crypto.randomUUID()}`);
    await cache.put("key-a", "안녕하세요", 7);
    await cache.put("key-b", "반갑습니다", 7);

    const stats = await cache.stats();
    expect(stats.count).toBe(2);
    expect(stats.bytes).toBeGreaterThan(0);

    await cache.clear();
    await expect(cache.stats()).resolves.toMatchObject({ count: 0 });
  });

  it("evicts the oldest entries once it exceeds its entry budget", async () => {
    const cache = new IndexedDbTranslationCache({
      clock,
      maxEntries: 3,
      name: `ct-${crypto.randomUUID()}`,
    });

    for (const index of [1, 2, 3, 4, 5]) {
      clockMs += 1_000;
      await cache.put(`key-${index}`, `번역 ${index}`, 30);
    }

    await expect(cache.stats()).resolves.toMatchObject({ count: 3 });
    await expect(cache.get("key-1", 30)).resolves.toBeNull();
    await expect(cache.get("key-5", 30)).resolves.toBe("번역 5");
  });
});
