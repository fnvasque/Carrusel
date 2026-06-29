# SPDD Analysis: Remix de IG — análisis profundo + flujo end-to-end (Iteración 2/3)

## Original Business Requirement

> ITERACIÓN 2 de 3 del "remix de Instagram" (la base ya existe: src/remix/ con ingest.ts, emit.ts, cli.ts, templates-catalog.ts; src/ai/analyze.ts con analyzePost+generateVariations; comando `npm run remix`). Dos mejoras: (A) ANÁLISIS PROFUNDO DEL ORIGINAL — hoy la ingesta solo captura el thumbnail principal + caption; ahora debe capturar TODAS las imágenes de un carrusel (edge_sidecar_to_children del JSON embebido de la página) y, para reels, extraer varios frames del video (vía ffmpeg, ya requerido por el pipeline de reel) y/o más imágenes, de modo que analyzePost reciba múltiples imágenes y el PostAnalysis sea realmente detallado (estructura slide por slide). Mantener el fallback manual con múltiples --image. (B) FLUJO END-TO-END DE UN COMANDO — flags --render y --reel en `npm run remix` que, tras emitir los 2 archivos .ts, corran automáticamente la maquinaria existente (renderSlide/Renderer para PNGs 4:5, y el pipeline de src/reel para el Reel 9:16, generando los fondos IA con gpt-image-1), dejando PNGs y/o MP4 listos sin pasos manuales. Reutilizar el código existente de render y reel; no duplicarlo. Mantener typecheck verde como gate.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **InstagramSource** (`src/remix/types.ts`): hoy modela `thumbnailDataUri` (1 sola imagen) + `imagePaths`. Debe **extenderse** para llevar múltiples imágenes (`mediaDataUris: string[]`), manteniendo compat.
- **ingest()** (`src/remix/ingest.ts`): hoy extrae solo `og:image`. Debe ganar capacidad de extraer todas las imágenes de un carrusel y frames de un reel, degradando a thumbnail/manual.
- **analyzePost()** (`src/ai/analyze.ts`): hoy envía 0-1 imagen al modelo. Debe enviar **N imágenes** para un análisis slide-por-slide; la caché debe versionarse por el conjunto de imágenes.
- **Renderer** (`src/render/renderSlide.ts`): clase reutilizable (init/render/close) — ya es reutilizable, se usa tal cual.
- **resolveBackground()** (`src/render/background.ts`): resuelve `{ ai }` → genera con `gpt-image-1`; reutilizable tal cual.
- **composeReel() / reelDuration()** (`src/reel/video.ts`): componen el MP4; reutilizables tal cual. Su patrón `spawn("ffmpeg", …)` es el mismo que necesita la extracción de frames.
- **Lógica de render de carrusel** (dentro de `main()` de `src/cli.ts`) y **lógica de reel** (dentro de `main()` de `src/reel/cli.ts`): NO son reutilizables hoy (están atrapadas en `main()`). Para reusarlas desde remix sin duplicar, hay que **extraerlas a funciones exportadas**.
- **CarouselSpec / FORMATS** (`src/templates/types.ts`): contrato de entrada de render/reel; sin cambios.

### New Concepts Required

- **Multi-media ingestion**: extracción de TODAS las imágenes de un carrusel (parseando el JSON embebido de la página IG: `display_url`/`edge_sidecar_to_children`, o múltiples candidatos de imagen) y extracción de frames de un reel (descargar el video de `og:video`/JSON y muestrear con ffmpeg). Nuevo, dentro de `ingest.ts` (o un `media.ts` del módulo remix).
- **renderCarousel(spec, opts)**: función reutilizable que encapsula el loop de render 4:5 (extraída de `src/cli.ts`). Nueva ubicación reutilizable (p. ej. `src/render/renderCarousel.ts`).
- **renderReel(spec, opts)**: función reutilizable que encapsula render 9:16 + composición (extraída de `src/reel/cli.ts`). Nueva (p. ej. `src/reel/renderReel.ts`).
- **Orquestación end-to-end en remix**: flags `--render` / `--reel` en `src/remix/cli.ts` que, tras emitir cada `.ts`, llaman a `renderCarousel`/`renderReel` sobre el spec emitido.

### Key Business Rules

- **Reutilización sin duplicación**: el render del remix DEBE pasar por las mismas funciones que `generate`/`reel`. Se extraen a funciones y ambos (CLIs viejos + remix) las llaman; comportamiento de `generate`/`reel` invariante.
- **Degradación**: si no se pueden extraer múltiples imágenes (login wall, sin video, sin ffmpeg), el análisis cae a thumbnail/caption/manual sin romperse (regla heredada de iteración 1).
- **Control de coste**: limitar el número de imágenes enviadas al modelo (tope, p. ej. ≤8) y respetar las cachés existentes (análisis e imágenes IA).
- **Fondos IA solo al renderizar**: la generación con `gpt-image-1` ocurre en `--render`/`--reel` (vía `resolveBackground`), no en el análisis (regla heredada).
- **Gate**: `npm run typecheck` verde; `generate`/`reel` deben seguir funcionando idénticos tras la extracción.

## Strategic Approach

### Solution Direction

Dos frentes independientes que convergen en `src/remix/cli.ts`:

**(A) Ingesta profunda** — extender `ingest.ts`:
- Carrusel: del HTML público, extraer todas las URLs de imagen del JSON embebido (`display_url`, `edge_sidecar_to_children`, candidatos `*.jpg` de scontent), deduplicar, descargar cada una a data URI. Si solo hay `og:image`, usar esa (comportamiento actual).
- Reel: extraer `og:video`/`video_url` del HTML; si existe y hay ffmpeg, descargar el MP4 a un temporal y muestrear K frames equiespaciados con ffmpeg (mismo patrón `spawn` de `video.ts`); cada frame a data URI. Si no, caer a thumbnail.
- Manual: cargar TODAS las rutas de `--image` (ya es `string[]`) a data URIs.
- `InstagramSource.mediaDataUris: string[]` reemplaza el rol de `thumbnailDataUri` (que se mantiene como alias del primero por compat).

**(B) Render end-to-end** — extraer y orquestar:
- Extraer `renderCarousel(spec, { outDir })` desde `src/cli.ts` y `renderReel(spec, { outDir, seconds, fade, audio, framesOnly })` desde `src/reel/cli.ts`, preservando comportamiento; refactorizar ambos `main()` para delegar en ellas.
- En `src/remix/cli.ts`: parsear `--render` y `--reel`; tras `emitCarouselFile`, importar el spec y llamar `renderCarousel`/`renderReel` según los flags. Imprimir rutas de PNGs/MP4.

**(A) → analyzePost**: aceptar `mediaDataUris[]` y adjuntar cada imagen como `image_url` (hasta el tope), pidiendo análisis slide-por-slide. Caché por hash del conjunto.

### Key Design Decisions

- **Extraer render/reel a funciones reutilizables** (vs. shell-out a `tsx src/cli.ts`): → la extracción reutiliza el código real, evita duplicación y arregla la deuda "lógica en main()" anotada en iteración 1; los CLIs viejos delegan y quedan triviales. Recomendado. Trade-off: toca `src/cli.ts` y `src/reel/cli.ts`, pero de forma behavior-preserving (verificable: `generate`/`reel` siguen produciendo lo mismo).
- **Alternativa subprocess** (spawn `tsx src/cli.ts <file>` desde remix): → cero modificación de los CLIs, pero NO reutiliza el código a nivel de función, agrega latencia de arranque por render y complica el manejo de errores. Rechazada por el requisito explícito "reutilizar el código… no duplicarlo".
- **`mediaDataUris: string[]` en InstagramSource** (vs. múltiples campos): → un solo arreglo es lo que consume analyzePost; `thumbnailDataUri` se deriva del primero para no romper la caché/llamadas existentes. Recomendado.
- **Frames de reel por ffmpeg muestreando el MP4** (vs. solo thumbnail): → da contexto visual real del video; ffmpeg ya es requisito del pipeline reel, sin dependencias nuevas. Recomendado. Trade-off: descarga el video (peso/latencia); mitigado con tope de frames y degradación si no hay ffmpeg/video.
- **Tope de imágenes al modelo (≤8) + caché por conjunto**: → controla coste/latencia del análisis multimodal. Recomendado.
- **Parsing del JSON embebido por regex tolerante** (vs. endpoint `?__a=1`/GraphQL): → el endpoint está deprecado/requiere auth; regex sobre `display_url` del HTML es lo más robusto disponible sin dependencias. Recomendado, con degradación a `og:image`.

### Alternatives Considered

- **API oficial / oEmbed con token**: misma razón que iteración 1 (fricción), pospuesto.
- **Playwright para scrapear el carrusel logueado**: IG exige login y detecta automatización; alto mantenimiento. Pospuesto a iteración 3 (robustez de ingesta) si hace falta.
- **Transcripción de audio (Whisper) del reel**: valiosa pero es otra capacidad (audio→texto) y otro coste; se acota esta iteración a frames visuales; transcripción queda como evolutivo.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Cuántos frames extraer de un reel**: no especificado → default K configurable (p. ej. 4-6 equiespaciados), con flag `--frames=N`. Registrar.
- **`--render` y `--reel` juntos**: ¿ambos? → sí, son combinables; cada uno produce su salida. Registrar.
- **Sobre qué variaciones se rendea**: → sobre las 2 emitidas (ambas), salvo que el coste lo haga prohibitivo; default ambas. Registrar.
- **"Transcripción" del reel**: el requerimiento dice "frames y/o más imágenes"; se interpreta como frames visuales, NO transcripción de audio (queda como evolutivo). Registrar.

### Edge Cases

- **Carrusel con 1 sola imagen detectable**: comportamiento = iteración 1 (thumbnail).
- **Reel sin `og:video` accesible o sin ffmpeg en PATH**: degradar a thumbnail; avisar con `⚠️`.
- **Muchas imágenes (carrusel de 10)**: aplicar tope ≤8 al enviar al modelo; loguear el recorte.
- **`--render`/`--reel` sin `OPENAI_API_KEY` y con fondos `ai`**: `resolveBackground` lanzará; mensaje claro (igual que hoy).
- **ffmpeg ausente al componer reel**: ya manejado por `composeReel` (error con código). El remix debe propagar el mensaje, no colgar.
- **Extracción de imágenes que trae URLs basura (avatares, íconos)**: deduplicar y filtrar por patrón/host; preferir las de mayor resolución del sidecar.
- **Refactor rompe `generate`/`reel`**: mitigación = verificación behavior-preserving en el gate (correr ambos sobre un carrusel y confirmar PNGs/MP4).

### Technical Risks

- **Fragilidad del parsing del JSON embebido** (IG cambia el markup): impacto alto; mitigación: múltiples patrones (display_url, og:image:*, sidecar), dedup, y degradación a thumbnail.
- **Peso/latencia de descargar video + frames + N imágenes**: mitigación: topes, temporales en `.cache/remix/`, limpieza, y caché de análisis.
- **Regresión en generate/reel por la extracción**: mitigación: extracción mecánica 1:1, y verificación manual de ambos comandos en el gate.
- **Coste del análisis multimodal con N imágenes**: mitigación: tope ≤8 + caché por conjunto.
- **Compatibilidad de tipos** (`thumbnailDataUri` usado en analyze/caché): mitigación: mantenerlo derivado de `mediaDataUris[0]`.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Capturar TODAS las imágenes de un carrusel | Yes | Regex JSON embebido + dedup; degrada a og:image |
| 2 | Extraer frames de un reel (ffmpeg) | Yes | Descarga video + muestreo; degrada si no hay video/ffmpeg |
| 3 | analyzePost recibe múltiples imágenes → análisis slide-por-slide | Yes | Tope ≤8, caché por conjunto |
| 4 | Mantener fallback manual con múltiples --image | Yes | `opts.image` ya es string[] |
| 5 | Flag --render: PNGs 4:5 automáticos sobre las 2 variaciones | Yes | Vía renderCarousel extraído |
| 6 | Flag --reel: MP4 9:16 automático | Yes | Vía renderReel extraído |
| 7 | Reutilizar render/reel sin duplicar | Yes | Extracción a funciones; CLIs viejos delegan |
| 8 | typecheck verde + generate/reel intactos | Yes | Verificación behavior-preserving en el gate |

## Decisiones tomadas autónomamente

1. **Extraer `renderCarousel`/`renderReel` a funciones** y hacer que `src/cli.ts` y `src/reel/cli.ts` deleguen (refactor behavior-preserving) — es el camino "reutilizar sin duplicar".
2. **`InstagramSource.mediaDataUris: string[]`**; `thumbnailDataUri` se mantiene como el primero por compatibilidad de caché/llamadas.
3. **Frames de reel = K equiespaciados (default 5)**, flag `--frames=N`; degradar a thumbnail si no hay video/ffmpeg.
4. **Tope ≤8 imágenes** al modelo; caché de análisis versionada por el conjunto de imágenes.
5. **`--render` y `--reel` combinables**, ambos operan sobre las 2 variaciones.
6. **Sin transcripción de audio** en esta iteración (solo frames visuales); transcripción = evolutivo.
7. **Parsing por regex tolerante** del JSON embebido (display_url/sidecar), sin endpoint deprecado ni dependencias nuevas.
