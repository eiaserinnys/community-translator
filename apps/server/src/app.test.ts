import { translationFailureMessage } from "@community-translator/contracts";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "./app.js";
import { TranslationFailure, type Translator } from "./translator.js";

const BEARER = "test-token";

function appWith(translate: Translator["translate"]) {
  return buildApp({ bearerToken: BEARER, translator: { translate } });
}

function okTranslator() {
  return vi.fn<Translator["translate"]>(async () => ({
    glossaryTerms: 2,
    model: "gpt-5.6-luna",
    text: "안녕하세요",
  }));
}

describe("GET /health", () => {
  it("answers without a token", async () => {
    const response = await appWith(okTranslator()).inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("POST /translate", () => {
  it("rejects a request with no bearer token", async () => {
    const response = await appWith(okTranslator()).inject({
      method: "POST",
      payload: { target: "KO", text: "hello" },
      url: "/translate",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "unauthorized",
      message: translationFailureMessage("unauthorized"),
    });
  });

  it("rejects a wrong bearer token", async () => {
    const response = await appWith(okTranslator()).inject({
      headers: { authorization: "Bearer nope" },
      method: "POST",
      payload: { target: "KO", text: "hello" },
      url: "/translate",
    });
    expect(response.statusCode).toBe(401);
  });

  it("translates an authorized request and passes tone and site through", async () => {
    const translate = okTranslator();
    const response = await appWith(translate).inject({
      headers: { authorization: `Bearer ${BEARER}` },
      method: "POST",
      payload: { site: "discord", target: "EN-US", text: "안녕", tone: "casual" },
      url: "/translate",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      glossaryTerms: 2,
      model: "gpt-5.6-luna",
      target: "EN-US",
      text: "안녕하세요",
    });
    expect(translate).toHaveBeenCalledWith({
      site: "discord",
      target: "EN-US",
      text: "안녕",
      tone: "casual",
    });
  });

  it.each([
    ["empty text", { target: "KO", text: "   " }],
    ["text over 5000 characters", { target: "KO", text: "a".repeat(5001) }],
    ["an unsupported target", { target: "JA", text: "hello" }],
    ["an unsupported tone", { target: "EN-US", text: "안녕", tone: "shouty" }],
    ["an unknown field", { extra: true, target: "KO", text: "hello" }],
    ["a missing target", { text: "hello" }],
  ])("rejects %s", async (_name, payload) => {
    const translate = okTranslator();
    const response = await appWith(translate).inject({
      headers: { authorization: `Bearer ${BEARER}` },
      method: "POST",
      payload,
      url: "/translate",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_request",
      message: translationFailureMessage("invalid_request"),
    });
    expect(translate).not.toHaveBeenCalled();
  });

  it("accepts a request of exactly 5000 characters", async () => {
    const response = await appWith(okTranslator()).inject({
      headers: { authorization: `Bearer ${BEARER}` },
      method: "POST",
      payload: { target: "KO", text: "a".repeat(5000) },
      url: "/translate",
    });
    expect(response.statusCode).toBe(200);
  });

  it("turns a translation failure into a reader-facing sentence", async () => {
    const response = await appWith(async () => {
      throw new TranslationFailure("translation_timeout");
    }).inject({
      headers: { authorization: `Bearer ${BEARER}` },
      method: "POST",
      payload: { target: "KO", text: "hello" },
      url: "/translate",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: "translation_timeout",
      message: translationFailureMessage("translation_timeout"),
    });
  });

  it("never leaks an unexpected error message to the reader", async () => {
    const app = appWith(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432 secret-detail");
    });
    const response = await app.inject({
      headers: { authorization: `Bearer ${BEARER}` },
      method: "POST",
      payload: { target: "KO", text: "hello" },
      url: "/translate",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: "translation_failed",
      message: translationFailureMessage("translation_failed"),
    });
    expect(response.body).not.toContain("ECONNREFUSED");
  });
});

describe("extension CORS", () => {
  it("allows the preflight from a chrome extension origin", async () => {
    const response = await appWith(okTranslator()).inject({
      headers: { origin: "chrome-extension://abcdefghijklmnop" },
      method: "OPTIONS",
      url: "/translate",
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "chrome-extension://abcdefghijklmnop",
    );
    expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
  });

  it("does not hand CORS access to an arbitrary web origin", async () => {
    const response = await appWith(okTranslator()).inject({
      headers: { origin: "https://evil.example" },
      method: "GET",
      url: "/health",
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
