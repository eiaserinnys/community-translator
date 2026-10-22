#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN=/opt/node/24/bin
USER_NAME="${USER:-$(id -un)}"
HOME_DIR="${HOME:-$(getent passwd "$USER_NAME" | cut -d: -f6)}"

# A clean environment on purpose: the translation server spawns codex, and an
# OPENAI_API_KEY inherited through the build would change how codex bills.
clean_env=(
  env -i
  HOME="$HOME_DIR"
  USER="$USER_NAME"
  LOGNAME="$USER_NAME"
  SHELL=/bin/bash
  PATH="$NODE_BIN:$HOME_DIR/.local/bin:$HOME_DIR/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  NODE_ENV=development
)

"${clean_env[@]}" pnpm --dir "$ROOT" --filter "@community-translator/server..." install --frozen-lockfile --prod=false
"${clean_env[@]}" pnpm --dir "$ROOT" --filter "@community-translator/server..." run build

find "$ROOT/apps/server/dist" "$ROOT/packages/contracts/dist" -type d -exec chmod 755 {} +
find "$ROOT/apps/server/dist" "$ROOT/packages/contracts/dist" -type f -exec chmod 644 {} +
