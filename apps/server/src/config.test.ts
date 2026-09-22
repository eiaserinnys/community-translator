import { describe, expect, it } from "vitest";

import { loadServerConfig } from "./config.js";

const environment = {
  HOST: "127.0.0.1",
  PORT: "3120",
  TRANSLATOR_BEARER_TOKEN: "a-private-token",
  TRANSLATOR_CODEX_CONCURRENCY: "2",
  TRANSLATOR_CODEX_MODEL: "gpt-5.6-luna",
  TRANSLATOR_CODEX_QUEUE_LIMIT: "32",
  TRANSLATOR_CODEX_REASONING_EFFORT: "xhigh",
  TRANSLATOR_CODEX_TIMEOUT_MS: "120000",
  TRANSLATOR_GLOSSARY_FILE: "/home/eias/services/community-translator/shared/glossary.yaml",
};

describe("loadServerConfig", () => {
  it("reads every runtime value from the environment", () => {
    expect(loadServerConfig(environment)).toEqual({
      bearerToken: "a-private-token",
      codex: {
        concurrency: 2,
        model: "gpt-5.6-luna",
        queueLimit: 32,
        reasoningEffort: "xhigh",
        timeoutMs: 120_000,
      },
      glossaryFile: "/home/eias/services/community-translator/shared/glossary.yaml",
      host: "127.0.0.1",
      port: 3120,
    });
  });

  it("fails loudly instead of inventing a default", () => {
    for (const key of Object.keys(environment)) {
      const incomplete = { ...environment, [key]: undefined };
      expect(() => loadServerConfig(incomplete), `${key} must be required`).toThrow();
    }
  });

  it("rejects a reasoning effort codex does not implement", () => {
    expect(() =>
      loadServerConfig({ ...environment, TRANSLATOR_CODEX_REASONING_EFFORT: "max" }),
    ).toThrow();
  });

  it("rejects a bearer token containing whitespace", () => {
    expect(() =>
      loadServerConfig({ ...environment, TRANSLATOR_BEARER_TOKEN: "two words" }),
    ).toThrow();
  });

  it("rejects a non-positive concurrency limit", () => {
    expect(() => loadServerConfig({ ...environment, TRANSLATOR_CODEX_CONCURRENCY: "0" })).toThrow();
  });
});
