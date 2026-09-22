import { describe, expect, it } from "vitest";

import {
  BLOCKED_CHILD_PROCESS_API_KEYS,
  findBlockedChildProcessEnvKeys,
  sanitizeChildProcessEnv,
} from "./child-env.js";

describe("sanitizeChildProcessEnv", () => {
  it("removes billing-switch API keys from the child environment", () => {
    const sanitized = sanitizeChildProcessEnv({
      ANTHROPIC_API_KEY: "sk-ant-should-not-reach-codex",
      OPENAI_API_KEY: "sk-should-not-reach-codex",
      PATH: "/usr/bin",
    });

    expect(sanitized).toEqual({ PATH: "/usr/bin" });
  });

  it("drops undefined values instead of forwarding them", () => {
    expect(sanitizeChildProcessEnv({ HOME: "/home/eias", MISSING: undefined })).toEqual({
      HOME: "/home/eias",
    });
  });

  it("blocks both provider keys", () => {
    expect([...BLOCKED_CHILD_PROCESS_API_KEYS].sort()).toEqual([
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
    ]);
  });
});

describe("findBlockedChildProcessEnvKeys", () => {
  it("reports which blocked keys are present so startup can warn once", () => {
    expect(findBlockedChildProcessEnvKeys({ OPENAI_API_KEY: "x" })).toEqual(["OPENAI_API_KEY"]);
    expect(findBlockedChildProcessEnvKeys({ PATH: "/usr/bin" })).toEqual([]);
  });
});
