# SPDD Analysis: Remix de IG — ingesta robusta con yt-dlp (Iteración 3/3)

## Original Business Requirement

> ITERACIÓN 3 de 3 (última) del "remix de Instagram". Tarea: ROBUSTEZ DE INGESTA para vencer el login wall y el anti-scraping de Instagram. Hoy src/remix/ingest.ts depende de fetch público de og:meta/JSON embebido (frágil; IG suele bloquear con login wall). Quiero un proveedor de ingesta más confiable: usar yt-dlp (binario externo OPCIONAL, igual que ffmpeg ya lo es) como FUENTE PREFERENTE cuando esté instalado: `yt-dlp -J` para obtener el caption/description y la metadata, y descargar TODOS los medios del post (imágenes de un carrusel y/o el video del reel) a un directorio temporal; las imágenes se convierten a data URIs y de los videos se extraen frames con ffmpeg (reutilizar la lógica existente de extractReelFrames). Soportar cookies para login wall: flag --cookies=ruta y/o --cookies-from-browser=NAVEGADOR, pasados a yt-dlp; también vía env. La cadena de degradación debe ser: yt-dlp (si está y funciona) → scraping público actual → input manual (--caption/--image), sin caerse nunca. Sin dependencias npm nuevas (yt-dlp y ffmpeg son binarios externos opcionales detectados en runtime). Mantener mediaDataUris[] y todo el pipeline aguas abajo igual. typecheck verde como gate, y generate/reel/remix siguen funcionando.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **ingest()** (`src/remix/ingest.ts`): orquestador de ingesta. Hoy: fetch público (og:meta/JSON) → manual. Debe anteponerse un proveedor yt-dlp como primer eslabón de la cadena de degradación.
- **extractReelFrames(videoUrl, n)** (`src/remix/ingest.ts`): descarga un MP4 por URL y muestrea frames con ffmpeg. La parte ffmpeg (probe + fps + leer PNGs) debe **extraerse** a una función que opere sobre un archivo local, para reutilizarla con los videos que descargue yt-dlp.
- **hasFfmpeg() / probeDuration() / runFfmpeg()** (`src/remix/ingest.ts`): helpers ffmpeg ya existentes; reutilizables tal cual.
- **fetchImageAsDataUri / localImageToDataUri** (`src/remix/ingest.ts`): conversión a data URI; `localImageToDataUri` se reutiliza para los archivos que baje yt-dlp.
- **InstagramSource.mediaDataUris[]** (`src/remix/types.ts`): contrato de salida de la ingesta; NO cambia (yt-dlp lo puebla igual que el scraping).
- **RemixOptions** (`src/remix/types.ts`): se extiende con `cookies` / `cookiesFromBrowser`.
- **CLI remix** (`src/remix/cli.ts`): parseo de flags; añade `--cookies=` y `--cookies-from-browser=`.
- **Patrón de binario externo opcional**: `hasFfmpeg()` + `spawn` ya establecen el patrón "detectar en runtime, degradar si falta". yt-dlp sigue el mismo patrón.

### New Concepts Required

- **Proveedor yt-dlp** (`src/remix/ytdlp.ts`, nuevo): `ytDlpAvailable()` y `ingestViaYtDlp(url, opts)` que devuelve `{ caption, mediaDataUris }` usando `yt-dlp -J` (metadata/caption) + descarga de TODOS los medios a un temporal; imágenes → data URI, videos → frames vía ffmpeg. Cookies para login wall.
- **framesFromLocalVideo(path, n)** (extraído de `extractReelFrames`): la lógica ffmpeg de muestreo sobre un archivo local; reutilizada por el path URL y por yt-dlp.
- **Cookie config**: resolución de cookies desde flags (`--cookies`, `--cookies-from-browser`) y env (`REMIX_COOKIES`, `REMIX_COOKIES_FROM_BROWSER`), traducida a flags de yt-dlp.

### Key Business Rules

- **Cadena de degradación estricta**: yt-dlp (si está y produce algo) → scraping público actual → manual. Nunca caerse; solo aborta si al final no hay imágenes ni caption (regla heredada).
- **Binarios externos opcionales**: yt-dlp y ffmpeg se detectan en runtime; su ausencia degrada, no rompe. Sin dependencias npm nuevas.
- **Contrato aguas abajo intacto**: `mediaDataUris[]` + `thumbnailDataUri` se pueblan igual; analyze/emit/render no cambian.
- **Cookies = palanca anti-login-wall**: opcionales; cuando se proveen, se pasan a yt-dlp. No loguear su contenido ni rutas sensibles.
- **Gate**: typecheck verde; generate/reel/remix siguen funcionando.

## Strategic Approach

### Solution Direction

Anteponer un proveedor yt-dlp a la ingesta existente, reutilizando la maquinaria ffmpeg:

```
ingest(opts):
  if url and ytDlpAvailable():
      try ingestViaYtDlp(url, opts)  → { caption, mediaDataUris }   (FUENTE PREFERENTE)
  if (sin media):  fetchPublic(url)  → og:meta/JSON embebido         (degradación 1)
  if (sin media):  manual --caption/--image                          (degradación 2)
```

- **`src/remix/ytdlp.ts`**:
  - `ytDlpAvailable()`: `spawn("yt-dlp", ["--version"])` best-effort (patrón de `hasFfmpeg`).
  - `ingestViaYtDlp(url, opts)`:
    1. `yt-dlp -J --no-warnings [cookieFlags] <url>` → parsear JSON; `caption = description ?? title`.
    2. Descargar TODO el media a un tmp dir: `yt-dlp -o "<tmp>/%(autonumber)s.%(ext)s" --no-warnings [cookieFlags] <url>`.
    3. Recorrer el tmp dir ordenado: imágenes (jpg/png/webp) → `localImageToDataUri`; videos (mp4/mov/webm) → `framesFromLocalVideo(path, frames)`. Concatenar en orden, aplicar tope.
    4. Limpiar el tmp dir. Devolver `{ caption, mediaDataUris }`.
  - `cookieFlags(opts)`: `--cookies <ruta>` y/o `--cookies-from-browser <navegador>` desde flags/env.
- **Refactor `extractReelFrames`**: separar `framesFromLocalVideo(path, n)` (ffmpeg) del download por URL; `extractReelFrames(url, n)` baja el MP4 y delega en `framesFromLocalVideo`. yt-dlp usa `framesFromLocalVideo` directamente.
- **`ingest()`**: insertar el intento yt-dlp al inicio del bloque `if (opts.url)`, antes de `fetchPublic`. Si yt-dlp produce caption/media, saltar el scraping; si no, continuar la cadena.
- **CLI**: parsear `--cookies=` y `--cookies-from-browser=`; pasarlos en `RemixOptions`.

### Key Design Decisions

- **yt-dlp como proveedor preferente opcional** (vs. reemplazar el scraping): → yt-dlp mantiene parsers de IG actualizados por su comunidad, soporta cookies (login wall) y descarga el carrusel completo + videos de forma mucho más confiable; mantenerlo OPCIONAL con degradación preserva el funcionamiento sin instalarlo. Recomendado.
- **Descargar el media (vs. parsear URLs del `-J`)**: → descargar con `yt-dlp -o` es lo más robusto (resuelve CDNs firmados, multi-item del carrusel, formatos), y evita re-fetch frágil. Recomendado. Trade-off: IO a disco temporal; mitigado con tmp en `.cache/remix/` y limpieza.
- **Reutilizar ffmpeg para frames de los videos descargados** (vía `framesFromLocalVideo`): → no duplica lógica; mismo muestreo equiespaciado de iteración 2. Recomendado.
- **Cookies por flag + env** (`--cookies`, `--cookies-from-browser`, `REMIX_COOKIES`, `REMIX_COOKIES_FROM_BROWSER`): → da la palanca real contra el login wall sin acoplar credenciales al código. Recomendado. Trade-off: el usuario debe exportar cookies; documentar en README.
- **Sin dependencias npm**: yt-dlp/ffmpeg como binarios externos detectados en runtime (consistente con el patrón ffmpeg ya presente). Recomendado.

### Alternatives Considered

- **API oficial / oEmbed con token**: descartada (iteraciones 1-2): fricción de app review/token.
- **Playwright autenticado**: alto mantenimiento, detección anti-bot, manejo de sesión frágil; yt-dlp resuelve lo mismo con menos código y comunidad activa. Descartada.
- **Reemplazar el scraping por yt-dlp**: descartada — romper la degradación dejaría sin salida a quien no tenga yt-dlp instalado.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Formato de cookies**: `--cookies` espera un archivo Netscape cookies.txt; `--cookies-from-browser` un nombre de navegador (chrome/firefox/…). Documentar ambos. Registrar.
- **Qué pasa si yt-dlp devuelve solo caption (sin media)**: usar ese caption y seguir intentando media por scraping. Registrar.
- **Tope de medios**: respetar el mismo tope que la ingesta actual (MAX_INGEST_IMAGES). Registrar.
- **Orden de los medios**: usar `%(autonumber)s` para preservar el orden del carrusel. Registrar.

### Edge Cases

- **yt-dlp no instalado**: `ytDlpAvailable()` false → saltar a scraping. Aviso `ℹ️`/`⚠️` informativo.
- **yt-dlp instalado pero el post requiere login y no hay cookies**: yt-dlp falla → capturar, degradar a scraping, luego manual.
- **Cookies inválidas/expiradas**: yt-dlp error → degradar; no exponer el contenido de cookies en logs.
- **Post solo-video sin ffmpeg**: yt-dlp baja el MP4 pero `framesFromLocalVideo` no puede muestrear → 0 frames de ese video; si no hay imágenes, degrada el análisis (parcial), no se cae.
- **Mezcla imágenes+videos en un carrusel**: procesar ambos tipos y concatenar respetando orden.
- **tmp dir no limpiado ante error**: usar `finally` para `rm` recursivo (patrón de iteración 2).
- **yt-dlp muy lento / cuelga**: aplicar timeout razonable al spawn; degradar si expira.

### Technical Risks

- **Variabilidad del JSON de `yt-dlp -J`** según versión/tipo de post: mitigación: solo se usa `description`/`title` para caption; el media viene de la descarga real, no del JSON.
- **Cambios de IG que rompan yt-dlp**: mitigación: degradación a scraping; el usuario puede actualizar yt-dlp (`pip install -U yt-dlp`) sin tocar el repo.
- **Seguridad de cookies**: mitigación: pasar la ruta/flag a yt-dlp sin loguear contenido; no cachear cookies; doc de uso responsable.
- **Costo/latencia de descarga**: mitigación: tmp en `.cache/remix/`, limpieza, tope de medios, caché de ingesta por URL ya existente.
- **Regresión en el path actual**: mitigación: el refactor de `extractReelFrames` es mecánico (extraer `framesFromLocalVideo`); verificar que el path URL sigue igual y que generate/reel/remix compilan y corren.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | yt-dlp como fuente preferente cuando está instalado | Yes | `ytDlpAvailable()` + primer eslabón de la cadena |
| 2 | `yt-dlp -J` para caption/metadata | Yes | `description`/`title` |
| 3 | Descargar TODOS los medios (carrusel + video) a temporal | Yes | `yt-dlp -o autonumber` |
| 4 | Imágenes → data URI; videos → frames ffmpeg (reusar) | Yes | `framesFromLocalVideo` extraído |
| 5 | Cookies: --cookies / --cookies-from-browser + env | Yes | `cookieFlags` |
| 6 | Degradación yt-dlp → scraping → manual, sin caerse | Yes | Cadena en `ingest()` |
| 7 | Sin dependencias npm nuevas | Yes | Binarios externos en runtime |
| 8 | mediaDataUris[] y pipeline aguas abajo intactos | Yes | Mismo contrato |
| 9 | typecheck verde; generate/reel/remix funcionan | Yes | Gate + verificación |

## Decisiones tomadas autónomamente

1. **yt-dlp opcional, preferente, con descarga real de media** (no solo parseo de `-J`); degradación a scraping → manual.
2. **Extraer `framesFromLocalVideo(path, n)`** de `extractReelFrames` y reutilizarla para los videos de yt-dlp y del path URL.
3. **Cookies por flag y env**: `--cookies`/`REMIX_COOKIES` (archivo) y `--cookies-from-browser`/`REMIX_COOKIES_FROM_BROWSER` (navegador).
4. **Orden por `%(autonumber)s`** y tope `MAX_INGEST_IMAGES` reutilizado.
5. **Timeout al spawn de yt-dlp** para no colgar; degradar si expira.
6. **No loguear contenido de cookies**; solo indicar que se están usando.
7. **Nuevo archivo `src/remix/ytdlp.ts`** para aislar el proveedor (testeable y desacoplado de `ingest.ts`).
