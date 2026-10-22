#!/usr/bin/env bash
# PostToolUse (Edit|Write): corre typecheck si el archivo editado es TypeScript.
# exit 2 devuelve el error a Claude para que lo corrija en el acto.
set -u
input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! out=$(npm run -s typecheck 2>&1); then
  printf 'typecheck falló tras editar %s:\n%s\n' "$file" "$(printf '%s' "$out" | tail -n 30)" >&2
  exit 2
fi
exit 0
