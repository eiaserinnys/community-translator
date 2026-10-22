import { describe, expect, it } from "vitest";

import {
  CodexEphemeralExecutor,
  parseCodexJsonl,
  type CodexAttemptError,
  type CodexExecProcessPort,
} from "./codex-executor.js";

// Captured verbatim from codex-cli 0.153.4: exit code 1, empty stderr,
// the whole reason carried on stdout.
const QUOTA_MESSAGE =
  "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Sep 26th, 2026 5:23 PM.";

const QUOTA_STDOUT = [
  JSON.stringify({ thread_id: "01a0c886", type: "thread.started" }),
  JSON.stringify({ type: "turn.started" }),
  JSON.stringify({ message: QUOTA_MESSAGE, type: "error" }),
  JSON.stringify({ error: { message: QUOTA_MESSAGE }, type: "turn.failed" }),
  "",
].join("\n");

const OTHER_FAILURE_STDOUT = [
  JSON.stringify({ type: "turn.started" }),
  JSON.stringify({ error: { message: "model gpt-nope is not available" }, type: "turn.failed" }),
  "",
].join("\n");

function attemptErrorFrom(action: () => unknown): CodexAttemptError {
  try {
    action();
  } catch (error) {
    return error as CodexAttemptError;
  }
  throw new Error("expected the call to throw");
}

describe("parseCodexJsonl failure reporting", () => {
  it("recognises an exhausted ChatGPT usage limit", () => {
    const error = attemptErrorFrom(() => parseCodexJsonl(QUOTA_STDOUT));
    expect(error.code).toBe("CODEX_QUOTA_EXHAUSTED");
    expect(error.message).toContain("usage limit");
  });

  it("keeps any other reported turn failure and its reason", () => {
    const error = attemptErrorFrom(() => parseCodexJsonl(OTHER_FAILURE_STDOUT));
    expect(error.code).toBe("CODEX_TURN_FAILED");
    expect(error.message).toBe("model gpt-nope is not available");
  });

  it("still reports invalid output when codex explained nothing", () => {
    const error = attemptErrorFrom(() =>
      parseCodexJsonl(JSON.stringify({ type: "thread.started" })),
    );
    expect(error.code).toBe("CODEX_INVALID_OUTPUT");
  });
});

describe("CodexEphemeralExecutor on a non-zero exit", () => {
  function executorFor(output: { exitCode: number; stderr: string; stdout: string }) {
    const processPort: CodexExecProcessPort = { execute: async () => output };
    return new CodexEphemeralExecutor({
      codexPath: "/usr/bin/codex",
      processEnv: {},
      processPort,
    });
  }

  const request = {
    concurrencyLimit: 1,
    model: "gpt-5.6-luna",
    prompt: "hello",
    reasoningEffort: "xhigh" as const,
    timeoutMs: 1_000,
  };

  it("reads the reason out of stdout rather than reporting a bare exit code", async () => {
    const executor = executorFor({ exitCode: 1, stderr: "", stdout: QUOTA_STDOUT });

    await expect(executor.generate(request)).rejects.toMatchObject({
      code: "CODEX_QUOTA_EXHAUSTED",
    });
  });

  it("falls back to the exit code only when stdout explained nothing", async () => {
    const executor = executorFor({ exitCode: 137, stderr: "killed", stdout: "" });

    const failure = await executor.generate(request).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "CODEX_EXEC_FAILED" });
    expect((failure as Error).message).toContain("137");
  });

  it("still succeeds when codex exits cleanly", async () => {
    const executor = executorFor({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        item: { text: "안녕", type: "agent_message" },
        type: "item.completed",
      }),
    });

    await expect(executor.generate(request)).resolves.toMatchObject({ content: "안녕" });
  });
});
