import type { components } from "@community-translator/contracts";

import { TRANSLATED_SITE_MATCHES } from "../manifest.js";
import type { SettingsSnapshot, TranslateResponse } from "../protocol.js";
import { startScanner } from "../scanner.js";
import { siteFor } from "../site.js";

type TranslationTone = components["schemas"]["TranslationTone"];

const DISCONNECTED = "확장이 업데이트됐어요. 페이지를 새로고침해 주세요.";

export default defineContentScript({
  matches: [...TRANSLATED_SITE_MATCHES],
  runAt: "document_idle",

  main() {
    const site = siteFor(location.href);
    if (!site) return;

    let snapshot: SettingsSnapshot = {
      autoPreview: false,
      configured: false,
      enabled: false,
      tone: "casual",
    };

    async function send<T>(message: unknown): Promise<T | null> {
      try {
        return (await browser.runtime.sendMessage(message)) as T;
      } catch {
        // The worker restarted or the extension was reloaded under this page.
        return null;
      }
    }

    async function translate(text: string, target: "EN-US" | "KO", tone?: TranslationTone) {
      const response = await send<TranslateResponse>({
        site,
        target,
        text,
        type: "translate",
        ...(tone === undefined ? {} : { tone }),
      });
      if (!response) throw new Error(DISCONNECTED);
      if (!response.ok) throw new Error(response.message);
      return response.text;
    }

    const scanner = startScanner(site, {
      getSettings: () => ({ autoPreview: snapshot.autoPreview, tone: snapshot.tone }),

      isActive: () => snapshot.enabled && snapshot.configured,

      async refreshSettings() {
        const response = await send<SettingsSnapshot & { ok: true }>({ type: "settings" });
        if (!response?.ok) return false;
        const next: SettingsSnapshot = {
          autoPreview: response.autoPreview,
          configured: response.configured,
          enabled: response.enabled,
          tone: response.tone,
        };
        const changed = JSON.stringify(next) !== JSON.stringify(snapshot);
        snapshot = next;
        return changed;
      },

      setTone(tone: TranslationTone) {
        snapshot = { ...snapshot, tone };
      },

      translate: (text: string, tone: TranslationTone) => translate(text, "EN-US", tone),

      translateMessage: (text: string) => translate(text, "KO"),
    });

    window.addEventListener("pagehide", () => scanner.stop(), { once: true });
  },
});
