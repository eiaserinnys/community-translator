import { describe, expect, it, vi } from "vitest";

import {
  buildCodexExecInvocation,
  CodexEphemeralExecutionError,
  CodexEphemeralExecutor,
  CODEX_REASONING_EFFORTS,
  parseCodexJsonl,
  type CodexExecProcessPort,
} from "./codex-executor.js";

function jsonl(text: string): string {
  return [
    JSON.stringify({ type: "thread.started" }),
    JSON.stringify({ item: { text, type: "agent_message" }, type: "item.completed" }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 12, output_tokens: 3 } }),
    "",
  ].join("\n");
}

describe("CODEX_REASONING_EFFORTS", () => {
  it("matches the values the codex CLI accepts", () => {
    expect([...CODEX_REASONING_EFFORTS]).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
    expect(CODEX_REASONING_EFFORTS).not.toContain("max");
  });
});

describe("buildCodexExecInvocation", () => {
  it("spawns an ephemeral read-only run that reads the prompt from stdin", () => {
    const invocation = buildCodexExecInvocation({
      codexPath: "/usr/bin/codex",
      model: "gpt-5.6-luna",
      processEnv: { OPENAI_API_KEY: "leak", PATH: "/usr/bin" },
      reasoningEffort: "xhigh",
      workspaceDir: "/tmp/ct-abc",
    });

    expect(invocation.args).toEqual([
      "exec",
      "--ephemeral",
      "--json",
      "--ignore-rules",
      "--ignore-user-config",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--model",
      "gpt-5.6-luna",
      "--cd",
      "/tmp/ct-abc",
      "--config",
      'model_reasoning_effort="xhigh"',
      "-",
    ]);
    expect(invocation.command).toBe("/usr/bin/codex");
    expect(invocation.cwd).toBe("/tmp/ct-abc");
    expect(invocation.env).toEqual({ PATH: "/usr/bin" });
  });
});

describe("parseCodexJsonl", () => {
  it("takes the completed agent message and the turn usage", () => {
    expect(parseCodexJsonl(jsonl("  안녕하세요  "))).toEqual({
      content: "안녕하세요",
      usage: { input_tokens: 12, output_tokens: 3 },
    });
  });

  it("rejects output with no completed agent message", () => {
    expect(() => parseCodexJsonl(JSON.stringify({ type: "thread.started" }))).toThrow(
      /no completed agent message/u,
    );
  });

  it("rejects malformed JSONL", () => {
    expect(() => parseCodexJsonl("{not json}")).toThrow(/invalid JSONL/u);
  });
});

describe("CodexEphemeralExecutor", () => {
  const request = {
    concurrencyLimit: 1,
    maxAttempts: 1,
    model: "gpt-5.6-luna",
    prompt: "translate this",
    reasoningEffort: "xhigh" as const,
    timeoutMs: 1_000,
  };

  it("returns the agent message and forwards the prompt on stdin", async () => {
    const execute = vi.fn(async () => ({ stderr: "", stdout: jsonl("Hello") }));
    const executor = new CodexEphemeralExecutor({
      codexPath: "/usr/bin/codex",
      processPort: { execute } as CodexExecProcessPort,
      processEnv: { PATH: "/usr/bin" },
    });

    const result = await executor.generate(request);

    expect(result.content).toBe("Hello");
    expect(result.model).toBe("gpt-5.6-luna");
    expect(execute.mock.calls[0]?.[1]).toBe("translate this");
  });

  it("reports CODEX_UNAVAILABLE when no codex path was resolved", async () => {
    const executor = new CodexEphemeralExecutor({ codexPath: undefined });
    await expect(executor.generate(request)).rejects.toMatchObject({
      code: "CODEX_UNAVAILABLE",
      name: "CodexEphemeralExecutionError",
    });
  });

  it("classifies a failing attempt and keeps the error code", async () => {
    const executor = new CodexEphemeralExecutor({
      codexPath: "/usr/bin/codex",
      processPort: {
        execute: async () => {
          throw new Error("boom");
        },
      },
      processEnv: {},
    });

    const failure = await executor.generate(request).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CodexEphemeralExecutionError);
    expect((failure as CodexEphemeralExecutionError).code).toBe("CODEX_EXEC_FAILED");
  });

  it("never runs more spawns at once than the configured limit", async () => {
    let active = 0;
    let peak = 0;
    const executor = new CodexEphemeralExecutor({
      codexPath: "/usr/bin/codex",
      processPort: {
        execute: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return { stderr: "", stdout: jsonl("ok") };
        },
      },
      processEnv: {},
    });

    await Promise.all(
      Array.from({ length: 6 }, () => executor.generate({ ...request, concurrencyLimit: 2 })),
    );

    expect(peak).toBe(2);
  });

  it("admits waiting spawns in FIFO order", async () => {
    const started: number[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const executor = new CodexEphemeralExecutor({
      codexPath: "/usr/bin/codex",
      processPort: {
        execute: async (_invocation, prompt) => {
          started.push(Number(prompt));
          if (started.length === 1) {
            await gate;
          }
          return { stderr: "", stdout: jsonl("ok") };
        },
      },
      processEnv: {},
    });

    const runs = [1, 2, 3, 4].map((index) =>
      executor.generate({ ...request, concurrencyLimit: 1, prompt: String(index) }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    release?.();
    await Promise.all(runs);

    expect(started).toEqual([1, 2, 3, 4]);
  });
});
