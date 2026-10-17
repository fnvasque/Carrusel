#!/usr/bin/env bash
# Instala Kokoro-82M (voz en español, local y gratis) para la narración de los reels.
#
#   scripts/kokoro-install.sh [carpeta]     (default: $CARRUSEL_KOKORO_DIR o ~/.cache/carrusel/kokoro)
#
# Crea un venv de Python 3.12 con `uv` (Kokoro no corre en 3.13+), instala kokoro y
# soundfile, instala espeak-ng con Homebrew (respaldo de fonemas del español) y
# prueba una síntesis corta. `src/reel/voz.ts` usa ese venv.
set -euo pipefail

DIR="${1:-${CARRUSEL_KOKORO_DIR:-$HOME/.cache/carrusel/kokoro}}"
command -v uv >/dev/null || { echo "✗ Falta uv (https://docs.astral.sh/uv/): curl -LsSf https://astral.sh/uv/install.sh | sh" >&2; exit 1; }
command -v brew >/dev/null || { echo "✗ Falta Homebrew (para espeak-ng)" >&2; exit 1; }
brew list espeak-ng >/dev/null 2>&1 || brew install -q espeak-ng

mkdir -p "$(dirname "$DIR")"
[ -x "$DIR/bin/python" ] || uv venv -q -p 3.12 "$DIR"
uv pip install -q -p "$DIR/bin/python" "kokoro>=0.9.4" soundfile

export ESPEAK_DATA_PATH="$(brew --prefix)/share/espeak-ng-data"
export PHONEMIZER_ESPEAK_LIBRARY="$(brew --prefix)/lib/libespeak-ng.dylib"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
echo "Hola, esto es una prueba de voz." | "$DIR/bin/python" "$HERE/scripts/kokoro-tts.py" --voz em_alex --out "$TMP/prueba.wav" >/dev/null 2>&1 \
  || { echo "✗ Kokoro no pudo sintetizar (revisa la salida: $DIR/bin/python $HERE/scripts/kokoro-tts.py)" >&2; exit 1; }
rm -rf "$TMP"
echo "✓ Kokoro listo en $DIR (voz em_alex probada). La primera síntesis descarga el modelo (~330 MB)."
