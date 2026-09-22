import {
  translationFailureMessage,
  type components,
  type TranslationFailureCode,
} from "@community-translator/contracts";

import { translationCacheKey, type TranslationCache } from "./cache.js";
import { isTranslatableLength, MAX_TRANSLATION_LENGTH } from "./language.js";
import type { TranslatedSite } from "./site.js";

type TranslationTarget = components["schemas"]["TranslationTarget"];
type TranslationTone = components["schemas"]["TranslationTone"];

export interface TranslationBackendRequest {
  readonly site?: TranslatedSite | undefined;
  readonly target: TranslationTarget;
  readonly text: string;
  readonly tone?: TranslationTone | undefined;
}

export type TranslationBackendResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly code: TranslationFailureCode;
      readonly message: string;
      readonly ok: false;
    };

export interface TranslationBackend {
  translate(request: TranslationBackendRequest): Promise<TranslationBackendResult>;
}

/** Carries a sentence that is already fit to show the reader. */
export class TranslationDisplayError extends Error {
  constructor(
    readonly code: TranslationFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "TranslationDisplayError";
  }
}

export interface TranslationServiceOptions {
  readonly backend: TranslationBackend;
  readonly cache: TranslationCache;
}

export class TranslationService {
  private generation = 0;
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly options: TranslationServiceOptions) {}

  /**
   * Invalidates in-flight work. A request made after a settings change must not be
   * answered by a translation that was already on its way under the old settings.
   */
  clear(): void {
    this.generation += 1;
    this.pending.clear();
  }

  async translate(request: TranslationBackendRequest, cacheDays: number): Promise<string> {
    if (request.text.trim().length === 0) {
      throw displayError("empty_text");
    }
    if (!isTranslatableLength(request.text)) {
      throw displayError(request.text.length > MAX_TRANSLATION_LENGTH ? "text_too_long" : "empty_text");
    }

    const dedupeKey = JSON.stringify([
      this.generation,
      request.target,
      request.tone ?? "",
      request.text,
    ]);
    const inFlight = this.pending.get(dedupeKey);
    if (inFlight) return inFlight;

    const job = this.run(request, cacheDays);
    this.pending.set(dedupeKey, job);
    try {
      return await job;
    } finally {
      // Only drop the entry if it is still ours; clear() may have replaced it.
      if (this.pending.get(dedupeKey) === job) {
        this.pending.delete(dedupeKey);
      }
    }
  }

  private async run(request: TranslationBackendRequest, cacheDays: number): Promise<string> {
    const key = await translationCacheKey(request);

    if (cacheDays > 0) {
      const cached = await this.options.cache.get(key, cacheDays).catch(() => null);
      if (cached !== null) return cached;
    }

    const result = await this.options.backend.translate(request);
    if (!result.ok) {
      // A failure is never cached: the next attempt may well succeed.
      throw new TranslationDisplayError(result.code, result.message);
    }

    if (cacheDays > 0) {
      await this.options.cache.put(key, result.text, cacheDays).catch(() => undefined);
    }
    return result.text;
  }
}

function displayError(code: TranslationFailureCode): TranslationDisplayError {
  return new TranslationDisplayError(code, translationFailureMessage(code));
}
