#!/usr/bin/env bash
# Instala (o actualiza) la plantilla de investigación semanal en la base:
# _investigacion/INSTRUCCIONES.md, _investigacion/validar.mjs y CLAUDE.md; además
# alcance.json y pedidos.md solo si no existen (son del usuario). Commitea y sube.
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
# Del usuario: se crean la primera vez y nunca se sobrescriben.
for f in alcance.json pedidos.md; do
  if [ -f "$KB/_investigacion/$f" ]; then
    cmp -s "$KB/_investigacion/$f" "$HERE/kb-plantilla/_investigacion/$f" || echo "ℹ _investigacion/$f ya existe y no se toca."
  else
    cp "$HERE/kb-plantilla/_investigacion/$f" "$KB/_investigacion/"
  fi
done

node "$KB/_investigacion/validar.mjs"

git -C "$KB" add _investigacion CLAUDE.md
if git -C "$KB" diff --cached --quiet; then
  echo "✓ La plantilla ya estaba al día."
  exit 0
fi
git -C "$KB" commit -q -m "investigación: instala/actualiza la plantilla del agente"
git -C "$KB" push -q
echo "✓ Plantilla instalada en $KB y subida."
