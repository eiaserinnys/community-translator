import type { components } from "./generated.js";

/** Error codes the translation server can put on the wire. Canonical in openapi.yaml. */
export type TranslationErrorCode = components["schemas"]["ErrorResponse"]["code"];

/** Failures the extension detects on its own; these never travel over the wire. */
export const CLIENT_ERROR_CODES = [
  "empty_text",
  "extension_reloaded",
  "not_configured",
  "server_unreachable",
  "site_disabled",
  "text_too_long",
  "unsupported_target",
] as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type TranslationFailureCode = ClientErrorCode | TranslationErrorCode;

// A Record keyed by the generated enum: adding a code to openapi.yaml without a
// Korean sentence here fails typecheck, so the wire contract and the reader-facing
// text cannot drift apart.
const SERVER_MESSAGES: Record<TranslationErrorCode, string> = {
  invalid_request: "번역 요청을 처리할 수 없어요. 문장이 너무 길거나 형식이 맞지 않습니다.",
  translation_busy: "번역 요청이 몰려 있어요. 잠시 후 다시 시도해 주세요.",
  translation_failed: "번역 서버가 결과를 만들지 못했어요. 다시 시도해 주세요.",
  translation_timeout: "번역 시간이 초과됐어요. 다시 시도해 주세요.",
  translation_unavailable: "번역 서버에서 codex 실행 파일을 찾지 못했어요. 서버 설정을 확인해 주세요.",
  unauthorized: "서버 토큰이 맞지 않아요. 확장 설정에서 토큰을 확인해 주세요.",
};

const CLIENT_MESSAGES: Record<ClientErrorCode, string> = {
  empty_text: "번역할 문장이 없어요.",
  extension_reloaded: "확장이 업데이트됐어요. 페이지를 새로고침해 주세요.",
  not_configured: "확장 설정에서 번역 서버 주소와 토큰을 입력해 주세요.",
  server_unreachable: "번역 서버에 연결하지 못했어요. 서버 주소와 서버 상태를 확인해 주세요.",
  site_disabled: "이 사이트의 번역이 꺼져 있어요.",
  text_too_long: "한 번에 5,000자까지 번역할 수 있어요.",
  unsupported_target: "지원하지 않는 언어예요.",
};

export const TRANSLATION_FAILURE_MESSAGES: Record<TranslationFailureCode, string> = {
  ...SERVER_MESSAGES,
  ...CLIENT_MESSAGES,
};

/** Derived from the message table so the runtime list has no second source. */
export const SERVER_ERROR_CODES: readonly TranslationErrorCode[] = Object.keys(
  SERVER_MESSAGES,
) as TranslationErrorCode[];

const SERVER_ERROR_CODE_SET = new Set<string>(SERVER_ERROR_CODES);

export function isTranslationErrorCode(value: unknown): value is TranslationErrorCode {
  return typeof value === "string" && SERVER_ERROR_CODE_SET.has(value);
}

export function translationFailureMessage(code: TranslationFailureCode): string {
  return TRANSLATION_FAILURE_MESSAGES[code];
}

/**
 * The extension shows the server sentence when there is one, and falls back to the
 * shared table for codes it produced itself.
 */
export function readerFacingMessage(
  code: TranslationFailureCode,
  serverMessage?: string | undefined,
): string {
  const trimmed = serverMessage?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : translationFailureMessage(code);
}
