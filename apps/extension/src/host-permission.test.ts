import { describe, expect, it, vi } from "vitest";

import {
  getServerOriginPattern,
  hasServerOriginPermission,
  saveAuthorizedSettings,
  type RuntimePermissions,
  type SettingsStorage,
} from "./host-permission.js";

function permissions(overrides: Partial<RuntimePermissions> = {}): RuntimePermissions {
  return {
    contains: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    request: vi.fn(async () => true),
    ...overrides,
  };
}

function storage(): SettingsStorage & { set: ReturnType<typeof vi.fn> } {
  return { remove: vi.fn(async () => undefined), set: vi.fn(async () => undefined) } as never;
}

describe("getServerOriginPattern", () => {
  it("asks for one https origin, not for every site", () => {
    expect(getServerOriginPattern("https://translator.example/health")).toBe(
      "https://translator.example/*",
    );
  });

  it.each(["http://localhost:3119", "http://127.0.0.1:3119", "http://[::1]:3119"])(
    "allows local http for development: %s",
    (url) => {
      expect(getServerOriginPattern(url)).toMatch(/^http:\/\//u);
    },
  );

  it("refuses plaintext http to a public host", () => {
    expect(() => getServerOriginPattern("http://translator.example")).toThrow(/HTTPS/u);
  });
});

describe("hasServerOriginPermission", () => {
  it("asks Chrome about the exact origin", async () => {
    const runtime = permissions();
    await hasServerOriginPermission("https://translator.example", runtime);
    expect(runtime.contains).toHaveBeenCalledWith({
      origins: ["https://translator.example/*"],
    });
  });
});

describe("saveAuthorizedSettings", () => {
  const next = { baseUrl: "https://translator.example", token: "secret" };

  it("stores the settings after the reader grants the origin", async () => {
    const runtime = permissions();
    const store = storage();

    await expect(
      saveAuthorizedSettings({ next, permissions: runtime, previous: null, storage: store }),
    ).resolves.toBe("saved");
    expect(store.set).toHaveBeenCalledWith({
      serverUrl: "https://translator.example",
      token: "secret",
    });
  });

  it("stores nothing when the reader declines", async () => {
    const runtime = permissions({ request: vi.fn(async () => false) });
    const store = storage();

    await expect(
      saveAuthorizedSettings({ next, permissions: runtime, previous: null, storage: store }),
    ).resolves.toBe("denied");
    expect(store.set).not.toHaveBeenCalled();
  });

  it("gives back the previous origin when the server address changes", async () => {
    const runtime = permissions();
    const previous = { baseUrl: "https://old.example", token: "old" };

    await saveAuthorizedSettings({ next, permissions: runtime, previous, storage: storage() });

    expect(runtime.remove).toHaveBeenCalledWith({ origins: ["https://old.example/*"] });
  });

  it("keeps the origin when only the token changed", async () => {
    const runtime = permissions();
    const previous = { baseUrl: "https://translator.example", token: "old" };

    await saveAuthorizedSettings({ next, permissions: runtime, previous, storage: storage() });

    expect(runtime.remove).not.toHaveBeenCalled();
  });

  it("rolls back the granted origin when storing fails", async () => {
    const runtime = permissions();
    const store = {
      remove: vi.fn(async () => undefined),
      set: vi.fn(async () => {
        throw new Error("storage is full");
      }),
    };

    await expect(
      saveAuthorizedSettings({ next, permissions: runtime, previous: null, storage: store }),
    ).rejects.toThrow(/storage is full/u);
    expect(runtime.remove).toHaveBeenCalledWith({ origins: ["https://translator.example/*"] });
  });
});
