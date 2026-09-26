# Reel: biblioteca de Instagram (10 s, 9:16)

Animación por código del sistema `kb` (Instagram → Telegram → ficha → Obsidian → pregunta).
`reel.html` expone `render(t)`, que dibuja el cuadro del segundo `t` de forma determinista.

```bash
node promo/reel-biblioteca/render.mjs promo/reel-biblioteca/frames   # 300 PNG a 30 fps
ffmpeg -framerate 30 -i promo/reel-biblioteca/frames/f%04d.png -c:v libx264 -crf 16 \
  -pix_fmt yuv420p -movflags +faststart promo/reel-biblioteca/reel-biblioteca-9x16.mp4
```
