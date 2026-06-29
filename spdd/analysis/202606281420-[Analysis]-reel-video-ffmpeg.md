# SPDD Analysis: Loop 2 — Componer reel.mp4 con ffmpeg

## Original Business Requirement
Segundo loop del exportador Carrusel → Reel. Componer los frames 9:16 (loop 1) en un único
`reel.mp4` 1080×1920 listo para Instagram: duración por slide, **zoom sutil (Ken Burns)** y
**transiciones** (crossfade) entre slides. Sin audio (el trending se añade en IG). Gate:
`npm run typecheck` + generar el mp4 + verificar con ffprobe (dims/duración/codec).

## Domain Concept Identification

### Existing Concepts (from codebase)
- **reel CLI** (`src/reel/cli.ts`): hoy solo vuelca PNGs 9:16 a `output/<name>/reel/`. Debe, además, componer el mp4.
- **ffmpeg/ffprobe**: disponibles en el entorno (v8.0). Es la herramienta de composición.
- **output/<name>/reel/slide-NN.png**: frames de entrada (1080×1920).

### New Concepts Required
- **composeReel**: módulo que construye y ejecuta el comando ffmpeg (zoompan + xfade) desde Node (`child_process.spawn`).
- **Parámetros de tempo**: segundos por slide (`--seconds`, default 2.8) y duración de transición (`--fade`, default 0.4), FPS 30.

### Key Business Rules
- **Salida nativa IG**: 1080×1920, h264, `yuv420p`, `+faststart`, 30fps, **sin audio**.
- **Prolijo**: movimiento sutil (no mareante) + crossfades suaves.
- **Reproducible**: mismo carrusel → mismo mp4 (sin aleatoriedad).

## Strategic Approach

### Solution Direction
Tras renderizar los PNGs, construir un `filter_complex` de ffmpeg: cada imagen se carga en bucle por
`D` segundos, se le aplica `zoompan` (zoom-in sutil hasta 1.10) y luego se encadenan con `xfade`
(crossfade) usando offsets acumulados. Se ejecuta con `spawn` (args en array, sin shell) y se valida con
ffprobe. La duración total = `N*D − (N−1)*fade`.

### Key Design Decisions
- **zoompan con `on` por instancia + `d=1` sobre stream a FPS**: da un zoom suave y reproducible por slide. Trade-off = expresión algo críptica vs. movimiento limpio. → Estándar de ffmpeg para Ken Burns.
- **xfade encadenado con offset `j*(D−fade)`**: fórmula cerrada para N slides. → Determinista; evita librerías extra.
- **`spawn` con args en array** (no `exec` con string): evita problemas de comillas en el filtergraph. → Robustez.
- **Sin audio por defecto**: en IG conviene subir el video y poner audio en tendencia dentro de la app (más alcance). El audio propio se aborda en el loop 4 (opcional). → Mejor para el objetivo.
- **Composición integrada en `npm run reel`** (render PNGs → mp4), con flag `--frames-only` para solo PNGs. → Un solo comando.

### Alternatives Considered
- **Remotion (React→video)**: rechazado para esto — pesado; ffmpeg desde los PNGs ya producidos es directo y suficiente.
- **Playwright video recording**: rechazado — timing y calidad menos controlables que PNG→ffmpeg.
- **Concat demuxer sin xfade**: rechazado — cortes secos; queremos transiciones suaves.

## Risk & Gap Analysis

### Requirement Ambiguities
- **Tempo exacto**: 2.8s/slide + 0.4s fade como default; configurable y afinable en el loop 3 (pulido). Registrado.

### Edge Cases
- **1 solo slide**: sin xfade; solo zoompan a un clip (manejar N=1).
- **Muchos slides**: el filtergraph crece; ffmpeg lo soporta. Tiempo de encode mayor (aceptable).
- **PNG faltante**: si no se renderizaron frames, abortar con mensaje claro.

### Technical Risks
- **Sintaxis del filtergraph** (zoompan/xfade offsets): error → ffmpeg falla. Mitigación: construir args programáticamente + validar con ffprobe en el gate; probar con el carrusel real de 7 slides.
- **yuv420p / dimensiones pares**: 1080×1920 son pares; `yuv420p` para compatibilidad IG. Mitigado por flags fijos.
- **Rendimiento**: zoompan es CPU-intensivo; 7 frames × ~17s a 30fps es rápido en local.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | `npm run reel` produce output/<name>/reel.mp4 | Yes | integra render+compose |
| 2 | mp4 1080×1920 h264 yuv420p, sin audio | Yes | flags fijos; ffprobe |
| 3 | Zoom sutil + crossfades | Yes | zoompan + xfade |
| 4 | Tempo configurable (--seconds/--fade) | Yes | defaults 2.8/0.4 |
| 5 | Gate verde (typecheck + ffprobe) | Yes | dims/dur/codec |

### Decisiones tomadas autónomamente
- Tempo default 2.8s/slide, fade 0.4s, 30fps.
- zoompan zoom-in hasta 1.10 en todos los slides (alternar dirección = loop 3).
- Sin audio (audio propio opcional en loop 4).
- Composición integrada en `npm run reel`; `--frames-only` para solo PNGs.
