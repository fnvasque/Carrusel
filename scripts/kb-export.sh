#!/usr/bin/env bash
# Sube la base de conocimiento (knowledge/) a su propio repo PRIVADO, con su historial
# de commits y la galería de slides (que en el repo de código queda fuera de git).
# Idempotente: correrlo de nuevo solo agrega lo guardado desde la última vez.
#
#   scripts/kb-export.sh [repo-de-código]        (default: el directorio actual)
#   KB_REMOTE=https://github.com/<tú>/<repo>.git scripts/kb-export.sh
set -euo pipefail

SRC="$(cd "${1:-.}" && pwd)"
REMOTE="${KB_REMOTE:-https://github.com/fnvasque/ia-es-kb.git}"

[ -d "$SRC/knowledge" ] || { echo "✗ No hay knowledge/ en $SRC" >&2; exit 1; }
git -C "$SRC" ls-files --error-unmatch knowledge >/dev/null 2>&1 \
  || { echo "✗ knowledge/ no está versionada en $SRC (¿ya se migró?)" >&2; exit 1; }

echo "→ Extrayendo el historial de knowledge/…"
SHA="$(git -C "$SRC" subtree split --prefix=knowledge 2>/dev/null | tail -1)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git clone -q "$REMOTE" "$TMP/kb"
cd "$TMP/kb"
git fetch -q "$SRC" "$SHA"
if git rev-parse -q --verify HEAD >/dev/null; then
  git merge -q --no-edit FETCH_HEAD -m "kb: sincroniza historial desde el repo de código"
else
  git checkout -q -b main FETCH_HEAD
fi

# En el repo privado la galería SÍ va a git (el Mac y el servidor la ven igual).
rm -f _adjuntos/slides/.gitignore
cat > .gitignore <<'EOF'
# Índice derivado (npm run kb:reindex lo reconstruye) y estado local de Obsidian.
.index/
.obsidian/
.trash/
.DS_Store
EOF
if [ -d "$SRC/knowledge/_adjuntos/slides" ]; then
  rsync -a --exclude .gitignore "$SRC/knowledge/_adjuntos/slides/" _adjuntos/slides/
fi
git add -A
git diff --cached --quiet || git commit -q -m "kb: incluye la galería de slides y .gitignore del vault"
git push -q -u origin main
echo "✓ Base subida a $REMOTE ($(git rev-list --count HEAD) commits, $(ls fuentes | wc -l | tr -d ' ') fichas)"
