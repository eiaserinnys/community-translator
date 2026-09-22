import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  CLIENT_ERROR_CODES,
  isTranslationErrorCode,
  readerFacingMessage,
  SERVER_ERROR_CODES,
  TRANSLATION_FAILURE_MESSAGES,
  translationFailureMessage,
} from "./messages.js";

async function readOpenApiErrorCodes(): Promise<string[]> {
  const schema = await readFile(new URL("../openapi.yaml", import.meta.url), "utf8");
  const section = /ErrorResponse:[\s\S]*?enum:\n((?:\s+- .+\n)+)/u.exec(schema);
  if (!section?.[1]) {
    throw new Error("openapi.yaml no longer declares an ErrorResponse code enum.");
  }
  return section[1]
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/u, "").trim())
    .filter((value) => value.length > 0);
}

describe("translation failure messages", () => {
  it("covers exactly the error codes declared in openapi.yaml", async () => {
    const declared = await readOpenApiErrorCodes();
    expect([...SERVER_ERROR_CODES].sort()).toEqual([...declared].sort());
  });

  it("gives every code a non-empty Korean sentence", () => {
    const codes = [...SERVER_ERROR_CODES, ...CLIENT_ERROR_CODES];
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const message = translationFailureMessage(code);
      expect(message.trim().length).toBeGreaterThan(0);
      expect(message).toMatch(/[가-힣]/u);
    }
  });

  it("keeps server and client code namespaces disjoint", () => {
    const overlap = CLIENT_ERROR_CODES.filter((code) =>
      (SERVER_ERROR_CODES as readonly string[]).includes(code),
    );
    expect(overlap).toEqual([]);
    expect(Object.keys(TRANSLATION_FAILURE_MESSAGES)).toHaveLength(
      SERVER_ERROR_CODES.length + CLIENT_ERROR_CODES.length,
    );
  });

  it("recognizes only wire error codes", () => {
    expect(isTranslationErrorCode("unauthorized")).toBe(true);
    expect(isTranslationErrorCode("not_configured")).toBe(false);
    expect(isTranslationErrorCode(42)).toBe(false);
  });
});

describe("readerFacingMessage", () => {
  it("prefers the sentence the server sent", () => {
    expect(readerFacingMessage("translation_failed", "서버가 보낸 문구")).toBe("서버가 보낸 문구");
  });

  it("falls back to the shared table when the server never answered", () => {
    expect(readerFacingMessage("server_unreachable", undefined)).toBe(
      translationFailureMessage("server_unreachable"),
    );
    expect(readerFacingMessage("translation_failed", "   ")).toBe(
      translationFailureMessage("translation_failed"),
    );
  });
});
