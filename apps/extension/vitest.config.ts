import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The content script builds its cards with real DOM APIs, so the tests run
    // against a DOM rather than against a hand-written stub of one.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
