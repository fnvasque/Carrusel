#!/usr/bin/env bash
# Instala (o actualiza) la plantilla de investigación semanal en la base:
# _investigacion/INSTRUCCIONES.md, _investigacion/validar.mjs y CLAUDE.md. Commitea y sube.
#
#   scripts/kb-research-install.sh [ruta-de-la-base]    (default: $KB_DIR o ./knowledge)
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
KB="${1:-${KB_DIR:-$HERE/knowledge}}"
[ -d "$KB/.git" ] || { echo "✗ $KB no es un repo git (¿clonaste ia-es-kb?)" >&2; exit 1; }

mkdir -p "$KB/_investigacion/resumenes"
cp "$HERE/kb-plantilla/_investigacion/INSTRUCCIONES.md" "$KB/_investigacion/"
cp "$HERE/kb-plantilla/_investigacion/validar.mjs" "$KB/_investigacion/"
cp "$HERE/kb-plantilla/CLAUDE.md" "$KB/"
touch "$KB/_investigacion/resumenes/.gitkeep"

node "$KB/_investigacion/validar.mjs"

git -C "$KB" add _investigacion CLAUDE.md
if git -C "$KB" diff --cached --quiet; then
  echo "✓ La plantilla ya estaba al día."
  exit 0
fi
git -C "$KB" commit -q -m "investigación: instala/actualiza la plantilla del agente"
git -C "$KB" push -q
echo "✓ Plantilla instalada en $KB y subida."
