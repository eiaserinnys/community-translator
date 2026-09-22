import { normalizeApiSettings } from "@community-translator/contracts";

import {
  hasServerOriginPermission,
  saveAuthorizedSettings,
  type RuntimePermissions,
  type ServerAccess,
  type SettingsStorage,
} from "../../host-permission.js";
import type { CacheStatsResponse, ClearCacheResponse } from "../../protocol.js";
import {
  CACHE_DAY_OPTIONS,
  normalizeStoredSettings,
  TONES,
  type CacheDays,
  type TranslatorSettings,
} from "../../settings.js";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Settings page is missing ${selector}`);
  return element;
}

const form = requireElement<HTMLFormElement>("#settings");
const serverUrlInput = requireElement<HTMLInputElement>("#server-url");
const tokenInput = requireElement<HTMLInputElement>("#token");
const autoPreviewInput = requireElement<HTMLInputElement>("#auto-preview");
const toneSelect = requireElement<HTMLSelectElement>("#tone");
const cacheDaysSelect = requireElement<HTMLSelectElement>("#cache-days");
const cacheStats = requireElement<HTMLElement>("#cache-stats");
const clearCacheButton = requireElement<HTMLButtonElement>("#clear-cache");
const statusElement = requireElement<HTMLElement>("#status");
const siteInputs = {
  discord: requireElement<HTMLInputElement>("#discord"),
  reddit: requireElement<HTMLInputElement>("#reddit"),
  x: requireElement<HTMLInputElement>("#x"),
};

const runtimePermissions: RuntimePermissions = {
  contains: (permissions) => browser.permissions.contains(permissions),
  remove: (permissions) => browser.permissions.remove(permissions),
  request: (permissions) => browser.permissions.request(permissions),
};

const settingsStorage: SettingsStorage = {
  remove: (keys) => browser.storage.local.remove(keys),
  set: (values) => browser.storage.local.set(values),
};

let stored: ServerAccess | null = null;

function readForm(): TranslatorSettings {
  return normalizeStoredSettings({
    autoPreview: autoPreviewInput.checked,
    cacheDays: Number(cacheDaysSelect.value) as CacheDays,
    discord: siteInputs.discord.checked,
    reddit: siteInputs.reddit.checked,
    serverUrl: serverUrlInput.value,
    token: tokenInput.value,
    tone: toneSelect.value,
    x: siteInputs.x.checked,
  });
}

async function load(): Promise<void> {
  const settings = normalizeStoredSettings(await browser.storage.local.get(null));

  serverUrlInput.value = settings.serverUrl;
  tokenInput.value = settings.token;
  autoPreviewInput.checked = settings.autoPreview;
  toneSelect.value = settings.tone;
  cacheDaysSelect.value = String(settings.cacheDays);
  siteInputs.discord.checked = settings.discord;
  siteInputs.reddit.checked = settings.reddit;
  siteInputs.x.checked = settings.x;

  try {
    stored = normalizeApiSettings({ serverUrl: settings.serverUrl, token: settings.token });
    statusElement.textContent = (await hasServerOriginPermission(stored.baseUrl, runtimePermissions))
      ? "번역 서버에 연결할 준비가 됐습니다."
      : "저장된 서버의 접근 권한을 다시 승인해 주세요. 설정 저장을 눌러 주세요.";
  } catch {
    stored = null;
    statusElement.textContent = "번역 서버 주소와 토큰을 입력해 주세요.";
  }

  await refreshCacheStats();
}

async function refreshCacheStats(): Promise<void> {
  const response = (await browser.runtime.sendMessage({
    type: "cacheStats",
  })) as CacheStatsResponse | undefined;
  cacheStats.textContent = response?.ok
    ? `${response.count}개 · ${(response.bytes / 1024).toFixed(0)} KB 보관 중`
    : "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = readForm();

  let next: ServerAccess;
  try {
    next = normalizeApiSettings({ serverUrl: settings.serverUrl, token: settings.token });
  } catch {
    statusElement.textContent =
      "HTTPS 서버 주소, 또는 localhost·127.0.0.1 HTTP 주소와 토큰을 확인해 주세요.";
    return;
  }

  try {
    const outcome = await saveAuthorizedSettings({
      next,
      permissions: runtimePermissions,
      previous: stored,
      storage: settingsStorage,
    });
    if (outcome === "denied") {
      statusElement.textContent = "서버 접근 권한이 거절되어 설정을 저장하지 않았습니다.";
      return;
    }

    await browser.storage.local.set({
      autoPreview: settings.autoPreview,
      cacheDays: settings.cacheDays,
      discord: settings.discord,
      reddit: settings.reddit,
      tone: settings.tone,
      x: settings.x,
    });

    stored = next;
    serverUrlInput.value = next.baseUrl;
    statusElement.textContent = "설정을 저장했습니다.";
  } catch {
    statusElement.textContent = "설정을 저장하지 못했습니다. 다시 시도해 주세요.";
  }
});

clearCacheButton.addEventListener("click", async () => {
  const response = (await browser.runtime.sendMessage({
    type: "clearCache",
  })) as ClearCacheResponse | undefined;
  statusElement.textContent = response?.ok
    ? "저장된 번역을 지웠습니다."
    : "삭제하지 못했습니다. 다시 시도해 주세요.";
  await refreshCacheStats();
});

// Keep the markup and the accepted values from drifting apart.
for (const option of cacheDaysSelect.options) {
  if (!CACHE_DAY_OPTIONS.some((day) => String(day) === option.value)) {
    throw new Error(`Settings page offers an unsupported retention: ${option.value}`);
  }
}
for (const option of toneSelect.options) {
  if (!TONES.some((tone) => tone === option.value)) {
    throw new Error(`Settings page offers an unsupported tone: ${option.value}`);
  }
}

await load();
