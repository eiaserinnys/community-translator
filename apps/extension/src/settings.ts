import type { components } from "@community-translator/contracts";

import type { TranslatedSite } from "./site.js";

type TranslationTone = components["schemas"]["TranslationTone"];

export const TONES = ["casual", "neutral"] as const satisfies readonly TranslationTone[];
export const CACHE_DAY_OPTIONS = [0, 7, 30] as const;

export type CacheDays = (typeof CACHE_DAY_OPTIONS)[number];

export interface TranslatorSettings {
  autoPreview: boolean;
  cacheDays: CacheDays;
  discord: boolean;
  reddit: boolean;
  serverUrl: string;
  token: string;
  tone: TranslationTone;
  x: boolean;
}

/** Nothing is translated and nothing is sent anywhere until the reader opts in. */
export const DEFAULT_SETTINGS: TranslatorSettings = {
  autoPreview: false,
  cacheDays: 7,
  discord: false,
  reddit: false,
  serverUrl: "",
  token: "",
  tone: "casual",
  x: false,
};

export function normalizeStoredSettings(stored: Record<string, unknown>): TranslatorSettings {
  return {
    autoPreview: boolean(stored.autoPreview, DEFAULT_SETTINGS.autoPreview),
    cacheDays: cacheDays(stored.cacheDays),
    discord: boolean(stored.discord, DEFAULT_SETTINGS.discord),
    reddit: boolean(stored.reddit, DEFAULT_SETTINGS.reddit),
    serverUrl: text(stored.serverUrl, DEFAULT_SETTINGS.serverUrl),
    token: text(stored.token, DEFAULT_SETTINGS.token),
    tone: tone(stored.tone),
    x: boolean(stored.x, DEFAULT_SETTINGS.x),
  };
}

export function isSiteEnabled(settings: TranslatorSettings, site: TranslatedSite): boolean {
  return settings[site];
}

export function isConfigured(settings: TranslatorSettings): boolean {
  return settings.serverUrl.trim().length > 0 && settings.token.trim().length > 0;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function cacheDays(value: unknown): CacheDays {
  return CACHE_DAY_OPTIONS.find((option) => option === value) ?? DEFAULT_SETTINGS.cacheDays;
}

function tone(value: unknown): TranslationTone {
  return TONES.find((option) => option === value) ?? DEFAULT_SETTINGS.tone;
}
