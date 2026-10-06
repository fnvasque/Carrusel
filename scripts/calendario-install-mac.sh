#!/usr/bin/env bash
# Instala en el Mac el render horario del calendario (launchd) y prueba la subida.
#
#   scripts/calendario-install-mac.sh            # instala y prueba
#   scripts/calendario-install-mac.sh --dry-run  # solo muestra lo que haría
#
# Pasos: arma el plist (reemplaza __REPO__ y __CHROMIUM__) → lo copia a
# ~/Library/LaunchAgents/ → launchctl bootout/bootstrap → prueba ssh con clave
# (test -w SERVER_MEDIA_DIR) → sube un JPEG de prueba con rsync → curl -I a su URL
# pública (200 + image/jpeg) → lo borra. Nunca imprime MEDIA_PUBLIC_TOKEN.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

LABEL="es.ia.calendario-render"
PLIST_SRC="deploy/launchd/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
CHROMIUM="${PLAYWRIGHT_CHROMIUM_EXECUTABLE:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell}"

[ -f .env ] || { echo "✗ No encuentro .env en $REPO." >&2; exit 1; }
# Carga .env sin imprimirlo.
set -a; source ./.env; set +a
for v in SERVER_HOST SERVER_MEDIA_DIR MEDIA_PUBLIC_BASE MEDIA_PUBLIC_TOKEN; do
  [ -n "${!v:-}" ] || { echo "✗ Falta $v en .env (ver .env.example)." >&2; exit 1; }
done
# Mismo criterio que render-cli.ts (R34): la ruta pasa por el shell remoto de ssh.
if ! printf '%s' "$SERVER_MEDIA_DIR" | grep -Eq '^[A-Za-z0-9_./-]+$' || printf '%s' "/$SERVER_MEDIA_DIR/" | grep -q '/\.\./' || [ "${SERVER_MEDIA_DIR#-}" != "$SERVER_MEDIA_DIR" ]; then
  echo "✗ SERVER_MEDIA_DIR inválido: solo letras, números y _ . / - (sin espacios, ~, \$, comillas, .. ni - al inicio)." >&2
  exit 1
fi
[ -x "$CHROMIUM" ] || echo "⚠️  No encuentro Chromium en $CHROMIUM (define PLAYWRIGHT_CHROMIUM_EXECUTABLE)."

# Muestra un comando con el token oculto; lo ejecuta salvo en --dry-run.
run() {
  local shown="$*"
  shown="${shown//$MEDIA_PUBLIC_TOKEN/***}"
  if [ "$DRY" = 1 ]; then echo "  (dry-run) $shown"; else echo "→ $shown"; "$@"; fi
}

# Reemplazo seguro para sed (rutas con / o &).
esc() { printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'; }
TMP_PLIST="$(mktemp -t calendario-plist)"
trap 'rm -f "$TMP_PLIST"' EXIT
sed -e "s|__REPO__|$(esc "$REPO")|g" -e "s|__CHROMIUM__|$(esc "$CHROMIUM")|g" "$PLIST_SRC" > "$TMP_PLIST"
plutil -lint "$TMP_PLIST" >/dev/null || { echo "✗ El plist generado no es válido." >&2; exit 1; }

echo "1) launchd ($LABEL, cada hora; log en output/calendario/render.log)"
run mkdir -p "$HOME/Library/LaunchAgents" "$REPO/output/calendario"
run cp "$TMP_PLIST" "$PLIST_DST"
if [ "$DRY" = 1 ]; then
  echo "  (dry-run) launchctl bootout gui/$UID/$LABEL"
else
  launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
fi
run launchctl bootstrap "gui/$UID" "$PLIST_DST"

echo "2) ssh con clave a $SERVER_HOST"
run ssh -o BatchMode=yes -o ConnectTimeout=20 "$SERVER_HOST" "mkdir -p '$SERVER_MEDIA_DIR' && test -w '$SERVER_MEDIA_DIR'"

echo "3) subida de prueba + URL pública"
SEMANA="2000-01-01"; ID="prueba-instalacion"
PRUEBA="$(mktemp -d -t calendario-prueba)"
trap 'rm -f "$TMP_PLIST"; rm -rf "$PRUEBA"' EXIT
if [ "$DRY" = 0 ]; then
  ffmpeg -v error -y -f lavfi -i color=c=0xC6FF3D:s=64x64 -frames:v 1 "$PRUEBA/prueba.jpg"
fi
run rsync -az --chmod=u=rwX,go=rX -e "ssh -o BatchMode=yes" --rsync-path="mkdir -p '$SERVER_MEDIA_DIR/$SEMANA/$ID' && rsync" \
  "$PRUEBA/" "$SERVER_HOST:$SERVER_MEDIA_DIR/$SEMANA/$ID/"
URL="${MEDIA_PUBLIC_BASE%/}/media/$MEDIA_PUBLIC_TOKEN/$SEMANA/$ID/prueba.jpg"
if [ "$DRY" = 1 ]; then
  echo "  (dry-run) curl -sI ${URL//$MEDIA_PUBLIC_TOKEN/***}  → espero 200 e image/jpeg"
else
  HEAD="$(curl -sI --max-time 20 "$URL" || true)"
  if printf '%s' "$HEAD" | head -1 | grep -q ' 200' && printf '%s' "$HEAD" | grep -qi '^content-type: image/jpeg'; then
    echo "✓ El servidor sirve los medios (200, image/jpeg)."
  else
    echo "✗ La URL pública no respondió 200 + image/jpeg. Revisa MEDIA_PUBLIC_BASE, el túnel y SERVER_MEDIA_DIR." >&2
    printf '%s\n' "$HEAD" | head -1 >&2
    FALLO=1
  fi
fi
run ssh -o BatchMode=yes "$SERVER_HOST" "rm -rf '$SERVER_MEDIA_DIR/$SEMANA'"
if [ "${FALLO:-0}" = 1 ]; then
  echo "✗ Instalación incompleta: el agente quedó cargado en launchd, pero la subida no se puede verificar. Corrígelo y vuelve a correr este script." >&2
  exit 1
fi

echo "4) clon propio de la base para el render (nunca la bóveda de Obsidian)"
KB_CAL="${CALENDARIO_KB_DIR:-$HOME/.cache/carrusel/kb-calendario}"
if [ -d "$KB_CAL/.git" ]; then
  echo "✓ Ya existe: $KB_CAL"
else
  ORIGEN="${KB_REPO:-}"
  if [ -z "$ORIGEN" ] && [ -d knowledge ] && [ "$(git -C knowledge rev-parse --show-toplevel 2>/dev/null)" = "$(cd knowledge && pwd -P)" ]; then
    ORIGEN="$(git -C knowledge remote get-url origin 2>/dev/null || true)"
  fi
  if [ -z "$ORIGEN" ]; then
    echo "✗ No sé de dónde clonar la base: define KB_REPO en .env (p. ej. git@github.com:fnvasque/ia-es-kb.git)." >&2
    exit 1
  fi
  run mkdir -p "$(dirname "$KB_CAL")"
  run git clone -q "$ORIGEN" "$KB_CAL"
fi

echo "Listo. Para correrlo ya: launchctl kickstart gui/$UID/$LABEL  (o npm run calendario:render)."
