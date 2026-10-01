#!/usr/bin/env bash
# En el Mac, después de migrar al servidor: reemplaza knowledge/ por un clon del repo
# privado de la base (Obsidian sigue abriendo la misma carpeta) y deja de versionarla
# en el repo de código (que es público).
#
#   scripts/kb-use-private-repo.sh
#
# La carpeta anterior queda respaldada en knowledge.antes-de-migrar/ (bórrala tú cuando
# confirmes que todo está bien).
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE="${KB_REMOTE:-https://github.com/fnvasque/ia-es-kb.git}"

[ -d knowledge/.git ] && { echo "✓ knowledge/ ya es el clon del repo privado."; exit 0; }
[ -e knowledge.antes-de-migrar ] && { echo "✗ Ya existe knowledge.antes-de-migrar/: revísalo y muévelo antes." >&2; exit 1; }
if pgrep -f "src/kb/bot.ts" >/dev/null; then echo "✗ El bot sigue corriendo en este Mac: apágalo primero." >&2; exit 1; fi

mv knowledge knowledge.antes-de-migrar
git clone -q "$REMOTE" knowledge
# Índice (derivado + caché de embeddings) y configuración de Obsidian se conservan.
[ -d knowledge.antes-de-migrar/.index ] && cp -R knowledge.antes-de-migrar/.index knowledge/
[ -d knowledge.antes-de-migrar/.obsidian ] && cp -R knowledge.antes-de-migrar/.obsidian knowledge/

if git ls-files --error-unmatch knowledge >/dev/null 2>&1; then
  git rm -r -q --cached knowledge
  grep -qx 'knowledge/' .gitignore || printf '\n# La base vive en su propio repo privado (ver deploy/README.md)\nknowledge/\n' >> .gitignore
  git add .gitignore
  git commit -q -m "kb: la base pasa a su propio repo privado (ia-es-kb)"
  echo "✓ knowledge/ ya no se versiona en el repo de código (commit hecho)."
fi
echo "✓ knowledge/ es ahora el clon de $REMOTE ($(ls knowledge/fuentes | wc -l | tr -d ' ') fichas)."
echo "  En Obsidian instala el plugin 'Git' (pull automático cada 5 min) para ver lo que guarda el servidor."
