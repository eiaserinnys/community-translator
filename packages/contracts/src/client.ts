import createClient from "openapi-fetch";

import type { paths } from "./generated.js";

export interface TranslatorClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}

export interface ApiSettingsInput {
  serverUrl: string;
  token: string;
}

export interface ApiSettings {
  baseUrl: string;
  token: string;
}

export function normalizeApiSettings({ serverUrl, token }: ApiSettingsInput): ApiSettings {
  const url = new URL(serverUrl.trim());
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("Translator server URL must use http or https without embedded credentials.");
  }
  url.hash = "";
  url.search = "";
  const normalizedToken = token.trim();
  if (normalizedToken.length === 0 || /\s/.test(normalizedToken)) {
    throw new Error("Translator API token is required and cannot contain whitespace.");
  }

  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    token: normalizedToken,
  };
}

export function createTranslatorClient({ baseUrl, token, fetch }: TranslatorClientOptions) {
  const settings = normalizeApiSettings({ serverUrl: baseUrl, token });

  return createClient<paths>({
    baseUrl: settings.baseUrl,
    ...(fetch ? { fetch } : {}),
    headers: { Authorization: `Bearer ${settings.token}` },
  });
}
