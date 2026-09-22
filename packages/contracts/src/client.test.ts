import { describe, expect, it, vi } from "vitest";

import { createTranslatorClient, normalizeApiSettings } from "./client.js";

describe("normalizeApiSettings", () => {
  it("trims input and drops query, hash and trailing slash", () => {
    expect(
      normalizeApiSettings({
        serverUrl: "  https://translator.example/?a=1#b  ",
        token: "  secret-token  ",
      }),
    ).toEqual({ baseUrl: "https://translator.example", token: "secret-token" });
  });

  it("accepts loopback http for local development", () => {
    expect(normalizeApiSettings({ serverUrl: "http://127.0.0.1:3119", token: "t" })).toEqual({
      baseUrl: "http://127.0.0.1:3119",
      token: "t",
    });
  });

  it("rejects non-http protocols and embedded credentials", () => {
    expect(() =>
      normalizeApiSettings({ serverUrl: "ftp://translator.example", token: "t" }),
    ).toThrow(/http or https/u);
    expect(() =>
      normalizeApiSettings({ serverUrl: "https://user:pw@translator.example", token: "t" }),
    ).toThrow(/http or https/u);
  });

  it("rejects blank or whitespace tokens", () => {
    expect(() =>
      normalizeApiSettings({ serverUrl: "https://translator.example", token: "  " }),
    ).toThrow(/token is required/u);
    expect(() =>
      normalizeApiSettings({ serverUrl: "https://translator.example", token: "a b" }),
    ).toThrow(/token is required/u);
  });
});

describe("createTranslatorClient", () => {
  it("posts to /translate with the bearer token", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({ glossaryTerms: 0, model: "gpt-5.6-luna", target: "KO", text: "안녕" }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
    );
    const client = createTranslatorClient({
      baseUrl: "https://translator.example/",
      fetch,
      token: "secret-token",
    });

    const { data } = await client.POST("/translate", {
      body: { target: "KO", text: "hello" },
    });

    expect(data?.text).toBe("안녕");
    const [input] = fetch.mock.calls[0] ?? [];
    expect(input).toBeInstanceOf(Request);
    const request = input as Request;
    expect(request.url).toBe("https://translator.example/translate");
    expect(request.method).toBe("POST");
    expect(request.headers.get("Authorization")).toBe("Bearer secret-token");
  });
});
