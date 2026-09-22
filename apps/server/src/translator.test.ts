import { describe, expect, it, vi, type Mock } from "vitest";

import { CodexEphemeralExecutionError } from "./codex-executor.js";
import { CodexTranslator, TranslationFailure, type CodexExecutorPort } from "./translator.js";

const metrics = { attempts: 1, latencyMs: 1, peakConcurrentSpawns: 1, spawnDurationMs: 1 };

type ExecutorMock = { generate: Mock<CodexExecutorPort["generate"]> };

function generateResult(content: string) {
  return {
    content,
    latencyMs: 1,
    model: "gpt-5.6-luna",
    peakConcurrentSpawns: 1,
    spawnDurationMs: 1,
  };
}

function executorReturning(content: string): ExecutorMock {
  return { generate: vi.fn<CodexExecutorPort["generate"]>(async () => generateResult(content)) };
}

function buildTranslator(executor: ExecutorMock, overrides: Record<string, unknown> = {}) {
  return new CodexTranslator({
    concurrency: 2,
    executor,
    glossary: [{ en: "Fenrix Haven", kr: "펜릭스 헤이븐" }],
    model: "gpt-5.6-luna",
    queueLimit: 32,
    reasoningEffort: "xhigh",
    timeoutMs: 120_000,
    ...overrides,
  });
}

describe("CodexTranslator", () => {
  it("returns the model output and how many glossary terms it injected", async () => {
    const executor = executorReturning("펜릭스 헤이븐이 왔다");
    const translator = buildTranslator(executor);

    await expect(
      translator.translate({ target: "KO", text: "Fenrix Haven is here" }),
    ).resolves.toEqual({
      glossaryTerms: 1,
      model: "gpt-5.6-luna",
      text: "펜릭스 헤이븐이 왔다",
    });
  });

  it("passes the configured model, effort, timeout and concurrency to the executor", async () => {
    const executor = executorReturning("안녕");
    await buildTranslator(executor).translate({ target: "KO", text: "hello" });

    expect(executor.generate.mock.calls[0]?.[0]).toMatchObject({
      concurrencyLimit: 2,
      model: "gpt-5.6-luna",
      reasoningEffort: "xhigh",
      timeoutMs: 120_000,
    });
  });

  it("injects only the glossary terms the text mentions", async () => {
    const executor = executorReturning("안녕");
    const result = await buildTranslator(executor).translate({ target: "KO", text: "hello there" });

    expect(result.glossaryTerms).toBe(0);
    expect(executor.generate.mock.calls[0]?.[0].prompt).not.toContain("펜릭스 헤이븐");
  });

  it.each([
    ["CODEX_UNAVAILABLE", "translation_unavailable"],
    ["CODEX_TIMEOUT", "translation_timeout"],
    ["CODEX_QUOTA_EXHAUSTED", "translation_quota_exhausted"],
    ["CODEX_TURN_FAILED", "translation_failed"],
    ["CODEX_INVALID_OUTPUT", "translation_failed"],
    ["CODEX_EXEC_FAILED", "translation_failed"],
  ])("maps %s to %s", async (codexCode, expected) => {
    const executor: ExecutorMock = {
      generate: vi.fn<CodexExecutorPort["generate"]>(async () => {
        throw new CodexEphemeralExecutionError(codexCode as never, "codex said no", metrics);
      }),
    };

    const failure = await buildTranslator(executor)
      .translate({ target: "KO", text: "hello" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TranslationFailure);
    expect((failure as TranslationFailure).code).toBe(expected);
  });

  it("rejects an empty model answer instead of returning blank text", async () => {
    const executor = executorReturning("   ");
    const failure = await buildTranslator(executor)
      .translate({ target: "KO", text: "hello" })
      .catch((error: unknown) => error);

    expect((failure as TranslationFailure).code).toBe("translation_failed");
  });

  it("refuses new work once the queue is full", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const executor: ExecutorMock = {
      generate: vi.fn<CodexExecutorPort["generate"]>(async () => {
        await gate;
        return generateResult("안녕");
      }),
    };
    const translator = buildTranslator(executor, { concurrency: 1, queueLimit: 1 });

    const accepted = [
      translator.translate({ target: "KO", text: "one" }),
      translator.translate({ target: "KO", text: "two" }),
    ];
    const rejected = await translator
      .translate({ target: "KO", text: "three" })
      .catch((error: unknown) => error);

    expect((rejected as TranslationFailure).code).toBe("translation_busy");
    release?.();
    await Promise.all(accepted);

    await expect(translator.translate({ target: "KO", text: "four" })).resolves.toMatchObject({
      text: "안녕",
    });
  });
});
