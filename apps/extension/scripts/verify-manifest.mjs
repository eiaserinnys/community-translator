import { readdir, readFile } from "node:fs/promises";

// Guards the built package, not the source: what Chrome loads is what matters.
const outputUrl = new URL("../.output/chrome-mv3/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", outputUrl), "utf8"));

function fail(message) {
  throw new Error(`Built extension rejected: ${message}`);
}

function sameSet(actual, expected) {
  return JSON.stringify([...(actual ?? [])].sort()) === JSON.stringify([...expected].sort());
}

if (manifest.manifest_version !== 3) {
  fail("the build did not produce a Manifest V3 package.");
}

if (manifest.name !== "커뮤니티 번역") {
  fail(`the extension name is ${JSON.stringify(manifest.name)}.`);
}

if (manifest.version !== "0.1.0") {
  fail(`the extension version is ${JSON.stringify(manifest.version)}.`);
}

if ((manifest.host_permissions ?? []).length > 0) {
  fail("it requests host permissions up front.");
}

if (!sameSet(manifest.permissions, ["storage"])) {
  fail(`its permissions are ${JSON.stringify(manifest.permissions)}, not exactly ["storage"].`);
}

// The build tool is free to order these; only the set is part of the contract.
if (
  !sameSet(manifest.optional_host_permissions, [
    "https://*/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
    "http://[::1]/*",
  ])
) {
  fail("its optional host permissions do not match the supported server origins.");
}

const contentScripts = manifest.content_scripts ?? [];
if (contentScripts.length !== 1) {
  fail(`it registers ${contentScripts.length} content scripts instead of one.`);
}
if (
  !sameSet(contentScripts[0]?.matches, [
    "https://discord.com/*",
    "https://www.reddit.com/*",
    "https://old.reddit.com/*",
    "https://x.com/*",
    "https://www.x.com/*",
    "https://twitter.com/*",
    "https://www.twitter.com/*",
  ])
) {
  fail("its content script matches are not exactly the three supported communities.");
}
for (const match of contentScripts[0]?.matches ?? []) {
  if (!match.startsWith("https://")) {
    fail(`it injects over plaintext http: ${match}`);
  }
}

if (!manifest.options_ui?.page && !manifest.options_page) {
  fail("it exposes no settings page.");
}

if (manifest.externally_connectable) {
  fail("it exposes an externally connectable endpoint.");
}

if (/https?:/.test(manifest.content_security_policy?.extension_pages ?? "")) {
  fail("its content security policy permits remote code.");
}

// The reference extension this one replaces talked to DeepL. Nothing shipped may
// still reach for a translation provider other than the configured server. The
// negative lookahead keeps the ordinary English word "deeply" out of the match.
const FOREIGN_PROVIDER = /deepl(?![a-z])/i;
for (const file of await readdir(outputUrl, { recursive: true, withFileTypes: true })) {
  if (!file.isFile()) continue;
  const path = `${file.parentPath}/${file.name}`;
  if (!/\.(css|html|js|json)$/.test(path)) continue;
  const body = await readFile(path, "utf8");
  if (FOREIGN_PROVIDER.test(body)) {
    fail(`${path} still references DeepL.`);
  }
}

console.log("Built extension verified.");
