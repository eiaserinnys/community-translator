import {
  readerFacingMessage,
  type components,
  type TranslationFailureCode,
} from "@community-translator/contracts";

import type { TranslatedSite } from "./site.js";

type TranslationTarget = components["schemas"]["TranslationTarget"];
type TranslationTone = components["schemas"]["TranslationTone"];

export interface SettingsRequest {
  readonly type: "settings";
}

export interface TranslateRequest {
  readonly site: TranslatedSite;
  readonly target: TranslationTarget;
  readonly text: string;
  readonly tone?: TranslationTone | undefined;
  readonly type: "translate";
}

export interface CacheStatsRequest {
  readonly type: "cacheStats";
}

export interface ClearCacheRequest {
  readonly type: "clearCache";
}

export type ExtensionRequest =
  | CacheStatsRequest
  | ClearCacheRequest
  | SettingsRequest
  | TranslateRequest;

/** What a content script needs to know, without ever seeing the server token. */
export interface SettingsSnapshot {
  readonly autoPreview: boolean;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly tone: TranslationTone;
}

export interface FailureResponse {
  readonly code: TranslationFailureCode;
  readonly message: string;
  readonly ok: false;
}

export type SettingsResponse = ({ readonly ok: true } & SettingsSnapshot) | FailureResponse;
export type TranslateResponse = { readonly ok: true; readonly text: string } | FailureResponse;
export type CacheStatsResponse =
  | { readonly bytes: number; readonly count: number; readonly ok: true }
  | FailureResponse;
export type ClearCacheResponse = { readonly ok: true } | FailureResponse;

export function failureResponse(
  code: TranslationFailureCode,
  serverMessage?: string | undefined,
): FailureResponse {
  return { code, message: readerFacingMessage(code, serverMessage), ok: false };
}

export function isTranslateRequest(value: unknown): value is TranslateRequest {
  return isRecord(value) && value.type === "translate" && typeof value.text === "string";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
