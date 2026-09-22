export interface RuntimePermissions {
  contains(permissions: { origins: string[] }): Promise<boolean>;
  remove(permissions: { origins: string[] }): Promise<boolean>;
  request(permissions: { origins: string[] }): Promise<boolean>;
}

export interface SettingsStorage {
  remove(keys: string[]): Promise<void>;
  set(values: Record<string, string>): Promise<void>;
}

export interface ServerAccess {
  readonly baseUrl: string;
  readonly token: string;
}

interface SaveAuthorizedSettingsOptions {
  readonly next: ServerAccess;
  readonly permissions: RuntimePermissions;
  readonly previous: ServerAccess | null;
  readonly storage: SettingsStorage;
}

export type SaveAuthorizedSettingsOutcome = "denied" | "saved";

const LOCAL_HTTP_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The manifest asks for no host permission up front. Saving a server address grants
 * access to that one origin and nothing else.
 */
export function getServerOriginPattern(baseUrl: string): string {
  const url = new URL(baseUrl);
  const hostname = url.hostname.toLowerCase();

  if (url.protocol === "https:") {
    return `https://${hostname}/*`;
  }
  if (url.protocol === "http:" && LOCAL_HTTP_HOSTNAMES.has(hostname)) {
    return `http://${hostname}/*`;
  }
  throw new Error("Server access requires HTTPS, or HTTP on a loopback address.");
}

export async function hasServerOriginPermission(
  baseUrl: string,
  permissions: RuntimePermissions,
): Promise<boolean> {
  return permissions.contains({ origins: [getServerOriginPattern(baseUrl)] });
}

export async function saveAuthorizedSettings({
  next,
  permissions,
  previous,
  storage,
}: SaveAuthorizedSettingsOptions): Promise<SaveAuthorizedSettingsOutcome> {
  const nextOrigin = getServerOriginPattern(next.baseUrl);
  const previousOrigin = previous ? getServerOriginPattern(previous.baseUrl) : null;

  // Chrome only honours this inside the settings form's user gesture, so it must
  // come before any other awaited extension call.
  const granted = await permissions.request({ origins: [nextOrigin] });
  if (!granted) {
    return "denied";
  }

  try {
    await storage.set({ serverUrl: next.baseUrl, token: next.token });

    if (previousOrigin && previousOrigin !== nextOrigin) {
      if (await permissions.contains({ origins: [previousOrigin] })) {
        const removed = await permissions.remove({ origins: [previousOrigin] });
        if (!removed) {
          throw new Error("Chrome did not release the previous server permission.");
        }
      }
    }
  } catch (error) {
    await restoreStoredSettings(storage, previous);
    // Never leave a granted origin behind for settings that were not saved.
    await permissions.remove({ origins: [nextOrigin] });
    throw error;
  }

  return "saved";
}

async function restoreStoredSettings(
  storage: SettingsStorage,
  previous: ServerAccess | null,
): Promise<void> {
  if (previous) {
    await storage.set({ serverUrl: previous.baseUrl, token: previous.token });
    return;
  }
  await storage.remove(["serverUrl", "token"]);
}
