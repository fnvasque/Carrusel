#!/usr/bin/env bash
# PreToolUse (Bash): bloquea comandos peligrosos. exit 2 bloquea; exit 1 NO bloquearía.
set -u
cmd=$(jq -r '.tool_input.command // empty')

bloquear() { printf 'Bloqueado por scripts/hooks/guard.sh: %s\n' "$1" >&2; exit 2; }

if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)'; then
  printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])(--force(-with-lease)?(=[^[:space:]]*)?|-f|--mirror|--delete|-d)([[:space:]]|$)|[[:space:]]\+[^[:space:]]+' \
    && bloquear 'git push forzado o que borra ramas remotas.'
  printf '%s' "$cmd" | grep -Eq '[[:space:]:/](main|master)([[:space:]]|$)' \
    && bloquear 'push a main: trabaja en una rama claude/<tema> y abre PR.'
fi

if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*[[:space:]]+)*-[a-zA-Z]*[rR]'; then
  printf '%s' "$cmd" | grep -Eq '[[:space:]](/|~|~/|\$HOME|\.|\.\.|\*|\./?\*|\.git|\.cache|knowledge|src|test)/?([[:space:]]|$)' \
    && bloquear 'rm -r sobre una ruta protegida (raíz, home, repo, .git, .cache, knowledge, src, test).'
fi
exit 0
