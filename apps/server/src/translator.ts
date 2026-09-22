import type { components, TranslationErrorCode } from "@community-translator/contracts";

import {
  CodexEphemeralExecutionError,
  type CodexExecGenerateRequest,
  type CodexExecGenerateResult,
  type CodexReasoningEffort,
} from "./codex-executor.js";
import { matchGlossaryEntries, type GlossaryEntry } from "./glossary.js";
import { buildTranslationPrompt } from "./prompt.js";

type TranslationTarget = components["schemas"]["TranslationTarget"];
type TranslationTone = components["schemas"]["TranslationTone"];
type TranslationSite = components["schemas"]["TranslationSite"];

/** A short message rarely needs more terms than this, and the prompt stays bounded. */
const MAX_GLOSSARY_TERMS = 40;

export interface TranslationRequest {
  readonly site?: TranslationSite | undefined;
  readonly target: TranslationTarget;
  readonly text: string;
  readonly tone?: TranslationTone | undefined;
}

export interface TranslationResult {
  readonly glossaryTerms: number;
  readonly model: string;
  readonly text: string;
}

export interface Translator {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}

export class TranslationFailure extends Error {
  constructor(
    readonly code: TranslationErrorCode,
    message?: string,
    cause?: unknown,
  ) {
    super(message ?? code, cause === undefined ? undefined : { cause });
    this.name = "TranslationFailure";
  }
}

export interface CodexExecutorPort {
  generate(request: CodexExecGenerateRequest): Promise<CodexExecGenerateResult>;
}

export interface CodexTranslatorOptions {
  readonly concurrency: number;
  readonly executor: CodexExecutorPort;
  readonly glossary: readonly GlossaryEntry[];
  readonly model: string;
  readonly queueLimit: number;
  readonly reasoningEffort: CodexReasoningEffort;
  readonly timeoutMs: number;
}

const CODEX_ERROR_CODES: Record<string, TranslationErrorCode> = {
  CODEX_EXEC_FAILED: "translation_failed",
  CODEX_INVALID_OUTPUT: "translation_failed",
  CODEX_QUOTA_EXHAUSTED: "translation_quota_exhausted",
  CODEX_TIMEOUT: "translation_timeout",
  CODEX_TURN_FAILED: "translation_failed",
  CODEX_UNAVAILABLE: "translation_unavailable",
};

export class CodexTranslator implements Translator {
  private inFlight = 0;

  constructor(private readonly options: CodexTranslatorOptions) {}

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    // Checked before the first await so a burst of readers gets a clear "busy"
    // answer instead of silently piling up behind the spawn limiter.
    const capacity = this.options.concurrency + this.options.queueLimit;
    if (this.inFlight >= capacity) {
      throw new TranslationFailure("translation_busy");
    }
    this.inFlight += 1;

    try {
      const glossary = matchGlossaryEntries(
        request.text,
        this.options.glossary,
        MAX_GLOSSARY_TERMS,
      );
      const prompt = buildTranslationPrompt({
        glossary,
        target: request.target,
        text: request.text,
        ...(request.site === undefined ? {} : { site: request.site }),
        ...(request.tone === undefined ? {} : { tone: request.tone }),
      });

      const result = await this.options.executor.generate({
        concurrencyLimit: this.options.concurrency,
        model: this.options.model,
        prompt,
        reasoningEffort: this.options.reasoningEffort,
        timeoutMs: this.options.timeoutMs,
      });

      const text = result.content.trim();
      if (text.length === 0) {
        throw new TranslationFailure("translation_failed", "codex returned an empty translation");
      }

      return { glossaryTerms: glossary.length, model: result.model, text };
    } catch (error) {
      throw toTranslationFailure(error);
    } finally {
      this.inFlight -= 1;
    }
  }
}

function toTranslationFailure(error: unknown): TranslationFailure {
  if (error instanceof TranslationFailure) {
    return error;
  }
  if (error instanceof CodexEphemeralExecutionError) {
    return new TranslationFailure(
      CODEX_ERROR_CODES[error.code] ?? "translation_failed",
      error.message,
      error,
    );
  }
  return new TranslationFailure(
    "translation_failed",
    error instanceof Error ? error.message : "translation failed",
    error,
  );
}
