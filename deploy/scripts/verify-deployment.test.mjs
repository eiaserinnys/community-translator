import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const verifier = path.join(repositoryRoot, "deploy/scripts/verify-deployment.mjs");

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "community-translator-deploy-"));
  t.after(async () => rm(root, { force: true, recursive: true }));
  await cp(path.join(repositoryRoot, "deploy"), path.join(root, "deploy"), {
    mode: 0,
    recursive: true,
  });
  return root;
}

function verify(root) {
  return spawnSync(process.execPath, [verifier, root], { encoding: "utf8" });
}

async function mutate(root, relativePath, transform) {
  const target = path.join(root, relativePath);
  await writeFile(target, transform(await readFile(target, "utf8")), "utf8");
}

const ENVIRONMENT = "deploy/haniel/server.env.example";
const TLS = "deploy/nginx/translator.eiaserinnys.me.tls.conf";
const HANIEL = "deploy/haniel/community-translator.yaml.example";
const HANIEL_ABSOLUTE = "/home/eias/services/haniel/services/community-translator";
const HANIEL_RELATIVE = "./services/community-translator";

test("accepts the canonical placeholder-only deployment assets", async (t) => {
  const result = verify(await createFixture(t));
  assert.equal(result.status, 0, result.stderr);
});

test("rejects a real bearer token left in the environment example", async (t) => {
  const root = await createFixture(t);
  await mutate(root, ENVIRONMENT, (body) =>
    body.replace(
      "TRANSLATOR_BEARER_TOKEN=replace-at-deploy-time",
      "TRANSLATOR_BEARER_TOKEN=8f14e45fceea167a5a36dedd4bea2543",
    ),
  );
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /placeholder/u);
});

test("rejects a reasoning effort the codex CLI does not implement", async (t) => {
  const root = await createFixture(t);
  await mutate(root, ENVIRONMENT, (body) =>
    body.replace("TRANSLATOR_CODEX_REASONING_EFFORT=xhigh", "TRANSLATOR_CODEX_REASONING_EFFORT=max"),
  );
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /reasoning effort/u);
});

test("rejects a port that does not match the reserved loopback port", async (t) => {
  const root = await createFixture(t);
  await mutate(root, ENVIRONMENT, (body) => body.replace("PORT=3119", "PORT=3118"));
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PORT=3119/u);
});

test("rejects a proxy read timeout that would cut a slow codex run short", async (t) => {
  const root = await createFixture(t);
  await mutate(root, TLS, (body) =>
    body.replace("proxy_read_timeout 300s;", "proxy_read_timeout 30s;"),
  );
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /120s/u);
});

for (const listener of ["listen 443 ssl;", "listen [::]:443 ssl;"]) {
  test(`rejects protocol options on the shared listener ${listener}`, async (t) => {
    const root = await createFixture(t);
    await mutate(root, TLS, (body) => body.replace(listener, listener.replace("ssl;", "ssl http2;")));
    const result = verify(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /shared 443 socket options/u);
  });
}

test("rejects a Haniel repository that would deploy on merge", async (t) => {
  const root = await createFixture(t);
  await mutate(root, HANIEL, (body) => body.replace("auto_apply: false", "auto_apply: true"));
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /separate decisions/u);
});

test("rejects a Haniel path haniel would resolve against its config directory", async (t) => {
  const root = await createFixture(t);
  await mutate(root, HANIEL, (body) =>
    body
      .replaceAll(`path: ${HANIEL_ABSOLUTE}`, `path: ${HANIEL_RELATIVE}`)
      .replaceAll(`cwd: ${HANIEL_ABSOLUTE}`, `cwd: ${HANIEL_RELATIVE}`),
  );
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absolute path and cwd/u);
});

test("rejects a build hook that no longer targets the server workspace", async (t) => {
  const root = await createFixture(t);
  await mutate(root, "deploy/haniel/build-community-translator.sh", (body) =>
    body.replace('--filter "@community-translator/server..." run build', "run build"),
  );
  const result = verify(root);
  assert.notEqual(result.status, 0);
});

test("rejects a missing deployment asset", async (t) => {
  const root = await createFixture(t);
  await rm(path.join(root, TLS));
  const result = verify(root);
  assert.notEqual(result.status, 0);
});
