#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/eias/services/haniel/services/community-translator
NODE_BIN=/opt/node/24/bin

# A clean environment on purpose: the translation server spawns codex, and an
# OPENAI_API_KEY inherited through the build would change how codex bills.
clean_env=(
  env -i
  HOME=/home/eias
  USER=eias
  LOGNAME=eias
  SHELL=/bin/bash
  PATH="$NODE_BIN:/home/eias/.local/bin:/home/eias/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  NODE_ENV=development
)

"${clean_env[@]}" pnpm --dir "$ROOT" --filter "@community-translator/server..." install --frozen-lockfile --prod=false
"${clean_env[@]}" pnpm --dir "$ROOT" --filter "@community-translator/server..." run build

find "$ROOT/apps/server/dist" "$ROOT/packages/contracts/dist" -type d -exec chmod 755 {} +
find "$ROOT/apps/server/dist" "$ROOT/packages/contracts/dist" -type f -exec chmod 644 {} +
