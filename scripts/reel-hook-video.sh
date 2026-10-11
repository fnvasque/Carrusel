#!/usr/bin/env bash
# Pone un clip de video (Kling, Genjutsu, Seedance…) DETRÁS del hook de un reel ya
# renderizado, sin retrasar el texto: el texto del hook se ve desde el cuadro 0.
#
#   scripts/reel-hook-video.sh <reel.mp4> <clip.mp4> <salida.mp4> [segundos] [brillo]
#
#   segundos  cuánto dura el clip sobre el reel (def. 5; el hook dura ≤ 6 s)
#   brillo    cuánto se oscurece el clip, 0–1 (def. 0.45; más bajo = texto más legible)
#
# Cómo: el clip se escala/recorta a 1080×1920, se oscurece, se desvanece a negro en
# el último medio segundo y se mezcla con el reel en modo "lighten" (máximo por canal,
# en RGB). Como el fondo del reel es casi negro, el clip aparece detrás; el texto
# blanco y el acento lima siguen encima porque son más claros que el clip oscurecido.
# Pasado el clip todo es negro → el reel queda idéntico. El audio se copia tal cual.
set -euo pipefail

[ $# -ge 3 ] || { sed -n '2,8p' "$0" >&2; exit 1; }
REEL="$1"; CLIP="$2"; OUT="$3"; SEG="${4:-5}"; BRILLO="${5:-0.45}"
for f in "$REEL" "$CLIP"; do [ -f "$f" ] || { echo "✗ No existe $f" >&2; exit 1; }; done
command -v ffmpeg >/dev/null || { echo "✗ Falta ffmpeg" >&2; exit 1; }

read -r W H FPS < <(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$REEL" | tr ',' ' ')
FADE=$(awk -v s="$SEG" 'BEGIN{print (s>0.5)? s-0.5 : 0}')

ffmpeg -v error -y -i "$REEL" -i "$CLIP" -filter_complex "
  [1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},
       trim=duration=${SEG},setpts=PTS-STARTPTS,
       colorchannelmixer=rr=${BRILLO}:gg=${BRILLO}:bb=${BRILLO},
       fade=t=out:st=${FADE}:d=0.5,
       tpad=stop_mode=add:stop_duration=36000:color=black,format=gbrp[clip];
  [0:v]format=gbrp[reel];
  [reel][clip]blend=all_mode=lighten:shortest=1,format=yuv420p[v]" \
  -map '[v]' -map '0:a?' -c:v libx264 -preset slow -crf 18 -c:a copy \
  -movflags +faststart "$OUT"

echo "✓ $OUT"
