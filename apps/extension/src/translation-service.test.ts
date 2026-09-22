import { describe, expect, it, vi } from "vitest";

import { TranslationDisplayError, TranslationService } from "./translation-service.js";
import type { TranslationCache } from "./cache.js";

function memoryCache(): TranslationCache & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    async clear() {
      entries.clear();
    },
    async get(key) {
      return entries.get(key) ?? null;
    },
    async put(key, text) {
      entries.set(key, text);
    },
    async stats() {
      return { bytes: 0, count: entries.size };
    },
  };
}

const request = { site: "discord", target: "KO", text: "hello there" } as const;

describe("TranslationService", () => {
  it("returns the translated text from the backend", async () => {
    const translate = vi.fn(async () => ({ ok: true as const, text: "안녕하세요" }));
    const service = new TranslationService({ backend: { translate }, cache: memoryCache() });

    await expect(service.translate(request, 7)).resolves.toBe("안녕하세요");
  });

  it("merges concurrent requests for the same sentence into one call", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const translate = vi.fn(async () => {
      await gate;
      return { ok: true as const, text: "안녕하세요" };
    });
    const service = new TranslationService({ backend: { translate }, cache: memoryCache() });

    const inFlight = [service.translate(request, 7), service.translate(request, 7)];
    release?.();

    await expect(Promise.all(inFlight)).resolves.toEqual(["안녕하세요", "안녕하세요"]);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("does not merge requests that differ in target or tone", async () => {
    const translate = vi.fn(async () => ({ ok: true as const, text: "안녕하세요" }));
    const service = new TranslationService({ backend: { translate }, cache: memoryCache() });

    await Promise.all([
      service.translate(request, 7),
      service.translate({ ...request, target: "EN-US" }, 7),
      service.translate({ ...request, target: "EN-US", tone: "neutral" }, 7),
    ]);

    expect(translate).toHaveBeenCalledTimes(3);
  });

  it("reuses a cached translation instead of calling the server again", async () => {
    const translate = vi.fn(async () => ({ ok: true as const, text: "안녕하세요" }));
    const cache = memoryCache();
    const service = new TranslationService({ backend: { translate }, cache });

    await service.translate(request, 7);
    await service.translate(request, 7);

    expect(translate).toHaveBeenCalledTimes(1);
    expect(cache.entries.size).toBe(1);
  });

  it("stores only a hashed key and the translation, never the source text", async () => {
    const translate = vi.fn(async () => ({ ok: true as const, text: "안녕하세요" }));
    const cache = memoryCache();
    const service = new TranslationService({ backend: { translate }, cache });

    await service.translate(request, 7);

    const [key] = [...cache.entries.keys()];
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    expect(key).not.toContain("hello");
    expect([...cache.entries.values()]).toEqual(["안녕하세요"]);
  });

  it("skips the cache entirely when retention is off", async () => {
    const translate = vi.fn(async () => ({ ok: true as const, text: "안녕하세요" }));
    const cache = memoryCache();
    const service = new TranslationService({ backend: { translate }, cache });

    await service.translate(request, 0);
    await service.translate(request, 0);

    expect(translate).toHaveBeenCalledTimes(2);
    expect(cache.entries.size).toBe(0);
  });

  it("surfaces the reason a translation failed", async () => {
    const service = new TranslationService({
      backend: {
        translate: async () => ({
          code: "server_unreachable" as const,
          message: "번역 서버에 연결하지 못했어요.",
          ok: false as const,
        }),
      },
      cache: memoryCache(),
    });

    const failure = await service.translate(request, 7).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TranslationDisplayError);
    expect((failure as TranslationDisplayError).code).toBe("server_unreachable");
    expect((failure as TranslationDisplayError).message).toBe("번역 서버에 연결하지 못했어요.");
  });

  it("does not cache a failure", async () => {
    const cache = memoryCache();
    const service = new TranslationService({
      backend: {
        translate: async () => ({
          code: "translation_failed" as const,
          message: "실패",
          ok: false as const,
        }),
      },
      cache,
    });

    await service.translate(request, 7).catch(() => undefined);
    expect(cache.entries.size).toBe(0);
  });

  it("does not merge a request made after a settings change into the in-flight one", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const translate = vi.fn(async () => {
      await gate;
      return { ok: true as const, text: "안녕하세요" };
    });
    const service = new TranslationService({ backend: { translate }, cache: memoryCache() });

    // Without the clear() these two would collapse into a single call, so two calls
    // is evidence that the pre-change answer is not reused for the new settings.
    const first = service.translate(request, 0);
    service.clear();
    const second = service.translate(request, 0);
    release?.();

    await Promise.all([first, second]);
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it("rejects text that is too long before it reaches the server", async () => {
    const translate = vi.fn(async () => ({ ok: true as const, text: "안녕하세요" }));
    const service = new TranslationService({ backend: { translate }, cache: memoryCache() });

    const failure = await service
      .translate({ ...request, text: "a".repeat(5_001) }, 7)
      .catch((error: unknown) => error);

    expect((failure as TranslationDisplayError).code).toBe("text_too_long");
    expect(translate).not.toHaveBeenCalled();
  });

  it("rejects empty text before it reaches the server", async () => {
    const translate = vi.fn(async () => ({ ok: true as const, text: "안녕하세요" }));
    const service = new TranslationService({ backend: { translate }, cache: memoryCache() });

    const failure = await service
      .translate({ ...request, text: "   " }, 7)
      .catch((error: unknown) => error);

    expect((failure as TranslationDisplayError).code).toBe("empty_text");
    expect(translate).not.toHaveBeenCalled();
  });
});
