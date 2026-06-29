# SPDD Analysis: Loop 1 — Render nativo 9:16 para Reels

## Original Business Requirement
Primer loop del exportador Carrusel → Reel. Dar al motor la capacidad de renderizar los slides en
formato vertical **9:16 (1080×1920)**, nativo para Reels, respetando la **zona segura** de DESIGN.md
("sin texto clave en los últimos 420 px"). Salida: PNGs verticales en `output/<name>/reel/`. La
composición a video (mp4) es el loop 2. Gate: `npm run typecheck` + render de prueba 9:16.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **CANVAS** (`src/templates/types.ts`): `{ width:1080, height:1350 }` const, formato post 4:5. Lo usan `Frame` (tamaño del lienzo) y `Renderer` (viewport).
- **Frame** (`src/templates/Frame.tsx`): pinta el lienzo a `CANVAS.width/height` con `padding` fijo; ancla logo/chip/progreso/fuente. Hay que hacerlo consciente del formato y de la zona segura.
- **Renderer** (`src/render/renderSlide.ts`): `init()` fija el viewport a `CANVAS`. Debe aceptar dimensiones.
- **cli.ts** (`generate`): renderiza a 4:5 (no cambia su comportamiento).
- **BaseSlideProps**: contrato compartido; punto para añadir `format`.

### New Concepts Required
- **Format / FORMATS**: `post` (1080×1350) y `reel` (1080×1920); tipo `Format` y mapa de dimensiones.
- **Zona segura del Reel**: margen inferior reservado (≥420px) para que el texto clave no quede tapado por la UI de IG.
- **Reel render CLI** (`npm run reel`): renderiza los slides del carrusel en 9:16 a `output/<name>/reel/slide-NN.png` (en loop 2 además compone el mp4).

### Key Business Rules
- **Zona segura** (DESIGN.md §4): nada de texto clave en los últimos 420 px del Reel.
- **Reutilización**: el Reel sale de los MISMOS carruseles/plantillas; no se duplican plantillas.
- **No romper el post 4:5**: `generate` sigue idéntico (formato post por defecto).

## Strategic Approach

### Solution Direction
Introducir un concepto de **formato** parametrizable. `Frame` lee `format` (default `post`) de sus props,
busca las dimensiones en `FORMATS` y aplica un padding inferior mayor en `reel` para mantener el contenido
sobre la zona segura. `Renderer` acepta dimensiones en `init()`. Un nuevo CLI `reel` crea el Renderer en
1080×1920, inyecta `format:"reel"` a cada slide y vuelca PNGs verticales. El pipeline de fondos (incl. IA)
se reutiliza tal cual.

### Key Design Decisions
- **`format?: "post" | "reel"` en BaseSlideProps** (default post): viaja por `...base` a `Frame` sin tocar cada plantilla. → Mínima sorpresa, aditivo.
- **Dimensiones en `FORMATS`** (no constantes sueltas): un solo lugar de verdad; `CANVAS` se mantiene como alias de `FORMATS.post` para compatibilidad. → No rompe imports existentes.
- **Zona segura por padding inferior** en `Frame` cuando `format==="reel"` (paddingBottom ≈ 440): el contenido (incl. `justify-content`) queda sobre los últimos 420px. → Cumple DESIGN.md sin reescribir plantillas.
- **`Renderer.init(dimensions?)`** con default `FORMATS.post`: el CLI elige el viewport. → Backward-compatible.
- **CLI separado `reel`** (no un flag de generate): mantiene `generate` simple y deja espacio para la lógica de video del loop 2. → Claridad.

### Alternatives Considered
- **Plantillas Reel separadas**: rechazado — duplicaría diseño; el objetivo es reutilizar el carrusel.
- **Recortar/letterbox el PNG 4:5 dentro de 9:16**: rechazado — desperdicia el alto vertical y se ve "post metido en reel"; queremos nativo.
- **Flag `--reel` en generate**: rechazado — mezcla responsabilidades; loop 2 añade composición de video que no pertenece a `generate`.

## Risk & Gap Analysis

### Requirement Ambiguities
- **Cuánto reservar abajo**: DESIGN.md dice 420px; uso 440 de paddingBottom para un colchón. Decisión registrada; ajustable en pulido (loop 3).
- **¿Todos los slides van al Reel?**: sí, el Reel = todos los slides del carrusel como frames verticales.

### Edge Cases
- **Contenido que desborda en vertical**: el alto extra (1920) da más aire, menor riesgo que en 4:5; `overflow:hidden` protege.
- **Hook con `justify-content:flex-end`**: en reel quedaría al borde inferior → el paddingBottom de zona segura lo sube. Verificar visualmente.
- **Fondos IA 4:5 cacheados**: la imagen IA es 1024×1536; al cubrir 1080×1920 se recorta con `cover` (aceptable). El sufijo de marca ya aplica.

### Technical Risks
- **Frame lee CANVAS en vez de format**: si quedara algún uso directo de CANVAS para el tamaño, el reel saldría 4:5. Mitigación: Frame debe usar las dims del formato, no CANVAS directo.
- **Romper generate**: mitigado por defaults (format post, init sin args = post). Gate `generate ejemplo` lo verifica.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | FORMATS con post/reel; CANVAS sigue válido | Yes | alias |
| 2 | Frame renderiza 9:16 con zona segura cuando format=reel | Yes | paddingBottom |
| 3 | Renderer acepta dimensiones | Yes | init(dims) |
| 4 | `npm run reel <carrusel>` → PNGs 9:16 en output/<name>/reel | Yes | video en loop 2 |
| 5 | `generate` 4:5 intacto | Yes | typecheck + render ejemplo |

### Decisiones tomadas autónomamente
- `format?: "post"|"reel"` en BaseSlideProps (default post); `FORMATS` con `CANVAS = FORMATS.post`.
- Zona segura reel = paddingBottom 440 (≥420).
- `Renderer.init(dims?)` default post; CLI `reel` usa 1080×1920.
- Reel PNGs en `output/<name>/reel/slide-NN.png`; mp4 en loop 2.
