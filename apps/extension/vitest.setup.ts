import { webcrypto } from "node:crypto";

// jsdom ships crypto.getRandomValues but not crypto.subtle, which the cache key
// needs. An MV3 service worker has the full Web Crypto API, so this only closes a
// gap in the test environment.
if (globalThis.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
}

// jsdom implements no media queries at all. Every page a content script runs in has
// matchMedia, so the tests answer "light" and let the card's own contrast check be
// what the assertions exercise.
if (typeof globalThis.matchMedia !== "function") {
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      }) as MediaQueryList,
  });
}
