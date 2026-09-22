import { buildApp } from "./app.js";
import { warnForBlockedChildProcessEnvKeys } from "./child-env.js";
import { CodexEphemeralExecutor } from "./codex-executor.js";
import { resolveCodexCliPath } from "./codex-path.js";
import { loadServerConfig } from "./config.js";
import { loadGlossary } from "./glossary.js";
import { CodexTranslator } from "./translator.js";

const config = loadServerConfig(process.env);

warnForBlockedChildProcessEnvKeys(process.env, (message) => console.warn(message));

const codex = resolveCodexCliPath();
if (codex === undefined) {
  // Not fatal: /health must stay answerable so the operator can see the service is
  // up but unable to translate, instead of watching it crash-loop.
  console.warn("codex CLI was not found; /translate will report translation_unavailable");
} else {
  console.warn(`codex CLI resolved from ${codex.source}`);
}

const glossary = await loadGlossary(config.glossaryFile);
console.warn(`glossary entries loaded: ${glossary.length}`);

const app = buildApp({
  bearerToken: config.bearerToken,
  translator: new CodexTranslator({
    concurrency: config.codex.concurrency,
    executor: new CodexEphemeralExecutor({ codexPath: codex?.path }),
    glossary,
    model: config.codex.model,
    queueLimit: config.codex.queueLimit,
    reasoningEffort: config.codex.reasoningEffort,
    timeoutMs: config.codex.timeoutMs,
  }),
});

await app.listen({ host: config.host, port: config.port });
