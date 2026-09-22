/**
 * Codex authenticates through the ChatGPT OAuth session in ~/.codex. A provider API
 * key inherited from this server's environment would silently switch the child to
 * per-token billing, so the spawn environment drops those keys.
 */
export const BLOCKED_CHILD_PROCESS_API_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const;

export type BlockedChildProcessApiKey = (typeof BLOCKED_CHILD_PROCESS_API_KEYS)[number];

type EnvLike = NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;

export function sanitizeChildProcessEnv(input: EnvLike): Record<string, string> {
  const blocked = new Set<string>(BLOCKED_CHILD_PROCESS_API_KEYS);
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || blocked.has(key)) continue;
    output[key] = value;
  }
  return output;
}

export function findBlockedChildProcessEnvKeys(input: EnvLike): BlockedChildProcessApiKey[] {
  return BLOCKED_CHILD_PROCESS_API_KEYS.filter((key) => input[key] !== undefined);
}

export function warnForBlockedChildProcessEnvKeys(
  input: EnvLike,
  warn: (message: string) => void,
): void {
  const keys = findBlockedChildProcessEnvKeys(input);
  if (keys.length === 0) return;
  warn(`codex child processes will omit billing-switch API keys: ${keys.join(", ")}`);
}
