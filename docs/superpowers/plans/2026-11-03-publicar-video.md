# /publicar — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un comando `npm run publicar` y un skill `/publicar` que programan en el calendario de @ia.punto.es un video ya listo, hecho en cualquier proyecto.

**Architecture:** La parte mecánica vive en `src/publicar/` (funciones puras + un `programar` con dependencias inyectadas, para testearlo sin red). Reusa el camino «hecha a mano» que ya acepta el render del Mac: una carpeta final con `.manifiesto.json` en `output/calendario/<semana>/<id>/` hace que `procesar` solo suba y verifique, sin re-renderizar, y una pieza con `parametros.hechaAMano: true` en `plan.json` del clon de la base. El skill (`skills/publicar/SKILL.md`) escribe el caption, conversa y pide la aprobación; luego llama al comando.

**Tech Stack:** TypeScript con tsx, zod (`PlanSchema`), ffprobe/ffmpeg, git en el clon `CALENDARIO_KB_DIR`.

**Spec:** `docs/superpowers/specs/2026-11-03-publicar-video-design.md`

## Global Constraints

- Hora de pieza: `HH:00` o `HH:30` (regex de `PiezaSchema` en `src/calendario/plan.ts`). Zona `America/Santiago` (`ZONA` de `src/calendario/time.ts`).
- «Ahora» = el primer hueco `HH:00`/`HH:30` que está a **≥ 15 min** del momento actual.
- Aviso de cercanía: otra pieza del mismo plan a **< 120 min**.
- Nunca reemplaza ni modifica piezas existentes; id repetido → error.
- Solo semanas con `plan.json` existente; si no existe → error «la semana <s> aún no tiene plan».
- Caption ≤ `CAPTION_MAX` (2200) y ≤ `HASHTAGS_MAX` (30) hashtags, importados de `src/calendario/publish.ts`.
- Video: vertical (alto > ancho), entre 3 s y 900 s, con pista de video h264 o hevc → si no, error. Aspecto distinto de 9:16 (± 2 %) o > 90 s → aviso, no error.
- `parametros: { origen: "publicar", hechaAMano: true }`; `lectorFrio: { intentos: 0, resultado: "manual", notas: "Pieza publicada con /publicar (<fecha>), fuera del planificador." }`; `hook.score: 0`; `estado: "planificado"`.
- Firma de los captions: @ia.punto.es con «Te ayudo a partir…», nunca el nombre de Felipe. Hashtags: `hashtagsBase` de `_calendario/config.json`.
- Respuestas, comentarios y commits en español. Rama `claude/publicar-video`; nunca push a `main`.
- Terminado = `npm run typecheck && npm test` en 0, más `npm run test:reel` (toca medios).

## Review Focus

1. **Carrera con el render horario:** si `plan.json` llega a la base antes que la carpeta final con manifiesto, launchd intentaría renderizar el borrador y marcaría la pieza `fallido`. `programar` escribe y valida la carpeta **antes** de tocar el plan (test de orden en la Tarea 4).
2. **Push que no llega:** `commitPaths` devuelve `undefined` en silencio si algo falla. Después del commit hay que comprobar que el clon no quedó adelantado a `origin` y, si quedó, salir con error y decir qué hacer (test en la Tarea 4).
3. **Hora en el pasado o «ahora» que cruza la medianoche o la semana:** `proximoHueco` a las 23:50 del domingo cae en el lunes de la semana siguiente, que puede no tener plan (tests en la Tarea 1).
4. **Ruta del video con espacios o fuera del repo:** todo comando externo va con `execFile` y argumentos en arreglo, nunca por shell (test con una ruta con espacios en la Tarea 3).
5. **Correr dos veces lo mismo:** el segundo `programar` con el mismo id debe fallar antes de copiar nada y no dejar la carpeta final a medias (test en la Tarea 4).

---

### Task 1: Cuándo publicar (`hueco.ts`)

**Files:**
- Create: `src/publicar/hueco.ts`
- Test: `test/publicar.ts` (nuevo; agregar `tsx test/publicar.ts` al final del script `test` de `package.json`)

**Interfaces:**
- Consumes: `localParts`, `zonedToUtc`, `weekMonday`, `addDays` de `src/calendario/time.ts`.
- Produces:
  - `proximoHueco(ahora: Date, margenMin = 15): { dia: string; hora: string }`
  - `resolverCuando(cuando: string, ahora: Date): { dia: string; hora: string }` — `cuando` es `"ahora"` o `"AAAA-MM-DD HH:MM"`; lanza si la hora no es `:00`/`:30` o si ya pasó.
  - `semanaDe(dia: string): string` — lunes de la semana de `dia` (AAAA-MM-DD).
  - `piezasCercanas(piezas: Pieza[], dia: string, hora: string, minutos = 120): string[]` — ids.

- [ ] **Step 1: Escribir los tests que fallan** (estilo `check(...)` de `test/_check.ts`):
  - `proximoHueco(new Date("2026-11-03T17:20:00Z"))` → `{ dia: "2026-11-03", hora: "15:00" }` (14:20 Chile + 15 min = 14:35 → 15:00).
  - `proximoHueco` a las 14:15 Chile exactas → `14:30`.
  - `proximoHueco` el domingo 2026-11-08 a las 23:50 Chile → `{ dia: "2026-11-09", hora: "00:30" }`, y `semanaDe("2026-11-09") === "2026-11-09"`.
  - `resolverCuando("2026-11-05 19:15", ahora)` lanza con un mensaje que contiene `HH:00 o HH:30`.
  - `resolverCuando("2026-11-01 19:00", new Date("2026-11-03T12:00:00Z"))` lanza con «ya pasó».
  - `piezasCercanas` con una pieza a las 13:00 del mismo día: `14:30` → `[id]`; `15:00` → `[]`; otro día → `[]`.
- [ ] **Step 2:** `npx tsx test/publicar.ts`. Tiene que fallar porque el módulo no existe.
- [ ] **Step 3:** Implementar en `src/publicar/hueco.ts`. Redondear en minutos locales con `localParts` y convertir con `zonedToUtc`; la distancia entre piezas, con `zonedToUtc` de ambas.
- [ ] **Step 4:** `npx tsx test/publicar.ts && npm run typecheck`. Tiene que pasar.
- [ ] **Step 5:** Commit `publicar: cuándo publicar (próximo hueco, hora válida, piezas cercanas)`.

### Task 2: La pieza y su borrador (`pieza.ts`)

**Files:**
- Create: `src/publicar/pieza.ts`
- Test: `test/publicar.ts`

**Interfaces:**
- Consumes: `PlanSchema`, `Pieza`, `Plan` de `src/calendario/plan.ts`; `parseBorrador` de `src/calendario/draft.ts`; `CAPTION_MAX`, `HASHTAGS_MAX` de `src/calendario/publish.ts`.
- Produces:
  - `idDe(dia: string, hook: string): string` — `<lun|mar|…|dom>-reel-<slug del hook>`. El slug va sin tildes, en minúsculas y con `-`. El id completo respeta `/^[a-z0-9-]{3,80}$/` y corta el slug en el último guion.
  - `problemasCaption(caption: string): string[]` — largo y cantidad de hashtags; vacío = ok.
  - `armarPieza(o: { id: string; dia: string; hora: string; hook: string; caption: string; hoy: string }): Pieza`, con los valores fijos de Global Constraints; `arquetipo: "atemporal"`, `senal: "retencion"`, `tema: ""`, `pilar: "trabajo"`, `emocion: ["curiosidad"]`, `entregable` y `fraseAmigo` = hook, `origen: { fichas: [], referencias: [] }`, `derivadoDe: null`, `borrador: "<id>.json"`.
  - `borradorDe(id: string, hook: string)`: un borrador de un solo slide `{ template: "Clip", props: { title: hook, archivo: "reel.mp4" } }` con `name: id`, `pillar: "trabajo"` y `angle: hook`. Tiene que pasar `parseBorrador`.
  - `insertarPieza(plan: Plan, pieza: Pieza): Plan` — copia nueva y ordenada por `dia`+`hora`; lanza `id repetido: <id>` si ya existe.

- [ ] **Step 1: Tests que fallan:**
  - `idDe("2026-11-05", "Hice este video en 2 días, sin saber animar")` → `"jue-reel-hice-este-video-en-2-dias-sin-saber-animar"`.
  - Un hook de 200 caracteres da un id de ≤ 80 caracteres que no termina en `-`.
  - `PlanSchema.parse(insertarPieza(planFixture, armarPieza(...)))` no lanza, y la pieza nueva queda con `parametros.hechaAMano === true`.
  - Insertar dos veces el mismo id lanza `id repetido`.
  - `parseBorrador(JSON.stringify(borradorDe(id, hook)))` no lanza.
  - `problemasCaption("a".repeat(2201))` tiene largo 1; un caption con 31 hashtags también.
- [ ] **Step 2:** Correr los tests. Tienen que fallar.
- [ ] **Step 3:** Implementar `src/publicar/pieza.ts`.
- [ ] **Step 4:** `npx tsx test/publicar.ts && npm run typecheck`. Tiene que pasar.
- [ ] **Step 5:** Commit `publicar: pieza hecha a mano, borrador mínimo e inserción sin pisar`.

### Task 3: El video (`video.ts`)

**Files:**
- Create: `src/publicar/video.ts`
- Test: `test/publicar.ts` (lo puro) y `test/publicar-media.ts` (ffmpeg real; agregar `tsx test/publicar-media.ts` al final de `test:reel`)

**Interfaces:**
- Produces:
  - `interface InfoVideo { ancho: number; alto: number; duracionMs: number; codec: string; tieneAudio: boolean }`
  - `problemasVideo(i: InfoVideo): { errores: string[]; avisos: string[] }`, con los límites de Global Constraints.
  - `inspeccionarVideo(ruta: string): Promise<InfoVideo>` — `ffprobe -v error -print_format json -show_streams -show_format` por `execFile`.
  - `extraerCuadros(ruta: string, dir: string, info: InfoVideo): Promise<{ cover: string; story: string; clave: string[] }>`. `cover.jpg` y `story.jpg` salen del cuadro a 1 s (o a la mitad si dura < 2 s), escalados a 1080×1920. `clave` son 6 cuadros repartidos (`clave-1.jpg`…) que el skill usa para escribir el caption.

- [ ] **Step 1: Tests que fallan:**
  - Puro: 1920×1080 da un error que contiene «vertical»; 1080×1920 de 30 s y h264 no tiene errores ni avisos; 2 s da error; 120 s da aviso; 1080×1350 da aviso de aspecto; `vp9` da error.
  - Media: generar con `ffmpeg -f lavfi -i testsrc=size=1080x1920:rate=30 -t 4` un mp4 en una carpeta temporal **con un espacio en el nombre**. `inspeccionarVideo` devuelve 1080×1920 y ≈ 4000 ms; `extraerCuadros` deja `cover.jpg`, `story.jpg` y 6 `clave-*.jpg` que existen.
- [ ] **Step 2:** Correr los dos archivos de test. Tienen que fallar.
- [ ] **Step 3:** Implementar con `execFile` de `node:child_process` (promisificado), sin shell.
- [ ] **Step 4:** `npx tsx test/publicar.ts && npx tsx test/publicar-media.ts && npm run typecheck`. Tiene que pasar.
- [ ] **Step 5:** Commit `publicar: inspección del video y cuadros para portada, story y caption`.

### Task 4: Programar (`programar.ts` + `cli.ts`)

**Files:**
- Create: `src/publicar/programar.ts`, `src/publicar/cli.ts`
- Modify: `package.json` (script `"publicar": "tsx src/publicar/cli.ts"`)
- Test: `test/publicar.ts`

**Interfaces:**
- Consumes: todo lo de las Tareas 1–3; `leerManifiesto`, `MANIFIESTO` de `src/calendario/render.ts`; `parsePlan`, `semanaDir` de `src/calendario/plan.ts`; `commitPaths`, `pullKb` de `src/kb/store.ts`.
- Produces:
  - `interface DepsProgramar { outRoot: string; kbCalendario: string; ahora: () => Date; pull: () => Promise<void>; commit: (paths: string[], msg: string) => Promise<void>; render: () => Promise<{ ok: boolean; salida: string }>; inspeccionar: typeof inspeccionarVideo; extraer: typeof extraerCuadros }`
  - `programar(o: { video: string; cuando: string; hook: string; caption: string; id?: string; dryRun: boolean }, d: DepsProgramar): Promise<ResultadoProgramar>`, con `ResultadoProgramar = { semana, id, dia, hora, cercanas: string[], avisos: string[], carpeta: string, programada: boolean, render?: { ok: boolean; salida: string } }`.
  - Orden fijo. Ante cualquier error, lanza antes del paso siguiente:
    1. `pull`;
    2. resolver cuándo y la semana, y leer `plan.json` (si falta → error);
    3. validar el caption, inspeccionar el video y revisar el id repetido;
    4. si es `dryRun`, devolver sin escribir;
    5. escribir la carpeta final en `<outRoot>/<semana>/<id>/` (pasando por una carpeta temporal hermana y un `rename`): `reel.mp4` copiado, `cover.jpg`, `story.jpg` y `.manifiesto.json` con `{ archivos: ["reel.mp4","cover.jpg","story.jpg"], duracionMs }`, comprobado con `leerManifiesto`;
    6. escribir el borrador y el `plan.json` validado con `PlanSchema`;
    7. `commit`;
    8. `render`.
  - CLI:
    - `npm run -s publicar -- revisar "<video>" [--transcribir]` → JSON `{ info, errores, avisos, cuadros, transcripcion?, hashtagsBase, semanasConPlan }`. `--transcribir` usa `transcribe` de `src/kb/ai.ts`.
    - `npm run -s publicar -- programar "<video>" --cuando "<ahora|AAAA-MM-DD HH:MM>" --hook "<texto>" --caption-file "<ruta>" [--id <id>] [--dry-run]` → JSON `ResultadoProgramar`.
  - El CLI carga `.env` y usa `outRoot = join(process.cwd(), "output", "calendario")`, igual que `render-cli.ts`. Pone `KB_DIR` = `CALENDARIO_KB_DIR` (por defecto `~/.cache/carrusel/kb-calendario`) y `KB_GIT_PUSH=1`. `render` corre `npm run -s calendario:render` en `process.cwd()`. El `commit` real, después de `commitPaths`, comprueba con `git status -sb` que el clon no quedó `ahead` y, si quedó, lanza «el plan no llegó a la base: …». Para el `pull` usa `pullKb`. Si la red se cuelga por el llavero, ver la memoria `git-pull-knowledge-keychain`: `credential.helper=!gh auth git-credential`.

- [ ] **Step 1: Tests que fallan.** `kbCalendario` y `outRoot` van en carpetas temporales con un `plan.json` de fixture; las `deps` falsas anotan el orden de las llamadas:
  - Camino feliz: se escribe la carpeta, `leerManifiesto` la valida, `plan.json` gana una pieza, `commit` se llama después de existir el manifiesto (el orden anotado es `pull, extraer, commit, render`) y el resultado trae `programada: true`.
  - `dryRun`: no aparece la carpeta, `plan.json` no cambia y no se llama ni `commit` ni `render`.
  - Semana sin `plan.json`: el error contiene «aún no tiene plan».
  - Id repetido: lanza, no crea `<outRoot>/<semana>/<id>` y no llama a `commit`.
  - Una pieza a 1 h da `cercanas` con su id y `programada: true` (la cercanía avisa, no frena).
  - Si `commit` lanza, el error se propaga y `render` no se llama.
- [ ] **Step 2:** Correr los tests. Tienen que fallar.
- [ ] **Step 3:** Implementar `programar.ts` y `cli.ts`, y agregar el script en `package.json`.
- [ ] **Step 4:** `npm run typecheck && npm test`. Tiene que salir 0.
- [ ] **Step 5:** Commit `publicar: comando programar y revisar`.

### Task 5: El skill y la documentación

**Files:**
- Create: `skills/publicar/SKILL.md`
- Modify: `README.md` (sección corta «Publicar un video listo (/publicar)» junto a la de /caso)
- Enlace: `ln -s ~/Documents/Claude/Carrusel/skills/publicar ~/.claude/skills/publicar`, como `caso`

**Interfaces:**
- Consumes: el CLI de la Tarea 4, que se llama siempre como `npm --prefix ~/Documents/Claude/Carrusel-render run -s publicar -- …`. Así corre desde `main`, con el `.env` y el `output/` del render.

- [ ] **Step 1:** Escribir `SKILL.md`. El frontmatter `description` se dispara con «/publicar», «publica este video» y «programa este reel». El cuerpo sigue estos pasos, en este orden:
  1. Ruta absoluta del video.
  2. `revisar --transcribir`. Si hay `errores`, mostrarlos y parar; si hay `avisos`, mostrarlos y preguntar si sigue.
  3. Preguntar «¿cuándo lo quieres publicar?» y traducir la respuesta a `ahora` o `AAAA-MM-DD HH:MM`. Si la hora no es `:00`/`:30`, proponer la más cercana.
  4. Mirar los `cuadros` (Read de las imágenes) y la transcripción, y escribir el hook y el caption con las reglas (para aprendices, una idea y una acción, firma @ia.punto.es «Te ayudo a partir…», `hashtagsBase`, nunca el nombre de Felipe). Guardar el caption en el scratchpad.
  5. `programar --dry-run`, y mostrar caption, `cover.jpg`, `story.jpg`, día y hora, y las `cercanas`.
  6. Esperar un OK explícito y aplicar las correcciones.
  7. `programar` sin `--dry-run`, y confirmar con la salida del render (URL verificada) o con el error tal cual.
  - Prohibido: publicar sin el OK, reemplazar piezas, editar `render.json` o `estado.json`.
- [ ] **Step 2:** Sección en `README.md` y el enlace simbólico.
- [ ] **Step 3:** `npm run typecheck && npm test && npm run test:reel`. Todo tiene que salir 0.
- [ ] **Step 4:** Commit `publicar: skill /publicar y documentación`.

### Task 6: Revisión y PR

- [ ] **Step 1:** `/codex:adversarial-review` sobre la rama (toca publicación: `AGENTS.md` lo exige). Atender lo que encuentre.
- [ ] **Step 2:** `git push -u origin claude/publicar-video` y abrir una PR a `main` con resumen, cómo probar y la nota «sirve después del merge, cuando Carrusel-render tenga main».
- [ ] **Step 3:** Después del merge (lo hace Felipe): `git -C ~/Documents/Claude/Carrusel-render pull` y una prueba real con `programar --dry-run` sobre un video cualquiera.
