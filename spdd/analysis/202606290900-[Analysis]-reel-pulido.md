# SPDD Analysis: Loop 3 — Pulido del Reel (legibilidad, swipe, zoom, holds)

## Original Business Requirement
Tercer loop del exportador Reel. Pulir para que quede prolijo: (1) **ocultar "DESLIZA →" en reel**
(es un video, no se desliza); (2) **duración por slide según la longitud del texto** (legibilidad =
retención); (3) **zoom alternado** (in/out) por slide para variedad; (4) **hold extra** en hook y CTA.
Gate: `npm run typecheck` + regenerar el mp4 + verificar duración variable con ffprobe.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **Hook** (`src/templates/Hook.tsx`): pinta "DESLIZA →" siempre que `swipe`. No lee `format` hoy.
- **composeReel** (`src/reel/video.ts`): usa una duración fija `secondsPerSlide` para todos los slides y zoom-in fijo.
- **reel CLI** (`src/reel/cli.ts`): tiene los `props` de cada slide (puede medir el texto) y llama a `composeReel`.

### New Concepts Required
- **Duración por slide**: vector `durations[]` calculado del largo del texto de cada slide (con holds para hook/CTA), en vez de un único valor.
- **Dirección de zoom alternada**: in en slides pares, out en impares.
- **Supresión de swipe en reel**: Hook oculta "DESLIZA →" cuando `format==="reel"`.

### Key Business Rules
- **Legibilidad**: un slide con más texto se muestra más tiempo (el lector alcanza a leer) → retención.
- **Coherencia de formato**: "DESLIZA →" solo tiene sentido en carrusel, no en video.
- **Prolijo, no mareante**: zoom sutil; alternarlo da ritmo sin exagerar.

## Strategic Approach

### Solution Direction
`composeReel` pasa a aceptar un **vector de duraciones** (una por frame) y alterna la dirección del
zoom por índice; los offsets de `xfade` se recalculan con sumas-prefijas de duraciones variables. El CLI
calcula cada duración a partir del largo del texto del slide (con un bonus de "hold" para el primero/hook
y el último/CTA). `Hook` lee `format` y omite "DESLIZA →" en reel.

### Key Design Decisions
- **Duración por texto en el CLI** (no en video.ts): el CLI conoce los `props`; video.ts queda agnóstico (solo recibe números). → Separación limpia.
- **Fórmula `clamp(2.4, 1.8 + chars/26, 4.8)` + hold 0.7 a hook/CTA**: heurística simple de lectura; afinable. → Suficiente y reproducible.
- **xfade con offset = prefixSum(durations, j) − j·fade**: generaliza la fórmula fija a duraciones variables. → Correcto para tempo variable.
- **Zoom alternado (par=in, impar=out)** con `zoomStep` por slide = 0.10/(D_i·fps): mantiene la amplitud del zoom constante aunque cambie la duración. → Movimiento uniforme.
- **Hook lee `format` y reenvía a Frame**: destructurar `format` y pasarlo explícito a `<Frame>` (sigue llegando). → No rompe el layout.

### Alternatives Considered
- **Duración fija con fade variable**: rechazado — no resuelve legibilidad.
- **Medir el texto renderizando/midiendo en DOM**: rechazado — innecesario; el conteo de caracteres basta como proxy.
- **Quitar también el chip de progreso en reel**: descartado por ahora — el "02/07" no molesta y da sensación de serie; se puede revisar luego.

## Risk & Gap Analysis

### Requirement Ambiguities
- **Pesos de la fórmula de duración**: heurística; validación visual + ffprobe (duración total) en el gate. Registrado.

### Edge Cases
- **Slide con poquísimo texto** (ej. Quote corta): cae al mínimo 2.4s.
- **N=1**: sin xfade; un clip con su duración y zoom.
- **Zoom-out**: arranca en 1.10; primer frame ya ampliado (correcto, no salta).

### Technical Risks
- **Offsets mal recomputados con duraciones variables** → solapamientos/cortes. Mitigación: fórmula prefixSum verificada + revisar un frame de crossfade + duración total con ffprobe.
- **Hook al destructurar `format` deja de pasarlo a Frame** → reel saldría 4:5 en el hook. Mitigación: reenviar `format` explícito; gate visual del slide 1 del reel.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | "DESLIZA →" no aparece en reel | Yes | Hook lee format |
| 2 | Duración por slide según texto + holds | Yes | CLI calcula durations[] |
| 3 | Zoom alternado in/out | Yes | por índice en video.ts |
| 4 | Reel sigue 1080×1920 h264 sin audio | Yes | ffprobe |
| 5 | Gate verde | Yes | typecheck + ffprobe + visual |

### Decisiones tomadas autónomamente
- Duración = clamp(2.4, 1.8 + chars/26, 4.8); hold +0.7 a hook (primer slide) y CTA (último).
- Zoom: par=in, impar=out; amplitud 10% constante.
- composeReel recibe `durations: number[]`; offsets por prefixSum.
- Hook oculta swipe en reel; el chip de progreso se mantiene.
