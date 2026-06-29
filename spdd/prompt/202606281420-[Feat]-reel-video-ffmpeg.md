# Componer reel.mp4 con ffmpeg

## Requirements
- Componer los frames 9:16 en un reel.mp4 1080×1920 listo para IG (h264/yuv420p, sin audio).
- Zoom sutil (Ken Burns) por slide + crossfades entre slides.
- Tempo configurable; integrado en `npm run reel`; reproducible.

## Entities
```mermaid
classDiagram
direction TB
class reelCli { render PNGs -> composeReel }
class composeReel { (frames, opts) -> reel.mp4 via ffmpeg spawn }
class ReelOpts { secondsPerSlide=2.8 · fade=0.4 · fps=30 }
reelCli --> composeReel
composeReel --> ReelOpts
```

## Approach
1. `src/reel/video.ts` → `composeReel(frames: string[], outPath: string, opts)`:
   - Construye inputs `-loop 1 -t D -i frame` por imagen.
   - filter_complex: por input `fps,zoompan(zoom-in≤1.10, on, d=1, s=1080x1920)` → `[vk]`.
   - Encadena `xfade=transition=fade:duration=fade:offset=j*(D-fade)` para j=1..N-1.
   - Salida: `-r 30 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an outPath`.
   - N=1: sin xfade, solo el zoompan del único clip.
   - Ejecuta con `child_process.spawn("ffmpeg", args)`; resuelve/rechaza por exit code; reenvía stderr en error.
2. `reel/cli.ts`: tras escribir los PNGs, llamar `composeReel(framePaths, output/<name>/reel.mp4, opts)`. Flags `--seconds`, `--fade`, `--frames-only`.

## Structure
### Relaciones
1. `reel/cli.ts` → `composeReel` (video.ts) → ffmpeg.
### Capas
CLI `src/reel/cli.ts`; composición `src/reel/video.ts`; binario externo ffmpeg.

## Operations

### Create Module - src/reel/video.ts
1. `export interface ReelOpts { secondsPerSlide?: number; fade?: number; fps?: number; }`
2. `export async function composeReel(frames: string[], outPath: string, opts?: ReelOpts): Promise<void>`
   - Defaults D=2.8, fade=0.4, fps=30.
   - Validar `frames.length >= 1`.
   - Inputs: para cada frame → `["-loop","1","-t",String(D),"-i",frame]`.
   - filterParts: por i → `[${i}:v]fps=${fps},zoompan=z='min(1+0.0012*on\,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920[v${i}]`.
   - Si N==1: map `[v0]` a salida. Si N>1: encadenar xfade: acumular label previa; `[prev][v${i}]xfade=transition=fade:duration=${fade}:offset=${(i)*(D-fade)}[x${i}]` (offset = i*(D-fade), i=1..N-1); última etiqueta = salida.
   - args finales: `[...inputs, "-filter_complex", graph, "-map", finalLabel, "-r", fps, "-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart","-an","-y", outPath]`.
   - `spawn("ffmpeg", args)`, capturar stderr; en exit≠0 throw con las últimas líneas de stderr.

### Update CLI - src/reel/cli.ts
1. Parsear flags: `--seconds=`, `--fade=`, `--frames-only`.
2. Tras renderizar y juntar `framePaths`, si no `--frames-only`: `await composeReel(framePaths, join(reelDir,"..","reel.mp4"), { secondsPerSlide, fade })` → `output/<name>/reel.mp4`.
3. Log con la ruta del mp4 y duración estimada (`N*D-(N-1)*fade`).

### Verify
1. `npm run typecheck`.
2. `npm run reel carousels/estudiar-3-ias.ts` → output/estudiar-3-ias/reel.mp4.
3. `ffprobe` del mp4: width=1080, height=1920, codec=h264, sin stream de audio, duración ≈ esperada.

## Norms
1. Args de ffmpeg en array (sin shell); filtergraph construido programáticamente.
2. Reproducible (sin aleatoriedad).
3. Mensajes de error claros con stderr de ffmpeg.

## Safeguards
1. Salida 1080×1920 h264 yuv420p sin audio (verificado por ffprobe).
2. N=1 soportado (sin xfade).
3. Frames faltantes → error claro.
4. `--frames-only` mantiene el comportamiento del loop 1.
5. Gate: typecheck + ffprobe del mp4.
