#!/usr/bin/env bash
# Arranque del contenedor: deja la base (repo git privado) lista en $KB_DIR y luego
# corre el comando (por defecto, el bot).
#
#   KB_REPO        repo privado de la base (p. ej. git@github.com:<tú>/ia-es-kb.git)
#   KB_GIT_NAME    autor de los commits del bot (default: "ia.es bot")
#   KB_GIT_EMAIL   (default: bot@ia.es.local)
set -euo pipefail

KB_DIR="${KB_DIR:-/data/knowledge}"

if [ -n "${KB_REPO:-}" ]; then
  mkdir -p "$KB_DIR"
  # El volumen pertenece al usuario del host y el contenedor corre como root: git lo rechaza sin esto.
  git config --global --add safe.directory "$KB_DIR"
  # Un init a medias (arranque interrumpido) se rehace.
  if [ -d "$KB_DIR/.git" ] && ! git -C "$KB_DIR" rev-parse -q --verify HEAD >/dev/null 2>&1; then
    rm -rf "$KB_DIR/.git"
  fi
  if [ ! -d "$KB_DIR/.git" ]; then
    # init + fetch (no clone): así funciona aunque ya exista .index/ (índice copiado desde el Mac).
    echo "→ Preparando la base desde $KB_REPO…"
    git -C "$KB_DIR" init -q -b main
    git -C "$KB_DIR" remote add origin "$KB_REPO"
    git -C "$KB_DIR" fetch -q origin main
    git -C "$KB_DIR" checkout -q -f -B main --track origin/main
  fi
  git -C "$KB_DIR" config user.name "${KB_GIT_NAME:-ia.es bot}"
  git -C "$KB_DIR" config user.email "${KB_GIT_EMAIL:-bot@ia.es.local}"
  # Trae lo que hayas editado en Obsidian mientras el contenedor estaba abajo.
  git -C "$KB_DIR" pull -q --rebase --autostash || echo "⚠️  No pude traer cambios de la base; sigo con la copia local."
fi

exec "$@"
