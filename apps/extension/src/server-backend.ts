import {
  createTranslatorClient,
  isTranslationErrorCode,
  readerFacingMessage,
  translationFailureMessage,
} from "@community-translator/contracts";

import type {
  TranslationBackend,
  TranslationBackendRequest,
  TranslationBackendResult,
} from "./translation-service.js";

export interface ServerSettings {
  readonly serverUrl: string;
  readonly token: string;
}

interface ServerErrorBody {
  code?: unknown;
  message?: unknown;
}

export function createServerBackend(
  settings: ServerSettings,
  fetch?: typeof globalThis.fetch,
): TranslationBackend {
  return {
    async translate(request: TranslationBackendRequest): Promise<TranslationBackendResult> {
      let client: ReturnType<typeof createTranslatorClient>;
      try {
        client = createTranslatorClient({
          baseUrl: settings.serverUrl,
          token: settings.token,
          ...(fetch ? { fetch } : {}),
        });
      } catch {
        // A malformed address is a settings problem, not a server problem.
        return failure("not_configured");
      }

      try {
        const { data, error, response } = await client.POST("/translate", {
          body: {
            target: request.target,
            text: request.text,
            ...(request.site === undefined ? {} : { site: request.site }),
            ...(request.tone === undefined ? {} : { tone: request.tone }),
          },
        });

        if (response.status === 200 && typeof data?.text === "string" && data.text.length > 0) {
          return { ok: true, text: data.text };
        }
        return serverFailure(error as ServerErrorBody | undefined);
      } catch {
        // fetch only rejects when the request never got an answer.
        return failure("server_unreachable");
      }
    },
  };
}

function serverFailure(body: ServerErrorBody | undefined): TranslationBackendResult {
  // An unrecognised code is treated as a generic failure rather than shown as-is:
  // the reader must never be handed a sentence this build cannot vouch for.
  const code = isTranslationErrorCode(body?.code) ? body.code : "translation_failed";
  const message = typeof body?.message === "string" ? body.message : undefined;
  return { code, message: readerFacingMessage(code, message), ok: false };
}

function failure(code: "not_configured" | "server_unreachable"): TranslationBackendResult {
  return { code, message: translationFailureMessage(code), ok: false };
}
