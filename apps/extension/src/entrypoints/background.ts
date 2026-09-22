import { IndexedDbTranslationCache } from "../cache.js";
import {
  failureResponse,
  type CacheStatsResponse,
  type ClearCacheResponse,
  type SettingsResponse,
  type TranslateResponse,
} from "../protocol.js";
import { createServerBackend } from "../server-backend.js";
import { isConfigured, isSiteEnabled, normalizeStoredSettings, type TranslatorSettings } from "../settings.js";
import { siteFor, type TranslatedSite } from "../site.js";
import { TranslationDisplayError, TranslationService } from "../translation-service.js";

type AnyResponse = CacheStatsResponse | ClearCacheResponse | SettingsResponse | TranslateResponse;

export default defineBackground(() => {
  const cache = new IndexedDbTranslationCache();
  let settings: TranslatorSettings = normalizeStoredSettings({});
  let service = new TranslationService({ backend: createServerBackend(settings), cache });

  const ready = reload();

  async function reload(): Promise<void> {
    settings = normalizeStoredSettings(await browser.storage.local.get(null));
    // The backend carries the server address and token, so it is rebuilt whenever
    // either changes; in-flight work from the old settings is dropped with it.
    service = new TranslationService({ backend: createServerBackend(settings), cache });
    await cache.prune(settings.cacheDays).catch(() => undefined);
  }

  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") void reload();
  });

  // The toolbar button has no popup: it opens the one settings page.
  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handle(message, sender).then(sendResponse);
    return true;
  });

  async function handle(message: unknown, sender: { id?: string; url?: string }): Promise<AnyResponse> {
    // Only this extension's own pages and content scripts may ask for a translation.
    if (sender.id !== browser.runtime.id) {
      return failureResponse("not_configured");
    }
    await ready;

    const fromSettingsPage = sender.url?.startsWith(browser.runtime.getURL("/options.html")) === true;
    // The site is taken from the sender's own URL, never from the message body.
    const site = sender.url ? siteFor(sender.url) : null;
    const request = message as { target?: unknown; text?: unknown; tone?: unknown; type?: unknown };

    if (fromSettingsPage) {
      if (request.type === "cacheStats") {
        const stats = await cache.stats();
        return { bytes: stats.bytes, count: stats.count, ok: true };
      }
      if (request.type === "clearCache") {
        service.clear();
        await cache.clear();
        return { ok: true };
      }
    }

    if (!site) {
      return failureResponse("site_disabled");
    }
    if (request.type === "settings") {
      return settingsSnapshot(site);
    }
    if (request.type !== "translate") {
      return failureResponse("not_configured");
    }
    return translate(site, request);
  }

  function settingsSnapshot(site: TranslatedSite): SettingsResponse {
    return {
      autoPreview: settings.autoPreview,
      configured: isConfigured(settings),
      enabled: isSiteEnabled(settings, site),
      ok: true,
      tone: settings.tone,
    };
  }

  async function translate(
    site: TranslatedSite,
    request: { target?: unknown; text?: unknown; tone?: unknown },
  ): Promise<TranslateResponse> {
    if (!isSiteEnabled(settings, site)) {
      return failureResponse("site_disabled");
    }
    if (!isConfigured(settings)) {
      return failureResponse("not_configured");
    }
    if (typeof request.text !== "string") {
      return failureResponse("empty_text");
    }
    if (request.target !== "KO" && request.target !== "EN-US") {
      return failureResponse("unsupported_target");
    }

    try {
      const text = await service.translate(
        {
          site,
          target: request.target,
          text: request.text,
          ...(request.tone === "neutral" || request.tone === "casual" ? { tone: request.tone } : {}),
        },
        settings.cacheDays,
      );
      return { ok: true, text };
    } catch (error) {
      if (error instanceof TranslationDisplayError) {
        return failureResponse(error.code, error.message);
      }
      return failureResponse("translation_failed");
    }
  }
});
