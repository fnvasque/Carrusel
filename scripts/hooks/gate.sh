#!/usr/bin/env bash
# Stop: no deja cerrar el turno con typecheck o tests en rojo si hay cambios en código.
# exit 2 devuelve el error a Claude y lo obliga a seguir.
set -u
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
cambios=$(git status --porcelain -- src test carousels package.json tsconfig.json 2>/dev/null)
[ -z "$cambios" ] && exit 0
if ! out=$( { npm run -s typecheck && npm test; } 2>&1 ); then
  printf 'Puerta de calidad en rojo (npm run typecheck && npm test). Corrige antes de terminar:\n%s\n' \
    "$(printf '%s' "$out" | tail -n 40)" >&2
  exit 2
fi
exit 0
