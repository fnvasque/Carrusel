#!/usr/bin/env bash
# Mueve el bot del Mac al servidor (se corre en el Mac, desde el repo donde está tu .env
# y tu base). Antes: scripts/server-setup.sh en el servidor.
#
#   scripts/deploy-to-server.sh ubuntu@<ip>          # primera vez: migra todo y arranca
#   scripts/deploy-to-server.sh ubuntu@<ip> --update # después: solo actualiza el código
#                                                    # (y crea ~/carrusel/media si falta)
#
# Pasos (primera vez): registra la clave de deploy en GitHub → apaga el bot y ngrok del
# Mac → sube lo último de la base → copia .env e índice → arranca los contenedores.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${1:?Uso: scripts/deploy-to-server.sh usuario@ip [--update]}"
MODE="${2:-}"
KB_REPO_SLUG="${KB_REPO_SLUG:-fnvasque/ia-es-kb}"
REMOTE_DIR="carrusel"
SSH=(ssh -o StrictHostKeyChecking=accept-new "$HOST")

"${SSH[@]}" "test -d $REMOTE_DIR/keys" || { echo "✗ Corre primero scripts/server-setup.sh en el servidor." >&2; exit 1; }

# Carpeta de medios del calendario (volumen ./media -> /data/media). La crea el usuario SSH: si la crea
# Docker al arrancar queda de root y el rsync del Mac no puede escribir en ella.
if [ "$MODE" = "--update" ]; then
  "${SSH[@]}" "cd $REMOTE_DIR && mkdir -p media && git pull -q && docker compose up -d --build && docker compose ps"
  # Avisa (sin imprimir valores) si al .env del servidor le faltan las variables del calendario.
  for v in MEDIA_PUBLIC_TOKEN MEDIA_PUBLIC_BASE CALENDARIO_MODO; do
    "${SSH[@]}" "grep -q '^$v=.' $REMOTE_DIR/.env" 2>/dev/null \
      || echo "⚠️  Falta $v en ~/$REMOTE_DIR/.env del servidor (ver deploy/README.md, sección del calendario)." >&2
  done
  exit 0
fi

[ -f .env ] || { echo "✗ No encuentro .env aquí." >&2; exit 1; }

echo "→ Registrando la clave de deploy del servidor en $KB_REPO_SLUG (con permiso de escritura)…"
PUB="$("${SSH[@]}" "cat $REMOTE_DIR/keys/kb_deploy.pub")"
TMPKEY="$(mktemp)"; echo "$PUB" > "$TMPKEY"
gh repo deploy-key add "$TMPKEY" --repo "$KB_REPO_SLUG" --allow-write --title "servidor $(echo "$HOST" | cut -d@ -f2)" 2>/dev/null \
  || echo "  (ya estaba registrada)"
rm -f "$TMPKEY"

read -r -p "Esto apaga el bot y ngrok de este Mac (solo puede correr en un lugar). ¿Sigo? [s/N] " ok
[ "$ok" = "s" ] || exit 1
pkill -f "src/kb/bot.ts" || true
pkill -x ngrok || true

if git ls-files --error-unmatch knowledge >/dev/null 2>&1; then
  echo "→ Subiendo lo último de la base al repo privado…"
  scripts/kb-export.sh .
fi

echo "→ Copiando .env e índice al servidor…"
ENV_TMP="$(mktemp)"
grep -v -E '^(KB_DIR|KB_GIT_PUSH|KB_GIT)=' .env > "$ENV_TMP"
if ! grep -q '^NGROK_AUTHTOKEN=' "$ENV_TMP"; then
  NGROK_TOKEN="$(ngrok config check >/dev/null 2>&1 && grep -E '^[[:space:]]*authtoken:' "$HOME/Library/Application Support/ngrok/ngrok.yml" | awk '{print $2}' || true)"
  if [ -n "$NGROK_TOKEN" ]; then printf '\n# Túnel del webhook (compose.yaml)\nNGROK_AUTHTOKEN=%s\n' "$NGROK_TOKEN" >> "$ENV_TMP"; fi
fi
scp -q "$ENV_TMP" "$HOST:$REMOTE_DIR/.env"
rm -f "$ENV_TMP"
"${SSH[@]}" "chmod 600 $REMOTE_DIR/.env && mkdir -p $REMOTE_DIR/media $REMOTE_DIR/data/knowledge/.index"
# El índice guarda estado que no se reconstruye: cola, DMs vistos, cupo semanal de hashtags, caché de embeddings.
if [ -f knowledge/.index/kb.sqlite ] && ! "${SSH[@]}" "test -f $REMOTE_DIR/data/knowledge/.index/kb.sqlite"; then
  sqlite3 knowledge/.index/kb.sqlite ".backup '/tmp/kb-deploy.sqlite'"
  scp -q /tmp/kb-deploy.sqlite "$HOST:$REMOTE_DIR/data/knowledge/.index/kb.sqlite"
  rm -f /tmp/kb-deploy.sqlite
fi

echo "→ Arrancando en el servidor…"
"${SSH[@]}" "cd $REMOTE_DIR && git pull -q && docker compose up -d --build && sleep 20 && docker compose ps && docker compose logs --tail=15 kb"

echo
echo "✓ Bot corriendo en el servidor. Prueba: manda un link al bot de Telegram con este Mac apagado."
echo "  Para que Obsidian lea la base desde el repo privado: scripts/kb-use-private-repo.sh"
