#!/usr/bin/env python
"""Narración en español con Kokoro-82M (local, Apache-2.0).

    kokoro-tts.py --voz em_alex --out narracion.wav < texto.txt

Lee el texto por stdin y escribe un WAV mono a 24 kHz. Lo llama
`src/reel/voz.ts` desde el venv que instala `scripts/kokoro-install.sh`;
espeak-ng (respaldo de fonemas) llega por las variables ESPEAK_DATA_PATH y
PHONEMIZER_ESPEAK_LIBRARY que fija el mismo instalador.
"""
import argparse
import os
import sys
import warnings

warnings.filterwarnings("ignore")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voz", default="em_alex")
    ap.add_argument("--out", required=True)
    ap.add_argument("--velocidad", type=float, default=1.0)
    args = ap.parse_args()
    texto = sys.stdin.read().strip()
    if not texto:
        print("texto vacío", file=sys.stderr)
        return 2
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    pipeline = KPipeline(lang_code="e", repo_id="hexgrad/Kokoro-82M")
    partes = [a for _, _, a in pipeline(texto, voice=args.voz, speed=args.velocidad)]
    if not partes:
        print("Kokoro no devolvió audio", file=sys.stderr)
        return 3
    audio = np.concatenate(partes)
    sf.write(args.out, audio, 24000)
    print(f"{len(audio) / 24000:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
