# `/caso` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un comando `/caso` que, corrido en cualquier proyecto, rearma desde los rastros (conversaciones de Claude Code, git, archivos) la historia de cómo se logró algo, la tapa de datos sensibles, espera la aprobación de Felipe y genera un PDF paso a paso más un carrusel y un reel.

**Architecture:** El código determinista vive en `src/caso/` de Carrusel (con tests offline): encontrar y trozar sesiones, contar números, filtro de datos sensibles, aprobación atada a hash, PDF y render de la pieza. El trabajo de modelo (resumir trozos, redactar la historia, tapar clientes y personas, mirar imágenes) lo hace la propia sesión de Claude Code que corre el skill `skills/caso/SKILL.md` (instalado como symlink en `~/.claude/skills/caso`). Todo lo generado queda en `<proyecto>/caso/`, que se auto-ignora en git.

**Tech Stack:** TypeScript + tsx, Playwright/Chromium (PDF y render existentes), ffmpeg (recorte y mezcla de clips), arnés `test/_check.ts`.

**Spec:** `docs/superpowers/specs/2026-11-01-caso-proceso-design.md`

## Global Constraints

- Ningún texto real de un caso entra al repo Carrusel (es **público**): fixtures inventadas; salida solo en `<proyecto>/caso/`.
- Nada se publica ni toca el calendario (`_calendario/`, `render.json`, `knowledge/`).
- Sin APIs nuevas ni claves: `src/caso/` no llama a OpenAI/OpenRouter; sin video IA nuevo.
- Sin dependencias nuevas en `package.json`.
- PDF, carrusel y reel solo se generan si `historia.md` está aprobada **y** su hash coincide.
- Reel sin voz (`voz: false`) mientras `config.voz` sea false.
- Firma: @ia.punto.es + «Te ayudo a partir…», nunca el nombre de Felipe.
- Español simple para aprendices; mensajes de consola y comentarios en español.
- Terminado = `npm run typecheck && npm test` en 0, más `npm run test:reel`.

## Review Focus

1. **Sesión de 62 MB o una línea JSON truncada (sesión aún escribiéndose)** → se lee por streaming línea a línea y la línea rota se salta sin abortar. (Task 1)
2. **Ruta con espacios y `_` («Mis_Proyectos/Proyecto Uno 1») y proyectos con prefijo común («Carrusel» vs «Carrusel-render»)** → se codifica bien y no se mezclan carpetas ajenas; sí entran los worktrees `--claude-worktrees-`. (Task 1)
3. **Proyecto sin carpeta de conversaciones** → error claro que dice qué carpeta buscó, no un stack. (Task 1)
4. **Dato sensible metido después de aprobar, en `borrador.json`** → `generar` lo re-escanea y se niega. (Task 6)
5. **Clave dentro de una URL (`?token=…`) o RUT sin puntos** → el filtro las tapa igual. (Task 3)

---

### Task 1: Encontrar y resumir las sesiones de un proyecto

**Files:**
- Create: `src/caso/sesiones.ts`
- Create: `test/caso.ts`, `test/fixtures/caso/projects/<carpetas inventadas>/*.jsonl`
- Modify: `package.json` (agregar `&& tsx test/caso.ts` al final de `test`; script `"caso": "tsx src/caso/cli.ts"`)

**Interfaces:**
- Produces:
  - `codificarRuta(abs: string): string` — reemplaza todo `[^A-Za-z0-9]` por `-`.
  - `carpetasDeSesiones(proyecto: string, projectsDir = process.env.CASO_PROJECTS_DIR ?? join(homedir(), ".claude/projects")): string[]` — la carpeta exacta `codificarRuta(proyecto)` más las que empiezan con `codificarRuta(proyecto) + "--claude-worktrees-"`. Lanza `Error("No encontré conversaciones de Claude para <proyecto> (busqué <dir>)")` si no hay ninguna.
  - `interface SesionResumen { id: string; archivo: string; bytes: number; inicio: string; fin: string; mensajesUsuario: string[]; archivosTocados: string[]; herramientas: Record<string, number>; subagentes: number; tokens: { salida: number; entrada: number; cacheLeida: number; cacheCreada: number }; modelos: string[] }`
  - `resumirSesion(archivo: string): Promise<SesionResumen>` — `readline` sobre `createReadStream`; ignora líneas que no parsean; `mensajesUsuario` = textos de `type: "user"` con `content` string que no empiece por `<`; `archivosTocados` = `input.file_path` / `input.path` de bloques `tool_use`; `subagentes` = `tool_use` con `name` `Agent` o `Task`; tokens de `message.usage`.
  - `listarSesiones(proyecto: string, opts?: { projectsDir?: string }): Promise<SesionResumen[]>` — ordenadas por `inicio`.

- [ ] **Step 1:** Fixtures inventadas: `-tmp-Mi-Proyecto-1/` con 2 sesiones (una con línea truncada al final y un `tool_use` Agent), `-tmp-Mi-Proyecto-1--claude-worktrees-rama/` con 1, y `-tmp-Mi-Proyecto-1-otro/` con 1 que **no** debe entrar.
- [ ] **Step 2:** Tests en `test/caso.ts` (usa `check`/`checkAsync`/`done` de `test/_check.ts`):
  - `codificarRuta("/Users/x/Documents/Mis_Proyectos/Proyecto Uno 1") === "-Users-x-Documents-Mis-Proyectos-Proyecto-Uno-1"`
  - `carpetasDeSesiones("/tmp/Mi Proyecto 1", FIX)` tiene largo 2 y no incluye `-otro`.
  - `carpetasDeSesiones("/tmp/No Existe", FIX)` lanza con mensaje que contiene `No encontré conversaciones`.
  - `listarSesiones(...)` da 3 sesiones; la truncada igual trae sus mensajes; `subagentes === 1`; tokens suman lo de la fixture.
- [ ] **Step 3:** `npx tsx test/caso.ts` → FAIL (módulo no existe).
- [ ] **Step 4:** Implementar `src/caso/sesiones.ts`.
- [ ] **Step 5:** `npx tsx test/caso.ts` → PASS; `npm run typecheck` → 0.
- [ ] **Step 6:** Commit `caso: encuentra y resume las sesiones de Claude de un proyecto`.

### Task 2: Trozos para resumir y números del proyecto

**Files:**
- Create: `src/caso/trozos.ts`, `src/caso/numeros.ts`
- Modify: `test/caso.ts`

**Interfaces:**
- Consumes: `SesionResumen`, `resumirSesion` (Task 1).
- Produces:
  - `trozarSesion(archivo: string, maxChars = 60_000): AsyncGenerator<string>` — texto legible en orden: `## Usuario` / `## Claude` con los textos, y una línea `· herramienta: <name> <file_path|description corta>` por `tool_use`. **No** incluye salidas de herramientas ni imágenes. Corta solo entre mensajes.
  - `interface Numeros { dias: number; inicio: string; fin: string; sesiones: number; mensajesUsuario: number; subagentes: number; herramientas: number; tokensSalida: number; tokensTotales: number; versiones: Record<string, number>; renders: number; lineasCodigo: number; archivosCodigo: number }`
  - `numerosCaso(proyecto: string, sesiones: SesionResumen[]): Numeros` — `versiones`: agrupa archivos del proyecto por base quitando `_v\d+` (`letra_v2.md`, `letra_v3.md`, `letra.md` → `letra: 3`), solo grupos ≥ 2; `renders`: `.mp4`/`.png` bajo `out/` u `output/`; líneas de código: `.ts .tsx .js .mjs .py .css .html`, saltando `node_modules`, `.git`, `dist`, `caso`.

- [ ] **Step 1:** Tests: `trozarSesion` con `maxChars` chico da ≥ 2 trozos, ninguno contiene el texto del `tool_result` de la fixture, y todos los mensajes de usuario aparecen en algún trozo. `numerosCaso` sobre un dir temporal con `letra.md`, `letra_v2.md`, `guion_v1.md`, `out/a.mp4`, `app/x.ts` (3 líneas), `node_modules/y.js` → `versiones` `{ letra: 2 }`, `renders 1`, `lineasCodigo 3`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar ambos módulos.
- [ ] **Step 4:** Correr → PASS; typecheck 0.
- [ ] **Step 5:** Commit `caso: trozos de sesión y números del proyecto`.

### Task 3: Filtro automático de datos sensibles

**Files:**
- Create: `src/caso/filtro.ts`
- Modify: `test/caso.ts`

**Interfaces:**
- Produces:
  - `interface Tapado { tipo: "clave" | "correo" | "telefono" | "rut" | "ruta" | "archivo" | "enlace"; original: string }`
  - `taparSensible(texto: string, ctx?: { home?: string }): { texto: string; tapados: Tapado[] }`
  - `hallazgosSensibles(texto: string): Tapado[]` — mismo motor, sin reemplazar (para las puertas de Tasks 4 y 6).
  - `DOMINIOS_PUBLICOS: readonly string[]` = `["claude.ai", "claude.com", "anthropic.com", "suno.com", "blender.org", "threejs.org", "openai.com", "higgsfield.ai", "klingai.com"]`.
- Reemplazos: clave → `[clave]`; correo → `[correo]`; teléfono → `[teléfono]`; RUT → `[rut]`; ruta → `[ruta]`; archivo → `[archivo]`; URL → solo el dominio si está en `DOMINIOS_PUBLICOS` (sin path ni query), si no `[enlace]`. Orden: URLs primero (para que un token en query se vaya con la URL), luego claves, correos, RUT, teléfonos, rutas, archivos.
- Patrones mínimos: claves `sk-[A-Za-z0-9_-]{16,}`, `ghp_\w{20,}`, `github_pat_\w+`, `AKIA[0-9A-Z]{16}`, `xox[bpas]-[\w-]+`, JWT `eyJ[\w-]+\.[\w-]+\.[\w-]+`, y `(api[_-]?key|token|secret|password)\s*[:=]\s*\S+`; RUT `\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b`; teléfono `(\+?56\s?)?9\s?\d{4}\s?\d{4}`; rutas `/Users/…`, `/home/…`, `~/…`, `C:\…`; archivo: nombre con extensión `ts tsx js mjs py json jsonl md mp4 png jpg env sql csv pdf`.

- [ ] **Step 1:** Tests, uno por tipo, más:
  - `https://api.ejemplo.cl/v1?token=abc123` → `[enlace]` y no queda `abc123`.
  - `https://suno.com/s/oIoxXq2c` → `suno.com`.
  - `12345678-9` y `12.345.678-K` → `[rut]`.
  - `/Users/x/Documents/Proyectos/x` → `[ruta]`.
  - `analisis.md` → `[archivo]`.
  - Texto limpio («usé Claude y Blender») sale idéntico y `tapados` vacío.
  - `hallazgosSensibles(taparSensible(t).texto)` es vacío para cada caso (idempotente).
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr → PASS; typecheck 0.
- [ ] **Step 5:** Commit `caso: filtro automático de datos sensibles`.

### Task 4: Carpeta del caso y aprobación atada al contenido

**Files:**
- Create: `src/caso/carpeta.ts`, `src/caso/aprobacion.ts`
- Modify: `test/caso.ts`

**Interfaces:**
- Consumes: `hallazgosSensibles` (Task 3).
- Produces:
  - `carpetaCaso(proyecto: string): string` — crea `<proyecto>/caso/` con `caso/.gitignore` cuyo contenido es `*\n` (la carpeta se auto-ignora) y devuelve la ruta. Subcarpetas que usan otras tasks: `trabajo/`, `imagenes/`, `clips/`, `salida/`.
  - `hashHistoria(texto: string): string` — sha256 hex.
  - `aprobar(dirCaso: string): { hash: string }` — lee `historia.md`; si `hallazgosSensibles` no es vacío lanza `Error` listando los hallazgos; si no, escribe `aprobado.json` `{ hash, fecha }`.
  - `estadoAprobacion(dirCaso: string): "sin-historia" | "sin-aprobar" | "editada" | "aprobada"`.

- [ ] **Step 1:** Tests en dir temporal: `carpetaCaso` crea `.gitignore` con `*`; sin `historia.md` → `"sin-historia"`; con historia → `"sin-aprobar"`; tras `aprobar` → `"aprobada"`; si se edita un carácter → `"editada"`; `aprobar` con un correo en la historia lanza y no crea `aprobado.json`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr → PASS; typecheck 0.
- [ ] **Step 5:** Commit `caso: carpeta auto-ignorada y aprobación atada al hash de la historia`.

### Task 5: PDF desde la historia aprobada

**Files:**
- Create: `src/caso/pdf.ts`
- Modify: `test/caso.ts`

**Interfaces:**
- Produces:
  - `SECCION_INTERNA = /^##\s+Para Felipe/i` — las secciones `## Para Felipe: …` (qué se tapó, sesiones usadas, imágenes candidatas) no van al PDF.
  - `historiaAHtml(md: string, opts: { dirCaso: string }): string` — conversor mínimo propio (sin dependencias): `#`/`##`/`###`, párrafos, listas `-` y `1.`, `**negrita**`, `` `código` ``, bloques ``` (para prompts, en caja), `> ` como recuadro «Para quien quiera el detalle técnico», imágenes `![](imagenes/x.png)` resueltas solo dentro de `dirCaso/imagenes/` (otra ruta → se omite). Escapa HTML. Usa colores y fuentes de `src/theme.ts`. Cierra con la firma (`theme.firma` / «@ia.punto.es · Te ayudo a partir…»).
  - `renderPdf(html: string, salida: string): Promise<void>` — Chromium de Playwright, `page.pdf({ format: "A4", printBackground: true })`.

- [ ] **Step 1:** Tests (solo `historiaAHtml`, sin Chromium): la sección `## Para Felipe: qué se tapó` no aparece; `<script>` en el texto sale escapado; `![](../../secreto.png)` no genera `<img>`; `![](imagenes/a.png)` sí; la firma contiene `@ia.punto.es` y no `Felipe`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr → PASS; typecheck 0.
- [ ] **Step 5:** Commit `caso: PDF paso a paso desde la historia`.

### Task 6: Generar PDF, carrusel y reel (con puerta)

**Files:**
- Create: `src/caso/generar.ts`
- Modify: `test/caso.ts`; agregar a `test:reel` un `tsx test/caso-media.ts` (Create) que renderiza la fixture completa.

**Interfaces:**
- Consumes: `estadoAprobacion`, `hallazgosSensibles`, `historiaAHtml`, `renderPdf`; de Carrusel: `parseBorrador`, `borradorASpec` (`src/calendario/draft.ts`), `scoreDraft` (`src/remix/registry.ts`), `renderCarousel` (`src/render/renderCarousel.ts`), `renderReelResult` (`src/reel/renderReel.ts`), `rangosClips`, `mezclarClips` (`src/calendario/clips.ts`).
- Produces:
  - `puertaGenerar(dirCaso: string): string[]` — motivos para no generar: estado ≠ `"aprobada"`; falta `borrador.json`; `hallazgosSensibles` sobre el texto de `borrador.json` no vacío; fondos `image` fuera de `dirCaso/imagenes/`; `Clip.archivo` que no existe en `dirCaso/clips/`; algún texto con «Felipe».
  - `generarCaso(dirCaso: string, opts?: { soloPdf?: boolean }): Promise<{ pdf: string; carrusel: string[]; reel?: string; avisos: string[] }>` — si `puertaGenerar` da motivos, lanza con todos. Si no: `caso.pdf`; carrusel con `borradorASpec(b)` en `salida/`; reel con `borradorASpec(b, { format: "reel" })`, `voz: false`, `revision: "avisar"`, y si hay escenas `Clip` mezcla los clips de `dirCaso/clips/` con `rangosClips` + `mezclarClips`. `scoreDraft` y la revisión visual solo van a `avisos` (no bloquean).
  - `recortarClip(video: string, desde: number, hasta: number, dirCaso: string, nombre: string): Promise<string>` — ffmpeg a `clips/<nombre>.mp4` (nombre validado con `archivoClipError`).
  - `copiarImagen(ruta: string, dirCaso: string): string` — copia a `imagenes/`, devuelve la ruta relativa `imagenes/<nombre>`.

- [ ] **Step 1:** Tests offline de `puertaGenerar` en dir temporal: sin aprobar → motivo; aprobada pero `borrador.json` con `sk-abcdefghijklmnop1234` → motivo con «clave»; fondo `image: "/etc/x.png"` → motivo; `Clip` con archivo inexistente → motivo; caso válido → `[]`. Y: editar `historia.md` tras aprobar hace que `generarCaso` lance sin escribir `caso.pdf`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx tsx test/caso.ts` → PASS; typecheck 0.
- [ ] **Step 5:** `test/caso-media.ts`: fixture aprobada con borrador de 4–5 slides (Hook, Step, Stat, Cta) y un clip de 2 s generado con ffmpeg (`testsrc`); `generarCaso` crea `caso.pdf` (> 0 bytes, empieza con `%PDF`), PNGs del carrusel y `reel.mp4`. `npm run test:reel` → 0.
- [ ] **Step 6:** Commit `caso: genera PDF, carrusel y reel solo con historia aprobada`.

### Task 7: CLI, skill y prueba real

**Files:**
- Create: `src/caso/cli.ts`, `skills/caso/SKILL.md`, `skills/caso/historia-plantilla.md`
- Modify: `README.md` (sección corta «Casos (`/caso`)»)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces (CLI, `npm --prefix ~/Documents/Claude/Carrusel run caso -- <sub> <proyecto-absoluto> …`):
  - `sesiones <proyecto>` → tabla: id, fechas, tamaño, primeros 3 mensajes de usuario (pasados por `taparSensible`).
  - `trozar <proyecto> <id…>` → escribe `caso/trabajo/<id>-NN.md`, imprime las rutas.
  - `numeros <proyecto> <id…>` → `caso/numeros.json` y tabla.
  - `tapar <archivo>` → reescribe el archivo tapado e imprime lo tapado.
  - `imagen <proyecto> <ruta>` · `clip <proyecto> <video> <desde> <hasta> <nombre>`.
  - `aprobar <proyecto>` · `generar <proyecto> [--solo-pdf]`.
- `historia-plantilla.md`: `# <logro>` · `## El punto de partida` · `## Las referencias` · `## Paso a paso` (por paso: qué hice, qué le pedí a la IA en un bloque ```, herramienta, qué salió, qué falló) · `## Mi método` · `## Los números` · `## Para Felipe: imágenes candidatas` · `## Para Felipe: qué se tapó` · `## Para Felipe: sesiones usadas y descartadas`.
- `SKILL.md` (frontmatter `name: caso`, descripción con disparadores «/caso», «cuenta cómo hice», «arma el caso de este proyecto»). Flujo que impone:
  1. Preguntar qué logro contar; correr `sesiones` y proponer cuáles pertenecen (por tema, fechas, archivos); Felipe confirma.
  2. `numeros` y `trozar`; un subagente por trozo resume en español (qué quería, referencias, qué se probó, qué falló, prompts clave) **reemplazando clientes, empresas y personas por roles**; nunca pegar trozos crudos en la historia.
  3. Leer los archivos del proyecto que sean versiones/análisis; mirar imágenes candidatas y descartar las que muestren datos; `imagen` para las elegidas.
  4. Escribir `caso/historia.md` con la plantilla, en lenguaje de aprendiz; `tapar` encima; segunda pasada propia buscando clientes/personas.
  5. **Parar** y mostrarle la historia a Felipe. Solo con su «apruebo» explícito: `aprobar`.
  6. Escribir `caso/borrador.json` (formato `Borrador` del calendario, plantillas existentes, firma @ia.punto.es + «Te ayudo a partir…»), `clip` si el reel usa video del proyecto, y `generar`. Mostrar avisos del juez; no publicar ni tocar el calendario.
- Instalación: `ln -s ~/Documents/Claude/Carrusel/skills/caso ~/.claude/skills/caso` (documentado en README).

- [ ] **Step 1:** Implementar `cli.ts` (sin lógica propia: solo parsea y llama). Probar `npm run caso -- sesiones "<fixture>"` con `CASO_PROJECTS_DIR` apuntando a las fixtures → lista 3 sesiones.
- [ ] **Step 2:** Escribir `SKILL.md`, la plantilla y la sección del README; crear el symlink.
- [ ] **Step 3:** `npm run typecheck && npm test && npm run test:reel` → 0.
- [ ] **Step 4:** Commit `caso: CLI, skill /caso y documentación`.
- [ ] **Step 5 (con Felipe):** correr `/caso` en un proyecto de video en otra carpeta (sus sesiones filtradas a ese video). Verificar que la historia excluye los otros proyectos de la misma carpeta, que no aparecen los nombres reales de las personas del video ni rutas, y que Felipe aprueba historia, PDF, carrusel y reel. Nada de ese caso se commitea en Carrusel.
- [ ] **Step 6:** Rama `claude/caso-proceso`, PR.
