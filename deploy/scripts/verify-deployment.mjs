import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const files = {
  build: "deploy/haniel/build-community-translator.sh",
  environment: "deploy/haniel/server.env.example",
  serviceConfig: "deploy/haniel/community-translator.yaml.example",
  http: "deploy/nginx/translator.example.com.http.conf",
  runbook: "deploy/README.md",
  tls: "deploy/nginx/translator.example.com.tls.conf",
};

const content = {};
for (const [name, relativePath] of Object.entries(files)) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  await access(absolutePath);
  content[name] = await readFile(absolutePath, "utf8");
}

function requireText(name, expected) {
  if (!content[name].includes(expected)) {
    throw new Error(`${files[name]} must contain ${JSON.stringify(expected)}.`);
  }
}

for (const expected of [
  "/opt/node/24/bin",
  'ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"',
  'USER_NAME="${USER:-$(id -un)}"',
  'HOME_DIR="${HOME:-$(getent passwd "$USER_NAME" | cut -d: -f6)}"',
  'pnpm --dir "$ROOT" --filter "@community-translator/server..." install',
  'pnpm --dir "$ROOT" --filter "@community-translator/server..." run build',
]) {
  requireText("build", expected);
}

// Checked before the presence list so this specific reason wins over a generic
// "must contain auto_apply: false" when someone flips the flag.
if (content.serviceConfig.includes("auto_apply: true")) {
  throw new Error(`${files.serviceConfig} must keep merging and deploying separate decisions.`);
}
// The service manager resolves repo.path against its config directory, so "./services/..."
// lands next to the manager config instead of the build hook's repository root.
// Checked before the presence list so the reason names the resolution rule.
for (const relative of [/^\s*path:\s*\.\//mu, /^\s*cwd:\s*\.\//mu]) {
  if (relative.test(content.serviceConfig)) {
    throw new Error(
      `${files.serviceConfig} must give an absolute path and cwd because the service manager resolves relative paths against its config directory.`,
    );
  }
}

for (const expected of [
  "community-translator-server:",
  "auto_apply: false",
  "ready: port:3119",
  "path: /srv/haniel/services/community-translator",
  "cwd: /srv/haniel/services/community-translator",
  "/srv/community-translator/shared/server/.env",
  "/opt/node/24/bin/node",
  "/srv/haniel/services/community-translator/deploy/haniel/build-community-translator.sh",
]) {
  requireText("serviceConfig", expected);
}

// codex has no "max" effort. Checked before the presence list so the reason given
// names the real problem instead of only reporting the missing expected line.
for (const effort of ["=max", "=maximum"]) {
  if (content.environment.includes(`TRANSLATOR_CODEX_REASONING_EFFORT${effort}`)) {
    throw new Error(`${files.environment} sets a reasoning effort codex does not implement.`);
  }
}

for (const expected of [
  "HOST=127.0.0.1",
  "PORT=3119",
  "TRANSLATOR_CODEX_MODEL=gpt-5.6-luna",
  "TRANSLATOR_CODEX_REASONING_EFFORT=xhigh",
  "TRANSLATOR_CODEX_CONCURRENCY=2",
  "TRANSLATOR_GLOSSARY_FILE=/srv/community-translator/shared/glossary.yaml",
]) {
  requireText("environment", expected);
}

// Recording why keeps the next reader from "fixing" xhigh into max.
requireText("environment", 'There is no "max"');

for (const name of ["http", "tls"]) {
  requireText(name, "server_name translator.example.com;");
  requireText(name, "proxy_pass http://127.0.0.1:3119;");
  requireText(name, "proxy_buffering off;");
  requireText(name, "proxy_cache off;");
}
requireText("tls", "/etc/letsencrypt/live/translator.example.com/fullchain.pem");
requireText("tls", "/etc/letsencrypt/live/translator.example.com/privkey.pem");
requireText("http", "location = /health");
requireText("http", "return 404;");

// The shared 443 socket belongs to the host: adding protocol options here would
// change them for every other site nginx serves.
const shared443Listeners = content.tls
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => /^listen (?:\[::\]:)?443\b/u.test(line));
const expectedShared443Listeners = ["listen 443 ssl;", "listen [::]:443 ssl;"];
if (
  shared443Listeners.length !== expectedShared443Listeners.length ||
  shared443Listeners.some((listener, index) => listener !== expectedShared443Listeners[index])
) {
  throw new Error(
    `${files.tls} shared 443 socket options must match the host nginx baseline: ${expectedShared443Listeners.join(" ")}`,
  );
}

// A codex run outlives a default proxy read timeout, so a short one would show the
// reader a failure while the translation was still being produced.
const readTimeout = /proxy_read_timeout (\d+)s;/u.exec(content.tls);
if (!readTimeout || Number(readTimeout[1]) < 120) {
  throw new Error(`${files.tls} must allow a slow codex run at least 120s.`);
}

for (const expected of [
  "3119",
  "translator.example.com",
  "community-translator-server",
  "glossary.yaml",
  "## 롤백",
  "203.0.113.10",
  "--account",
]) {
  requireText("runbook", expected);
}

const buildMode = (await stat(path.join(repositoryRoot, files.build))).mode & 0o777;
if ((buildMode & 0o111) === 0) {
  throw new Error(`${files.build} must be executable.`);
}

for (const [name, body] of Object.entries(content)) {
  if (/Bearer\s+[A-Za-z0-9._~-]{20,}/u.test(body)) {
    throw new Error(`${files[name]} appears to contain a bearer secret.`);
  }
  if (/^TRANSLATOR_BEARER_TOKEN=(?!replace-at-deploy-time$).+/mu.test(body)) {
    throw new Error(`${files[name]} contains a non-placeholder token assignment.`);
  }
}

const assignments = content.environment
  .split(/\r?\n/u)
  .filter((line) => line.startsWith("TRANSLATOR_BEARER_TOKEN="));
if (assignments.length !== 1 || assignments[0] !== "TRANSLATOR_BEARER_TOKEN=replace-at-deploy-time") {
  throw new Error(`${files.environment} must define one placeholder-only bearer token.`);
}

console.log("Deployment contract verified.");
