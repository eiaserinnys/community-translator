import { describe, expect, it, vi } from "vitest";

import { createServerBackend } from "./server-backend.js";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

const settings = { serverUrl: "https://translator.example", token: "secret" };
const request = { site: "discord", target: "KO", text: "hello" } as const;

describe("createServerBackend", () => {
  it("returns the translation the server produced", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(
        { glossaryTerms: 1, model: "gpt-5.6-luna", target: "KO", text: "안녕하세요" },
        200,
      ),
    );

    await expect(createServerBackend(settings, fetch).translate(request)).resolves.toEqual({
      ok: true,
      text: "안녕하세요",
    });
  });

  it("passes tone and site through to the server", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ glossaryTerms: 0, model: "m", target: "EN-US", text: "hi" }, 200),
    );

    await createServerBackend(settings, fetch).translate({
      site: "x",
      target: "EN-US",
      text: "안녕",
      tone: "neutral",
    });

    const [input] = fetch.mock.calls[0] ?? [];
    const body = await (input as Request).clone().json();
    expect(body).toEqual({ site: "x", target: "EN-US", text: "안녕", tone: "neutral" });
  });

  it("keeps the Korean sentence the server sent with an error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ code: "translation_quota_exhausted", message: "한도가 다 찼어요." }, 503),
    );

    await expect(createServerBackend(settings, fetch).translate(request)).resolves.toEqual({
      code: "translation_quota_exhausted",
      message: "한도가 다 찼어요.",
      ok: false,
    });
  });

  it("reports an unauthorized server answer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ code: "unauthorized", message: "토큰이 맞지 않아요." }, 401),
    );

    const result = await createServerBackend(settings, fetch).translate(request);
    expect(result).toMatchObject({ code: "unauthorized", ok: false });
  });

  it("reports an unreachable server rather than failing silently", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });

    const result = await createServerBackend(settings, fetch).translate(request);
    expect(result).toMatchObject({ code: "server_unreachable", ok: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("does not trust an unknown code the server may have sent", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ code: "something_new", message: "" }, 503),
    );

    const result = await createServerBackend(settings, fetch).translate(request);
    expect(result).toMatchObject({ code: "translation_failed", ok: false });
  });

  it("reports a misconfigured server address instead of throwing", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({}, 200));

    const result = await createServerBackend({ serverUrl: "not a url", token: "t" }, fetch).translate(
      request,
    );
    expect(result).toMatchObject({ code: "not_configured", ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
