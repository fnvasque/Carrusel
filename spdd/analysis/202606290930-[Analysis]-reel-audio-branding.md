# SPDD Analysis: Loop 4 — Audio opcional + branding (barra de progreso)

## Original Business Requirement
Último loop del exportador Reel. (1) **Audio opcional** (`--audio archivo.mp3`): mux de una pista,
recortada a la duración del video con fade-out. (2) **Branding/retención**: una **barra de progreso
cian** (color de marca) que crece de izquierda a derecha durante el reel. Gate: `npm run typecheck`
+ generar mp4 con y sin audio + ffprobe (video con/sin stream de audio, dims, duración).

## Domain Concept Identification

### Existing Concepts (from codebase)
- **composeReel** (`src/reel/video.ts`): construye el filtergraph (zoompan + xfade) y ejecuta ffmpeg; hoy sin audio (`-an`) y sin overlay de marca.
- **reel CLI** (`src/reel/cli.ts`): parsea flags y llama a composeReel.
- **Marca**: cian `#22D3EE` (0x22D3EE) es el acento de marca (design-brand.md).

### New Concepts Required
- **Pista de audio opcional**: input extra de ffmpeg, con `afade` (out) + `atrim` a la duración del video.
- **Barra de progreso**: `drawbox` sobre la salida de video, ancho proporcional a `t/DUR`, color cian, en el borde superior.

### Key Business Rules
- **IG reach**: por defecto SIN audio (el trending se añade en la app); el audio propio es opt-in para posteo nativo / TikTok / Shorts.
- **Marca**: la barra usa el cian exacto de marca; sutil (≈8px), no invasiva.
- **No romper** lo anterior: sin `--audio` el comportamiento es el del loop 3 + la barra.

## Strategic Approach

### Solution Direction
Extender `composeReel` con `opts.audio?`. La cadena de video termina aplicando un `drawbox` (barra cian
que crece con `t`) sobre la etiqueta final; el resultado se mapea a la salida. Si hay audio, se añade un
input extra y una cadena `afade,atrim` que se mapea como pista AAC; la duración del video es finita
(xfade), así que el `atrim` a `DUR` evita audio sobrante sin necesitar `-shortest`.

### Key Design Decisions
- **Barra de progreso con `drawbox` y `w='iw*min(t/DUR\,1)'`**: crece L→R; cap a 1. Color `0x22D3EE`, h=8, y=0 (borde superior, fuera de la zona segura inferior). → Branded + retención (goal-gradient), sin tapar contenido.
- **Audio opt-in (`--audio`)**: default sin audio (mejor para IG). → Respeta la estrategia; flexible para otros destinos.
- **`atrim=0:DUR` + `afade out` 0.6s**: corta y suaviza el final; como el video es finito, no hace falta `-shortest`. → Evita cortar el video si el audio es más largo/corto.
- **DUR calculado en composeReel** desde `durations`+`fade`: una sola fuente de la duración. → Coherencia con la barra y el atrim.

### Alternatives Considered
- **End-card de marca (slide extra de outro)**: descartado — el CTA ya cierra; un outro alarga el reel ya largo.
- **`-shortest`**: descartado — recortaría el video si el audio fuera más corto; mejor `atrim` al video finito.
- **Barra inferior**: descartado — compite con la zona segura/UI de IG; arriba queda limpia.

## Risk & Gap Analysis

### Requirement Ambiguities
- **De dónde sale el audio**: lo provee el usuario (`--audio ruta.mp3`); no se incluye una librería de pistas (derechos). Registrado.

### Edge Cases
- **Sin `--audio`**: salida `-an` (como loop 3) + barra. 
- **Audio inexistente/ruta mala**: ffmpeg falla; el error de stderr se reporta claro.
- **Audio más corto que el video**: termina antes (silencio al final); aceptable. Más largo: `atrim` lo corta.
- **N=1**: barra aplicada igual sobre el clip único.

### Technical Risks
- **Sintaxis drawbox/afade en el filtergraph** → ffmpeg falla. Mitigación: construir programáticamente + gate con y sin audio + ffprobe.
- **Formato de audio** (mp3/m4a/wav): ffmpeg los acepta; salida AAC 128k. Bajo riesgo.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | `--audio` muxea pista recortada + fade out | Yes | afade/atrim |
| 2 | Barra de progreso cian creciente, siempre | Yes | drawbox |
| 3 | Sin --audio → sin stream de audio (`-an`) | Yes | ffprobe |
| 4 | Reel sigue 1080×1920 h264 | Yes | ffprobe |
| 5 | Gate verde con y sin audio | Yes | typecheck + ffprobe x2 |

### Decisiones tomadas autónomamente
- Barra: cian `0x22D3EE`, alto 8px, borde superior, ancho `iw*min(t/DUR,1)`.
- Audio default OFF; `--audio` opt-in; salida AAC 128k; fade out 0.6s; `atrim=0:DUR` (sin `-shortest`).
- DUR calculado en composeReel desde durations+fade.
