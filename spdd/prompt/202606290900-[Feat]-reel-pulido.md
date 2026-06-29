# Pulido del Reel (legibilidad, swipe, zoom alternado, holds)

## Requirements
- "DESLIZA →" no debe aparecer en formato reel.
- Cada slide dura según su cantidad de texto; hook y CTA con hold extra.
- Zoom alternado (in/out) por slide; reel sigue 1080×1920 h264 sin audio.

## Entities
```mermaid
classDiagram
direction TB
class Hook { oculta swipe si format=reel }
class reelCli { durations[] desde el texto -> composeReel }
class composeReel { (frames, durations[], opts) zoom alternado + xfade prefixSum }
reelCli --> composeReel
```

## Approach
1. `Hook`: destructurar `format`; `showSwipe = swipe !== false && format !== "reel"`; pasar `format` explícito a `<Frame>`.
2. `composeReel(frames, durations, outPath, opts)`: duración por slide (vector); dirección de zoom alternada (par=in, impar=out); offsets `xfade` por suma-prefija.
3. `reel/cli.ts`: calcular `durations[]` desde el texto de cada slide (+hold hook/CTA) y pasarlas a `composeReel`.

## Operations

### Update Template - src/templates/Hook.tsx
1. Añadir `format` a la destructuración; reenviarlo a `<Frame format={format} ...>`.
2. `const showSwipe = swipe !== false && format !== "reel";` usar `showSwipe` en el render del "DESLIZA →".

### Update Module - src/reel/video.ts
1. Firma: `composeReel(frames: string[], durations: number[], outPath: string, opts: { fade?: number; fps?: number } = {})`.
2. Validar `durations.length === frames.length`.
3. Por input i: `-loop 1 -framerate fps -t ${durations[i]} -i frame`.
4. zoom por slide: `stepI = 0.10/(durations[i]*fps)`; dir = `i%2===0` → in `z='min(1+stepI*on\,1.10)'`; impar → out `z='max(1.10-stepI*on\,1.0)'`. Resto del zoompan igual (d=1, s=1080x1920, fps, setsar=1).
5. xfade: `offset_j = (sum durations[0..j-1]) - j*fade` para j=1..N-1; encadenar como antes.
6. `reelDuration(durations, fade)` = `sum(durations) - (n-1)*fade`.

### Update CLI - src/reel/cli.ts
1. Helper `slideSeconds(props, isHookOrCta)`: chars = largo de los campos de texto (title, subtitle, eyebrow, heading, body, bullets, text, kicker, quote, reality, myth, reason, note); `s = clamp(2.4, 1.8 + chars/26, 4.8)`; si hook/CTA `s += 0.7`.
2. Construir `durations[]` (primer slide y último marcados como hook/CTA por posición/plantilla).
3. Llamar `composeReel(framePaths, durations, mp4, { fade })`. Mantener `--fade`, `--frames-only`. `--seconds` pasa a ser opcional override que fija duración uniforme si se da.
4. Log: duración total desde `reelDuration`.

### Verify
1. `npm run typecheck`.
2. `npm run reel carousels/estudiar-3-ias.ts` → reel.mp4; el slide 1 del reel NO muestra "DESLIZA →".
3. `ffprobe`: 1080×1920 h264 sin audio; duración ≈ suma de duraciones variables (≠ 17.2 fijo).

## Norms
1. video.ts agnóstico al contenido (solo números); el CLI calcula tiempos.
2. Reproducible; zoom sutil (≤10%).
3. Aditivo: post 4:5 intacto.

## Safeguards
1. Reel sin "DESLIZA →"; carrusel 4:5 lo mantiene.
2. Duración total = sum(durations) − (N−1)·fade (verificable por ffprobe).
3. Zoom alternado no excede ±10%.
4. N=1 soportado.
5. Gate: typecheck + ffprobe + revisión visual del slide 1 del reel.
