import { z } from "zod";

import { CODEX_REASONING_EFFORTS, type CodexReasoningEffort } from "./codex-executor.js";

// Every value is required. Operational defaults belong in .env.example and in
// deploy/haniel/server.env.example, never in a code-side fallback, so a missing
// variable fails at startup instead of running with an unintended value.
const serverConfigSchema = z.object({
  HOST: z.string().trim().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535),
  TRANSLATOR_BEARER_TOKEN: z.string().trim().min(1).regex(/^\S+$/u),
  TRANSLATOR_CODEX_CONCURRENCY: z.coerce.number().int().min(1).max(8),
  TRANSLATOR_CODEX_MODEL: z.string().trim().min(1),
  TRANSLATOR_CODEX_QUEUE_LIMIT: z.coerce.number().int().min(1).max(512),
  TRANSLATOR_CODEX_REASONING_EFFORT: z.enum(CODEX_REASONING_EFFORTS),
  TRANSLATOR_CODEX_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000),
  TRANSLATOR_GLOSSARY_FILE: z.string().trim().min(1),
});

export interface ServerCodexConfig {
  concurrency: number;
  model: string;
  queueLimit: number;
  reasoningEffort: CodexReasoningEffort;
  timeoutMs: number;
}

export interface ServerConfig {
  bearerToken: string;
  codex: ServerCodexConfig;
  glossaryFile: string;
  host: string;
  port: number;
}

export function loadServerConfig(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
): ServerConfig {
  const parsed = serverConfigSchema.parse({
    HOST: environment.HOST,
    PORT: environment.PORT,
    TRANSLATOR_BEARER_TOKEN: environment.TRANSLATOR_BEARER_TOKEN,
    TRANSLATOR_CODEX_CONCURRENCY: environment.TRANSLATOR_CODEX_CONCURRENCY,
    TRANSLATOR_CODEX_MODEL: environment.TRANSLATOR_CODEX_MODEL,
    TRANSLATOR_CODEX_QUEUE_LIMIT: environment.TRANSLATOR_CODEX_QUEUE_LIMIT,
    TRANSLATOR_CODEX_REASONING_EFFORT: environment.TRANSLATOR_CODEX_REASONING_EFFORT,
    TRANSLATOR_CODEX_TIMEOUT_MS: environment.TRANSLATOR_CODEX_TIMEOUT_MS,
    TRANSLATOR_GLOSSARY_FILE: environment.TRANSLATOR_GLOSSARY_FILE,
  });

  return {
    bearerToken: parsed.TRANSLATOR_BEARER_TOKEN,
    codex: {
      concurrency: parsed.TRANSLATOR_CODEX_CONCURRENCY,
      model: parsed.TRANSLATOR_CODEX_MODEL,
      queueLimit: parsed.TRANSLATOR_CODEX_QUEUE_LIMIT,
      reasoningEffort: parsed.TRANSLATOR_CODEX_REASONING_EFFORT,
      timeoutMs: parsed.TRANSLATOR_CODEX_TIMEOUT_MS,
    },
    glossaryFile: parsed.TRANSLATOR_GLOSSARY_FILE,
    host: parsed.HOST,
    port: parsed.PORT,
  };
}
