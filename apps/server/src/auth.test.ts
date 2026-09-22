import { describe, expect, it } from "vitest";

import { BearerTokenVerifier } from "./auth.js";

describe("BearerTokenVerifier", () => {
  const verifier = new BearerTokenVerifier("expected-token");

  it("accepts the configured token", () => {
    expect(verifier.accepts("Bearer expected-token")).toBe(true);
    expect(verifier.accepts("bearer expected-token")).toBe(true);
  });

  it("rejects a wrong, missing or malformed header", () => {
    expect(verifier.accepts("Bearer wrong-token")).toBe(false);
    expect(verifier.accepts("expected-token")).toBe(false);
    expect(verifier.accepts("Bearer ")).toBe(false);
    expect(verifier.accepts(undefined)).toBe(false);
  });

  it("refuses to be constructed without a token", () => {
    expect(() => new BearerTokenVerifier("")).toThrow(/token is required/u);
  });
});
