# SPDD Analysis: Base de conocimiento personal desde Instagram vía Telegram

## Original Business Requirement

> Sistema aparte dentro del repo: comparto un post/reel/carrusel de Instagram a un bot de Telegram; el sistema analiza imágenes, caption y comentarios, genera conocimiento y actualiza una base de conocimiento. El objetivo NO es producir posts: es que el contenido que me interesa quede **ordenado y accesible**, y poder **consultarlo**.
>
> Decisiones del usuario: canal Telegram · guardado automático (sin aprobación previa, con deshacer) · temas creados automáticamente por el bot · visualización en **Obsidian** · el bot corre en un **PC de la casa**.

## Flujo de usuario (acordado)

1. **Guardar**: Instagram → Compartir → Telegram (bot). Nota opcional en el mismo mensaje. El bot confirma al instante, edita un mensaje de progreso y a los 30–90 s responde con la ficha resumida (tema, qué es, ideas clave, herramientas, lo útil de los comentarios, relacionados) y botones `[↩️ Deshacer] [🏷 Cambiar tema]`.
2. **Complementar**: capturas enviadas después del link (sueltas o álbum) se suman a la misma ficha. Un post repetido actualiza su ficha.
3. **Consultar**: cualquier texto que no sea link es una pregunta. Respuesta sintetizada **con citas** a las fichas y link al original; si no está en la base, lo dice. Comandos: `/temas`, `/tema <nombre>`, `/ultimos`.
4. **Explorar**: en el PC, Obsidian abre `knowledge/` como vault (fichas, páginas de tema, wikilinks, tags, grafo).

## Domain Concept Identification

### Existing Concepts (reutilizables)

- **`ingest(opts)`** (`src/remix/ingest.ts`): cadena yt-dlp → scraping público → manual; entrega `InstagramSource` (caption, hashtags, `mediaDataUris[]`, `partial`). Se reutiliza tal cual como primera etapa.
- **`ytdlp.ts`**: `ytDlpAvailable()`, `ingestViaYtDlp()`, soporte de cookies (`REMIX_COOKIES`, `REMIX_COOKIES_FROM_BROWSER`).
- **`framesFromLocalVideo()` / `hasFfmpeg()`**: frames de reels; se extiende el patrón para extraer **audio** (transcripción).
- **Patrón de cliente OpenAI lazy + caché en `.cache/`** (`src/ai/analyze.ts`, `src/ai/openaiImage.ts`).
- **Gate de calidad**: `npm run typecheck` + `npm run test` (runner mínimo tsx + `node:assert`).

### New Concepts Required

- **Ficha (fuente)**: una nota Markdown por post: metadatos + resumen + ideas + herramientas + pasos + recursos + comentarios útiles + preguntas de la audiencia + tema(s) + nota del usuario.
- **Tema**: página Markdown que sintetiza todas las fichas de un tema; se reescribe (solo su sección automática) cada vez que entra una ficha.
- **Índice**: SQLite derivado (reconstruible desde el Markdown) con trabajos, posts, chunks, FTS5 y vectores (`sqlite-vec`).
- **Trabajo (job)**: unidad de la cola; estados `queued → running → done | failed`, con mensaje de Telegram asociado para el progreso.
- **Consulta**: pregunta → recuperación híbrida (texto + vector) → respuesta con citas.

### Key Business Rules

- **El Markdown es la fuente de verdad**; SQLite es un índice desechable (`npm run kb:reindex` lo reconstruye).
- **Zonas del bot vs zonas del usuario**: el bot solo escribe entre `<!-- kb:auto:start -->` y `<!-- kb:auto:end -->`; todo lo demás (p. ej. `## Mis notas`) es del usuario y **nunca** se toca. Lo que edites en Obsidian se respeta.
- **Temas automáticos con freno**: el modelo recibe la lista de temas existentes y debe reutilizar uno salvo que ninguno encaje; además, si el tema propuesto es semánticamente casi igual a uno existente (similitud de embeddings ≥ umbral), se reutiliza el existente.
- **Idempotencia**: el shortcode de Instagram identifica el post; compartirlo de nuevo actualiza la ficha, no la duplica.
- **Nunca se cae**: si la descarga falla parcialmente, se guarda lo obtenido marcado `parcial: true` y se piden capturas.
- **Respuestas ancladas**: solo con información de la base, siempre citando fichas; sin inventar.
- **Privacidad**: de los comentarios se guardan ideas/preguntas, no nombres de usuario ni citas largas. Solo `chat_id` autorizados pueden usar el bot.
- **Cada guardado = 1 commit** en git (deshacer = `git revert` de ese commit + reindexado).

## Strategic Approach

### Solution Direction

```
Telegram (grammY, long polling)
   │ link / capturas / pregunta
   ▼
bot.ts ── allowlist ── ¿link? ──► cola (SQLite) ──► worker (1 a la vez)
   │                                   │
   │                                   ├─ ingest()            (remix, reutilizado)
   │                                   ├─ comments.ts         (yt-dlp best-effort / capturas)
   │                                   ├─ transcribe.ts       (ffmpeg audio → OpenAI)
   │                                   ├─ extract.ts          (modelo multimodal → Ficha, zod)
   │                                   ├─ topics.ts           (asigna/crea tema)
   │                                   ├─ store.ts            (escribe fichas/temas, git commit)
   │                                   └─ index.ts            (chunks + embeddings)
   │
   └─ ¿texto? ──► ask.ts (búsqueda híbrida → respuesta con citas)
```

Estructura en el repo (sistema aparte, sin tocar el generador de carruseles salvo reutilizar la ingesta):

```
src/kb/
  types.ts        Ficha, Tema, Job (+ esquemas zod)
  shortcode.ts    normalizar URL de IG (quitar igsh/utm) y extraer shortcode
  comments.ts     comentarios vía yt-dlp (best-effort) + desde capturas
  transcribe.ts   audio de reels → texto
  extract.ts      InstagramSource + comentarios + transcripción → Ficha
  topics.ts       asignación de tema y actualización de la página de tema
  markdown.ts     render/parse de fichas y temas (zonas auto/usuario)
  store.ts        escritura en knowledge/, git commit/revert/push
  db.ts           SQLite: jobs, posts, chunks, FTS5, vectores
  search.ts       búsqueda híbrida
  ask.ts          respuesta con citas
  pipeline.ts     orquesta una ingesta completa
  cli.ts          kb:add / kb:ask / kb:reindex
  bot.ts          Telegram
knowledge/        vault de Obsidian (fuentes/, temas/, _adjuntos/)
```

Formato de una ficha (`knowledge/fuentes/2026-09-26-usuario-ABC123.md`):

```markdown
---
tipo: reel
autor: "@usuario"
url: https://www.instagram.com/reel/ABC123/
shortcode: ABC123
guardado: 2026-09-26
tema: "[[Automatización con IA]]"
temas_secundarios: ["[[Productividad]]"]
herramientas: [Make, ChatGPT, Gmail]
tags: [kb/fuente, automatizacion]
parcial: false
---
![[_adjuntos/ABC123.webp|300]]

<!-- kb:auto:start -->
## Qué es
## Ideas clave
## Herramientas
## Pasos
## De los comentarios
## Transcripción (reels)
<!-- kb:auto:end -->

## Mis notas
```

Formato de un tema (`knowledge/temas/Automatización con IA.md`): frontmatter (`tags: [kb/tema]`, `descripcion`), zona auto con síntesis ("Lo esencial", "Herramientas mencionadas", "Técnicas", "Preguntas frecuentes de la audiencia", "Fuentes" con wikilinks a cada ficha) y `## Mis notas` libre.

### Key Design Decisions

| Decisión | Elección | Por qué |
|---|---|---|
| Canal | Telegram + grammY, **long polling** | Sin URL pública; corre en el PC de casa |
| Hosting | PC de casa (IP residencial) | Instagram bloquea mucho menos; gratis; Obsidian lee el mismo disco |
| Fuente de verdad | Markdown en `knowledge/` + git | Obsidian nativo, historial, deshacer = revert, backup = push |
| Índice | SQLite (`node:sqlite`, integrado en Node) + FTS5 + coseno en memoria | Un solo archivo, sin servidor ni dependencias nativas; reconstruible. *(Cambió en la implementación: se descartó `better-sqlite3` + `sqlite-vec` para evitar binarios nativos; el coseno en memoria alcanza para decenas de miles de trozos.)* |
| Modelos | OpenAI (proveedor ya usado): `gpt-4o` extracción, `gpt-4o-mini-transcribe` audio, `text-embedding-3-small` embeddings, modelo de respuesta configurable | Una sola API key; modelos por env (`KB_MODEL`, `KB_ASK_MODEL`) |
| Validación | `zod` | Salida del modelo con forma garantizada |
| Frontmatter | `gray-matter` | Leer/escribir propiedades de Obsidian |
| Imágenes en git | Solo 1 miniatura por post (WebP, o JPG si ffmpeg no trae WebP) | Contexto visual en Obsidian sin inflar el repo; videos nunca. La galería completa se guarda **fuera de git** (`_adjuntos/slides/<id>/`, con su propio `.gitignore`) |
| Concurrencia | Worker único, commits serializados | Sin carreras en git ni en las páginas de tema |

### Alternatives Considered

- **Base vectorial externa (Pinecone, Supabase)**: innecesaria a esta escala; agrega servicio y costo. SQLite alcanza para miles de fichas.
- **Obsidian como única base sin índice**: la búsqueda de Obsidian es por texto; no responde preguntas ni encuentra por significado.
- **Aprobación antes de guardar**: descartada por el usuario; se reemplaza por deshacer/cambiar tema después.
- **Instaloader para comentarios**: potente pero requiere sesión y arriesga bloqueo de cuenta; queda como opción futura si yt-dlp no alcanza.

## Plan de implementación (4 iteraciones)

Cada iteración cierra con `npm run typecheck` + `npm run test` en verde y un commit.

### Iteración 1 — Núcleo de guardado (CLI, sin Telegram)

- `npm run kb:add "<url>" -- --nota="..." [--image=captura.png ...]`
- Tipos + esquemas zod; normalización de URL/shortcode; transcripción de reels; comentarios best-effort vía yt-dlp (verificar primero qué entrega hoy para Instagram); extracción de la ficha; asignación de tema; render Markdown con zonas; actualización de la página de tema; miniatura; commit.
- Tests offline: shortcode, render/parse de zonas (la zona de usuario sobrevive a una reescritura), nombres de archivo, merge de ficha repetida.
- **Criterio**: compartir 5 posts variados deja 5 fichas + páginas de tema coherentes que se ven bien en Obsidian.

### Iteración 2 — Índice y consulta (CLI)

- SQLite: `posts`, `chunks`, FTS5, vectores; `npm run kb:reindex` reconstruye todo desde `knowledge/`.
- `npm run kb:ask "<pregunta>"`: búsqueda híbrida (FTS + vector, fusión por ranking), filtros simples de fecha ("esta semana"), respuesta con citas `[n]` → ficha + link original; "no está en tu base" cuando corresponde.
- **Criterio**: preguntas de prueba (por herramienta, por tema, por recuerdo vago, por fecha) devuelven las fichas correctas con citas.

### Iteración 3 — Bot de Telegram

- grammY con long polling; allowlist de `chat_id`; cola SQLite + worker; mensaje de progreso editable; respuesta con ficha resumida y botones `Deshacer` / `Cambiar tema` (top temas + "otro").
- Capturas y álbumes (agrupar por `media_group_id`, o asociar al último link en una ventana de tiempo) → se suman a la ficha.
- Texto libre → `ask`; comandos `/temas`, `/tema`, `/ultimos`; división de mensajes > 4.096 caracteres.
- Errores siempre con salida: parcial + pedido de capturas, reintento.
- **Criterio**: el flujo de usuario completo funciona desde el teléfono.

### Iteración 4 — Operación en el PC de casa

- `.env.example`, arranque como servicio (pm2 / launchd / systemd según el SO), `git push` con reintentos como backup, reinicio sin perder trabajos en cola.
- Guía de Obsidian: abrir `knowledge/` como vault, vistas recomendadas (tags, grafo, propiedades), y cómo verlo en el teléfono (plugin Obsidian Git u Obsidian Sync) si se quiere.
- README de la sección.

## Dependencias

- **npm**: `grammy`, `@grammyjs/files` (iteración 3), `zod`, `gray-matter`. `openai` ya está. El índice usa `node:sqlite` (sin dependencias nativas).
- **Sistema (PC)**: Node 22, git, `yt-dlp`, `ffmpeg`, Obsidian.
- **Secretos (`.env`, ya en `.gitignore`)**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, `OPENAI_API_KEY`, `REMIX_COOKIES` o `REMIX_COOKIES_FROM_BROWSER` (cuenta secundaria de Instagram).

## Risk & Gap Analysis

### Requirement Ambiguities

- **SO del PC** (Windows/macOS/Linux): define cómo se instala yt-dlp/ffmpeg y cómo corre como servicio.
- **Visibilidad del repo**: `knowledge/` contendrá resúmenes de contenido de terceros y tus notas; el repo debería ser **privado** (o `knowledge/` ir a un repo privado aparte).

### Edge Cases

- Post privado o eliminado → error claro, sin ficha.
- Carrusel mixto (fotos + videos) → frames + transcripción por video.
- Reel sin voz (solo música) → transcripción vacía, no se muestra la sección.
- Post en otro idioma → la ficha se escribe en español, se conserva el idioma original en el frontmatter.
- Capturas sin link → ficha "manual" sin URL, identificada por hash de las imágenes.
- Edición en Obsidian mientras el bot escribe → el bot relee el archivo justo antes de escribir y solo reemplaza la zona auto.

### Technical Risks

- **Bloqueo de Instagram**: mitigado por IP residencial + cookies de cuenta secundaria; degradación a capturas.
- **Comentarios vía yt-dlp**: cobertura incierta para Instagram; se verifica al inicio de la iteración 1; si no alcanza, las capturas son el camino principal.
- **Proliferación de temas**: mitigado con lista de temas existentes en el prompt + umbral de similitud + "Cambiar tema".
- **Deriva de la síntesis del tema** tras muchas reescrituras: la página se regenera desde las fichas (no desde su versión anterior) cuando supera N fuentes.
- **Costo**: estimado de unos centavos de dólar por post (extracción multimodal + transcripción) y fracciones de centavo por consulta.
- **`sqlite-vec` en el SO del PC**: tiene binarios para Windows/macOS/Linux; si fallara, fallback a similitud coseno en memoria (viable hasta miles de chunks).

### Acceptance Criteria Coverage

| Requisito | Cubierto por |
|---|---|
| Compartir desde Instagram a Telegram | Iteración 3 |
| Analizar imágenes, caption, comentarios (y audio) | Iteración 1 |
| Conocimiento ordenado (fichas + temas automáticos) | Iteración 1 |
| Accesible en Obsidian | Iteraciones 1 y 4 |
| Consultar el contenido | Iteraciones 2 y 3 |
| Corre en el PC de casa | Iteración 4 |

## Estado de implementación (2026-09-26)

### Iteración 1 — hecha

- `kb:add` con carruseles, posts y reels; fichas y temas en Markdown con zonas auto/usuario; commit por guardado.
- **Texto de las imágenes**: transcripción literal por slide/cuadro (sección plegada, buscable). Imágenes a `detail: "high"`, hasta `KB_MAX_IMAGES` (12).
- **Reels**: el video se baja una vez; de ahí salen los cuadros (uno cada ~3 s, entre 5 y 12, JPEG 768 px) y el audio.
- **Transcripción con pista**: el caption se pasa como `prompt`; el modelo lista `nameFixes` ("Cloud" → "Claude") y `names.ts` los aplica en toda la ficha si el nombre correcto aparece en caption/imágenes/comentarios.
- **Comentarios**: yt-dlp no evalúa el generador de comentarios en carruseles y solo trae la primera página; se piden **paginados** (hasta 10 páginas) con la API de Python de yt-dlp. Se guardan solo los aportes, sin nombres.
- **Temas**: nombre equivalente → existente; si no, embeddings (≥ 0,80 se une; 0,55–0,80 decide `gpt-4o-mini`). Calibrado con pares reales.
- **Deshacer**: `kb:undo ["<url|id>"]` = `git revert` del último guardado (salta los ya revertidos), borra galerías huérfanas y reindexa.
- **Robustez**: respuestas del modelo con caracteres de control (tildes corruptas) se reintentan y limpian; links de herramientas solo si son `http(s)`; temperatura 0,2.
- **Pendiente**: validar el criterio de aceptación con 5 posts variados (probado con 2: un carrusel de fotos y un reel).

### Iteración 2 — hecha

- `src/kb/db.ts` (índice en `<base>/.index/kb.sqlite`, fuera de git), `embed.ts` (embeddings con caché), `indexer.ts` (trozos por sección, incluidas "Mis notas"), `search.ts` (FTS5 sin tildes + coseno, fusión RRF, filtros de fecha), `ask.ts` (respuesta con citas `[n]`, "no está en tu base").
- `kb:add` indexa al guardar; `kb:reindex [-- --full]` sincroniza con el Markdown.
- Verificado con preguntas por herramienta, por idea vaga, por fecha, por comentarios y fuera de la base.

### Iteraciones 3 y 4 — pendientes
