import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sanitizeChildProcessEnv } from "./child-env.js";

/** The reasoning efforts codex 0.153.x accepts. There is no "max". */
export const CODEX_REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"] as const;

export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];

export type CodexEphemeralErrorCode =
  | "CODEX_UNAVAILABLE"
  | "CODEX_TIMEOUT"
  | "CODEX_INVALID_OUTPUT"
  | "CODEX_QUOTA_EXHAUSTED"
  | "CODEX_TURN_FAILED"
  | "CODEX_EXEC_FAILED";

export interface CodexEphemeralUsage {
  readonly input_tokens?: number;
  readonly cached_input_tokens?: number;
  readonly output_tokens?: number;
  readonly reasoning_output_tokens?: number;
}

export interface CodexExecInvocation {
  readonly command: string;
  readonly args: string[];
  readonly env: Record<string, string>;
  readonly cwd: string;
}

export interface CodexExecOutput {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CodexExecProcessPort {
  execute(
    invocation: CodexExecInvocation,
    prompt: string,
    timeoutMs: number,
  ): Promise<CodexExecOutput>;
}

export interface CodexExecGenerateRequest {
  readonly prompt: string;
  readonly model: string;
  readonly reasoningEffort: CodexReasoningEffort;
  readonly timeoutMs: number;
  readonly concurrencyLimit: number;
}

export interface CodexExecGenerateResult {
  readonly content: string;
  readonly model: string;
  readonly latencyMs: number;
  readonly spawnDurationMs: number;
  readonly peakConcurrentSpawns: number;
  readonly usage?: CodexEphemeralUsage;
}

export interface CodexEphemeralExecutorOptions {
  readonly codexPath?: string | undefined;
  readonly processPort?: CodexExecProcessPort;
  readonly processEnv?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
  readonly nowMs?: () => number;
}

export interface CodexExecutionMetrics {
  readonly attempts: number;
  readonly latencyMs: number;
  readonly spawnDurationMs: number;
  readonly peakConcurrentSpawns: number;
}

export class CodexEphemeralExecutionError extends Error {
  constructor(
    readonly code: CodexEphemeralErrorCode,
    message: string,
    readonly metrics: CodexExecutionMetrics,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CodexEphemeralExecutionError";
  }
}

export class CodexAttemptError extends Error {
  constructor(
    readonly code: CodexEphemeralErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CodexAttemptError";
  }
}

export function buildCodexExecInvocation(params: {
  readonly codexPath: string;
  readonly workspaceDir: string;
  readonly model: string;
  readonly reasoningEffort: CodexReasoningEffort;
  readonly processEnv: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
}): CodexExecInvocation {
  return {
    command: params.codexPath,
    args: [
      "exec",
      "--ephemeral",
      "--json",
      "--ignore-rules",
      "--ignore-user-config",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--model",
      params.model,
      "--cd",
      params.workspaceDir,
      "--config",
      `model_reasoning_effort="${params.reasoningEffort}"`,
      // A bare dash makes codex read the prompt from stdin, so message text never
      // reaches an argv that could land in a process listing.
      "-",
    ],
    env: sanitizeChildProcessEnv(params.processEnv),
    cwd: params.workspaceDir,
  };
}

/**
 * Observed on codex 0.153.4 when the ChatGPT plan runs out of credits. codex exits 1
 * with an empty stderr, so this sentence in the JSONL is the only evidence there is.
 */
const QUOTA_EXHAUSTED_PATTERN = /usage limit/iu;

export function parseCodexJsonl(stdout: string): {
  readonly content: string;
  readonly usage?: CodexEphemeralUsage;
} {
  let content = "";
  let usage: CodexEphemeralUsage | undefined;
  let turnFailure: string | undefined;

  try {
    for (const line of stdout.split(/\r?\n/u)) {
      if (line.trim().length === 0) continue;
      const event = JSON.parse(line) as Record<string, unknown>;
      if (
        event.type === "item.completed" &&
        isRecord(event.item) &&
        event.item.type === "agent_message" &&
        typeof event.item.text === "string"
      ) {
        content = event.item.text;
      }
      if (event.type === "turn.completed" && isRecord(event.usage)) {
        usage = pickUsage(event.usage);
      }
      turnFailure ??= readFailureMessage(event);
    }
  } catch (error) {
    throw new CodexAttemptError("CODEX_INVALID_OUTPUT", "codex exec produced invalid JSONL", error);
  }

  // A reported turn failure outranks any partial message: codex knows why it stopped
  // and that reason is what the operator needs to see.
  if (turnFailure !== undefined) {
    throw new CodexAttemptError(
      QUOTA_EXHAUSTED_PATTERN.test(turnFailure) ? "CODEX_QUOTA_EXHAUSTED" : "CODEX_TURN_FAILED",
      turnFailure,
    );
  }
  if (content.trim().length === 0) {
    throw new CodexAttemptError(
      "CODEX_INVALID_OUTPUT",
      "codex exec produced no completed agent message",
    );
  }
  return usage === undefined ? { content: content.trim() } : { content: content.trim(), usage };
}

function readFailureMessage(event: Record<string, unknown>): string | undefined {
  if (event.type === "error" && typeof event.message === "string") {
    return event.message;
  }
  if (event.type === "turn.failed" && isRecord(event.error) && typeof event.error.message === "string") {
    return event.error.message;
  }
  return undefined;
}

export class NodeCodexExecProcess implements CodexExecProcessPort {
  execute(
    invocation: CodexExecInvocation,
    prompt: string,
    timeoutMs: number,
  ): Promise<CodexExecOutput> {
    return new Promise((resolve, reject) => {
      const child = spawn(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        env: invocation.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        const unavailable = (error as NodeJS.ErrnoException).code === "ENOENT";
        reject(
          new CodexAttemptError(
            unavailable ? "CODEX_UNAVAILABLE" : "CODEX_EXEC_FAILED",
            unavailable
              ? `codex executable is unavailable: ${invocation.command}`
              : `codex exec failed to start: ${error.message}`,
            error,
          ),
        );
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new CodexAttemptError("CODEX_TIMEOUT", `codex exec timed out after ${timeoutMs}ms`));
          return;
        }
        // A non-zero exit is reported, not thrown: codex writes the reason for a
        // failed turn to stdout and leaves stderr empty, so the caller must still
        // get a chance to read that stream.
        resolve({ exitCode: code ?? 0, stderr, stdout });
      });
      child.stdin.end(prompt, "utf8");
    });
  }
}

export class CodexEphemeralExecutor {
  private readonly processPort: CodexExecProcessPort;
  private readonly nowMs: () => number;
  private readonly spawnLimiter = new CodexSpawnLimiter();

  constructor(private readonly options: CodexEphemeralExecutorOptions) {
    this.processPort = options.processPort ?? new NodeCodexExecProcess();
    this.nowMs = options.nowMs ?? Date.now;
  }

  async generate(request: CodexExecGenerateRequest): Promise<CodexExecGenerateResult> {
    const startedAt = this.nowMs();
    const codexPath = this.options.codexPath;
    if (!codexPath) {
      throw new CodexEphemeralExecutionError("CODEX_UNAVAILABLE", "Codex CLI path is unavailable", {
        attempts: 0,
        latencyMs: 0,
        peakConcurrentSpawns: 0,
        spawnDurationMs: 0,
      });
    }

    // Acquiring the permit is the first await, so callers queue in arrival order
    // instead of in whatever order their temp directories happen to be created.
    const permit = await this.spawnLimiter.acquire(request.concurrencyLimit);
    const peakConcurrentSpawns = permit.concurrentSpawns;
    const spawnStartedAt = this.nowMs();
    let workspaceDir: string | undefined;
    let failure: unknown;

    try {
      // Each run gets a throwaway working root so codex never reads or writes a
      // real checkout, and --ephemeral keeps no session file behind.
      workspaceDir = await mkdtemp(join(tmpdir(), "community-translator-codex-"));
      const result = await this.processPort.execute(
        buildCodexExecInvocation({
          codexPath,
          model: request.model,
          processEnv: this.options.processEnv ?? process.env,
          reasoningEffort: request.reasoningEffort,
          workspaceDir,
        }),
        request.prompt,
        request.timeoutMs,
      );
      const parsed = parseCodexOutput(result);
      const finishedAt = this.nowMs();
      return {
        content: parsed.content,
        latencyMs: Math.max(0, finishedAt - startedAt),
        model: request.model,
        peakConcurrentSpawns,
        spawnDurationMs: Math.max(0, finishedAt - spawnStartedAt),
        ...(parsed.usage === undefined ? {} : { usage: parsed.usage }),
      };
    } catch (error) {
      failure = error;
    } finally {
      if (workspaceDir !== undefined) {
        await rm(workspaceDir, { force: true, recursive: true });
      }
      permit.release();
    }

    const classified = classifyAttemptError(failure);
    const failedAt = this.nowMs();
    throw new CodexEphemeralExecutionError(
      classified.code,
      classified.message,
      {
        attempts: 1,
        latencyMs: Math.max(0, failedAt - startedAt),
        peakConcurrentSpawns,
        spawnDurationMs: Math.max(0, failedAt - spawnStartedAt),
      },
      failure,
    );
  }
}

type CodexSpawnPermit = {
  readonly concurrentSpawns: number;
  readonly release: () => void;
};

/** Admits waiting spawns in arrival order so no request is starved. */
class CodexSpawnLimiter {
  private activeSpawns = 0;
  private readonly waiters: Array<{
    readonly limit: number;
    readonly resolve: (permit: CodexSpawnPermit) => void;
  }> = [];

  async acquire(limit: number): Promise<CodexSpawnPermit> {
    if (this.waiters.length === 0 && this.activeSpawns < limit) {
      return this.grant();
    }
    return await new Promise<CodexSpawnPermit>((resolve) => {
      this.waiters.push({ limit, resolve });
      this.flush();
    });
  }

  private grant(): CodexSpawnPermit {
    this.activeSpawns += 1;
    const concurrentSpawns = this.activeSpawns;
    let released = false;
    return {
      concurrentSpawns,
      release: () => {
        if (released) return;
        released = true;
        this.activeSpawns -= 1;
        this.flush();
      },
    };
  }

  private flush(): void {
    while (this.waiters.length > 0) {
      const next = this.waiters[0];
      if (next === undefined || this.activeSpawns >= next.limit) return;
      this.waiters.shift();
      next.resolve(this.grant());
    }
  }
}

/**
 * Prefers the reason codex reported in its JSONL. The exit code is only used when
 * stdout explained nothing, since on its own it names no cause.
 */
function parseCodexOutput(result: CodexExecOutput): ReturnType<typeof parseCodexJsonl> {
  try {
    return parseCodexJsonl(result.stdout);
  } catch (error) {
    if (
      result.exitCode !== 0 &&
      error instanceof CodexAttemptError &&
      error.code === "CODEX_INVALID_OUTPUT"
    ) {
      throw new CodexAttemptError(
        "CODEX_EXEC_FAILED",
        `codex exec exited ${result.exitCode} without a reported reason: ${result.stderr.slice(-500)}`,
        error,
      );
    }
    throw error;
  }
}

function classifyAttemptError(error: unknown): {
  readonly code: CodexEphemeralErrorCode;
  readonly message: string;
} {
  if (error instanceof CodexAttemptError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "CODEX_EXEC_FAILED",
    message: error instanceof Error ? error.message : "codex exec failed",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pickUsage(value: Record<string, unknown>): CodexEphemeralUsage | undefined {
  const usage: Record<string, number> = {};
  for (const field of [
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
  ]) {
    const tokenCount = value[field];
    if (typeof tokenCount === "number") usage[field] = tokenCount;
  }
  return Object.keys(usage).length === 0 ? undefined : (usage as CodexEphemeralUsage);
}
