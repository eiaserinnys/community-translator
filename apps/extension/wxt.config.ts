import { defineConfig } from "wxt";

import { extensionManifest } from "./src/manifest.js";

export default defineConfig({
  manifest: extensionManifest,
  manifestVersion: 3,
  srcDir: "src",
});
