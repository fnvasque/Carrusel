#!/usr/bin/env bash
# Instala (o actualiza) la plantilla del planificador del calendario en la base:
# _calendario/INSTRUCCIONES.md, lector-frio.md, validar.mjs, validar.d.mts, config.json
# y CLAUDE.md. Commitea y sube.
#
#   scripts/kb-calendario-install.sh [ruta-de-la-base]    (default: $KB_DIR o ./knowledge)
#
# config.json es del usuario: si ya existe no se sobrescribe (se muestra la
# diferencia con la plantilla para que copies a mano lo que quieras).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/kb-plantilla/_calendario"
KB="${1:-${KB_DIR:-$HERE/knowledge}}"
[ -d "$KB/.git" ] || { echo "✗ $KB no es un repo git (¿clonaste ia-es-kb?)" >&2; exit 1; }

DEST="$KB/_calendario"
mkdir -p "$DEST"
# Se suben los archivos de la plantilla y, solo si se crean ahora, los del usuario y del agente.
ADD=(CLAUDE.md _calendario/INSTRUCCIONES.md _calendario/lector-frio.md _calendario/validar.mjs _calendario/validar.d.mts)
cp "$SRC/INSTRUCCIONES.md" "$SRC/lector-frio.md" "$SRC/validar.mjs" "$SRC/validar.d.mts" "$DEST/"
cp "$HERE/kb-plantilla/CLAUDE.md" "$KB/"

if [ -f "$DEST/config.json" ]; then
  if ! cmp -s "$DEST/config.json" "$SRC/config.json"; then
    echo "ℹ $DEST/config.json ya existe y no se toca. Diferencias con la plantilla (- tuyo, + plantilla):"
    diff -u "$DEST/config.json" "$SRC/config.json" || true
  fi
else
  cp "$SRC/config.json" "$DEST/"
  ADD+=(_calendario/config.json)
fi

# Archivos del agente: se crean vacíos solo la primera vez.
for f in experimentos.md aprendizajes.md; do
  if [ ! -f "$DEST/$f" ]; then
    : > "$DEST/$f"
    ADD+=("_calendario/$f")
  fi
done

node "$DEST/validar.mjs" --self-test

git -C "$KB" add "${ADD[@]}"
if git -C "$KB" diff --cached --quiet; then
  echo "✓ La plantilla del calendario ya estaba al día."
  exit 0
fi
git -C "$KB" commit -q -m "calendario: instala/actualiza la plantilla del planificador"
git -C "$KB" push -q
echo "✓ Plantilla del calendario instalada en $KB y subida."
