# Reels con video generado (slide `Clip`) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un reel del calendario pueda mostrar un video generado con IA a pantalla completa en una o más escenas (slide `Clip`), con el clip tomado de una caché local del Mac y mezclado tras el render, y publicar así 3 reels extra la semana 2026-10-19.

**Architecture:** Una plantilla nueva `Clip` se renderiza como texto sobre el fondo casi negro de marca; el motor del calendario calcula el rango de tiempo de cada escena `Clip` a partir de `ReelTiming`, mezcla el archivo de la caché con ffmpeg en modo `lighten` (igual que `hookVideo`) y recién entonces extrae la portada y corre el QA. Catálogo, validador de la base y rúbrica `scoreReel` aprenden la plantilla. Un clip ausente es error de entorno (la pieza espera), no de contenido.

**Tech Stack:** TypeScript (tsx, Node 22), React para plantillas, Playwright + ffmpeg para el reel, `validar.mjs` (ESM sin tipos) para la base, tests con `node:assert` vía `test/_check.ts`.

**Spec:** `docs/superpowers/specs/2026-10-20-reels-clip-ia-design.md`

## Global Constraints

- Rama nueva desde `origin/main` (`claude/reels-clip-ia`, ya creada). No tocar `knowledge/` desde el código salvo en las tareas de contenido (Tareas 9–11); la bóveda se sube sola.
- Mensajes de error y comentarios en español, como el resto del repo. Props y nombres de plantilla en el estilo existente (`archivo`, `label`, `title`, `highlight`).
- `knowledge/_calendario/validar.mjs` y `kb-plantilla/_calendario/validar.mjs` deben quedar idénticos (hoy lo son); los tests importan la copia de `kb-plantilla/`.
- `CATALOGO` (validar.mjs) debe ser `deepEqual` a `TEMPLATE_CATALOG` (`test/calendario/validar.ts:114`).
- Clip solo en reels. Si la escena 0 es `Clip`: sin `Hook`, `logoEnCuadro0: false`, sin `hookVideo`. Máximo 3 `Clip` por reel. Tope semanal `config.clipsMaxSemana` (borradores con al menos un `Clip`; si falta la clave, 0).
- `archivo` es un nombre de archivo `.mp4` sin rutas (`^[A-Za-z0-9_][A-Za-z0-9_.-]{0,120}\.mp4$`, sin `..`); vive en `<clipsDir>/<semana>/<id>/<archivo>`; `clipsDir` por defecto `~/.cache/carrusel/clips` (env `CLIPS_DIR`).
- Escena `Clip`: duración mínima 3,0 s (`CLIP_MIN_SECONDS`), después la alarga la narración como a cualquier escena. El clip se muestra desde `inicio` hasta `fin` de la escena; si es más corto, se congela su último cuadro.
- Brillo del clip 0,7 (`CLIP_BRILLO`); fundido de 0,25 s al entrar y salir salvo en t = 0 (el cuadro 0 debe mostrar video).
- Cada tarea termina con `npm run typecheck` y los tests que nombra en verde, y un commit.

## Review Focus

1. Reel con `Clip` en escena 0 y un `Hook` más adelante: `validateDraft` no debe mover el Hook al frente ni insertar uno sintético (Tarea 3, test «Clip primero conserva el orden»).
2. Dos escenas `Clip` consecutivas con el mismo `archivo`: el filtro ffmpeg debe generar dos entradas independientes (el mismo archivo se abre dos veces), sin reutilizar el stream (Tarea 5, test «mismo archivo en dos escenas»).
3. Clip más corto que su escena (p. ej. 5 s en una escena de 6,5 s por narración): el último cuadro se congela, no vuelve a negro antes del fin (Tarea 6, test de medios con un clip de 1 s en una escena de 2 s).
4. Clip ausente en la caché: la pieza **no** queda `fallido`; `procesar` la deja planificada y avisa nombrando la ruta esperada (Tarea 7, test «clip faltante es error de entorno»).
5. Narración larga en una escena `Clip` del hook: el validador y el motor calculan la misma duración (piso 3,0 s + narración), para que el tope de 20 s dé igual en la nube y en el Mac (Tarea 2 y Tarea 8, mismos valores en ambos tests).

---

### Task 1: Plantilla `Clip` en el motor

**Files:**
- Create: `src/templates/Clip.tsx`
- Modify: `src/templates/index.ts`, `src/remix/types.ts:25`, `src/remix/templates-catalog.ts`, `src/remix/registry.ts:14-23`
- Test: `test/smoke.ts`

**Interfaces:**
- Produces: `export interface ClipProps extends BaseSlideProps { title: string; highlight?: string; label?: string; archivo: string }` y `export function Clip(props: ClipProps)`. `TemplateName` incluye `"Clip"`. `TEMPLATE_CATALOG.Clip = { required: ["title", "archivo"], optional: ["highlight", "label"] }`. El markup raíz de la escena lleva `data-clip="<archivo>"` (lo usa Tarea 5 solo como referencia; el rango sale de las props).

- [ ] **Step 1: Test de catálogo y render estático** en `test/smoke.ts`, junto a los checks de `isTemplateName`:

```ts
check("Clip: está en el catálogo y se renderiza con título, label y marca del archivo", () => {
  assert.ok(isTemplateName("Clip"));
  assert.deepEqual(TEMPLATE_CATALOG.Clip, { required: ["title", "archivo"], optional: ["highlight", "label"] });
  const html = renderToStaticMarkup(createElement(Clip, { title: "Tu idea en video con 1 frase", highlight: "1 frase", label: "Seedance 2.0 · 18 créditos", archivo: "idea-1.mp4", format: "reel" }));
  assert.ok(html.includes('data-clip="idea-1.mp4"'));
  assert.ok(html.includes("Seedance 2.0 · 18 créditos"));
  assert.ok(html.includes("Tu idea en video con"));
  assert.ok(html.includes('data-anim="words"'));
});
```

- [ ] **Step 2: Correr y ver fallar**: `npx tsx test/smoke.ts` → falla con «Clip no exportado / isTemplateName false».

- [ ] **Step 3: Implementar `Clip.tsx`**: `Frame` sin `background` (fondo `theme.colors.bg`), contenido en columna alineado arriba (`justifyContent: "flex-start"`, `paddingTop` ≈ 120 px bajo la cabecera), `label` como `MonoLabel` lima (`data-anim="rise"`), `title` en `h1` Anton mayúsculas con `data-anim="words"`, tamaño con `fitDisplaySize(title, 150, { maxLines: 3, tight: true, keep: [highlight] })` y `textShadow: "0 6px 28px rgba(0,0,0,0.9)"`, `highlightText(title, highlight, lime)`. El `div` raíz del contenido lleva `data-clip={archivo}`. Solo formato reel (en post se renderiza igual; no hace falta ramificar).

- [ ] **Step 4: Registrar**: exportar en `index.ts`; agregar `"Clip"` al union `TemplateName`; entrada en `TEMPLATE_CATALOG`; `Clip` en `TEMPLATE_COMPONENTS`.

- [ ] **Step 5: Verificar**: `npm run typecheck && npx tsx test/smoke.ts` → PASS.

- [ ] **Step 6: Commit** `git commit -m "templates: slide Clip (video generado a pantalla completa)"`.

---

### Task 2: Duración de la escena `Clip` en `timing.ts`

**Files:**
- Modify: `src/reel/timing.ts` (`sceneSeconds`, `sceneDurations`)
- Test: `test/reel-runtime.ts` o `test/smoke.ts` (donde ya se prueba `sceneDurations`; usar el mismo archivo)

**Interfaces:**
- Produces: `export const CLIP_MIN_SECONDS = 3.0`; `export function esEscenaClip(props: Record<string, unknown>): boolean` (true si `typeof props.archivo === "string"`). `sceneDurations` devuelve ≥ 3.0 para esas escenas en los tres ritmos (también escena 0 en `gancho`, donde el tope de hook 3.0 ya coincide).

- [ ] **Step 1: Test**:

```ts
check("timing: una escena Clip dura al menos 3 s en todos los ritmos y la narración la alarga igual", () => {
  const clip = { title: "Tu idea en video", archivo: "a.mp4" };
  for (const pace of ["ensenar", "rapido", "gancho"] as const) {
    const d = sceneDurations([clip, { heading: "x" }, clip, { title: "Guárdalo" }], pace);
    assert.ok(d[0] >= 3.0 && d[2] >= 3.0, `${pace}: ${d}`);
  }
  assert.deepEqual(conNarracion([3.0], [4.1]), [4.85]);
});
```

- [ ] **Step 2: Correr y ver fallar** (`d[0]` en `gancho` con 16 caracteres da 2.17).

- [ ] **Step 3: Implementar**: en `sceneDurations`, tras calcular cada duración, `Math.max(CLIP_MIN_SECONDS, d)` cuando `esEscenaClip(props)`. En `sceneSeconds` (ritmos no gancho) igual. Documentar en el comentario de `sceneSeconds`.

- [ ] **Step 4: Verificar** y **Step 5: Commit** `timing: piso de 3 s para escenas Clip`.

---

### Task 3: `validateDraft` acepta `Clip` como portada

**Files:**
- Modify: `src/remix/emit.ts:37-50,71-77`
- Test: `test/smoke.ts`

**Interfaces:**
- Produces: `validateDraft` deja la lista intacta cuando `slides[0].template === "Clip"` (no inserta ni mueve Hook); `index/total` no se asignan a la escena 0 cuando es `Clip`.

- [ ] **Step 1: Test**:

```ts
check("validateDraft: Clip primero conserva el orden, sin Hook sintético ni index en la portada", () => {
  const d = validateDraft({ name: "x", angle: "a", pillar: "herramienta", slides: [
    { template: "Clip", props: { title: "Tu idea en video con 1 frase", archivo: "a.mp4" } },
    { template: "Step", props: { heading: "Escribe la frase" } },
    { template: "Hook", props: { title: "Un hook tardío" } },
    { template: "Cta", props: { title: "Guárdalo" } },
  ] });
  assert.deepEqual(d.slides.map((s) => s.template), ["Clip", "Step", "Hook", "Cta"]);
  assert.equal(d.slides[0].props.index, undefined);
  assert.equal(d.slides[1].props.index, 2);
});
```

- [ ] **Step 2: Ver fallar** (hoy mueve el Hook al frente). **Step 3: Implementar** (`const portadaClip = slides[0]?.template === "Clip"`; saltar el bloque «Garantizar Hook inicial» y excluir la escena 0 del `index` si `portadaClip`). **Step 4: Verificar.** **Step 5: Commit** `remix: Clip puede ser la portada del reel`.

---

### Task 4: `scoreReel` puntúa reels con `Clip`

**Files:**
- Modify: `src/score/virality.ts:215-300`
- Create: `test/calendario/fixtures/reel-clip.json` (borrador completo y válido de `jue-pm-reel-tu-producto-en-anuncio`, 6 slides `Clip, Step, Clip, Step, Stat, Cta`, `pace: "gancho"`, `audio`, `logoEnCuadro0: false`, narración en todas, `source` en el Stat y el Cta; lo reutilizan Tareas 8 y 10)
- Test: `test/smoke.ts`

**Interfaces:**
- Produces: misma firma `scoreReel(draft)`. Reglas nuevas: la **portada** es la slide `Hook` o, si no hay, `slides[0]` cuando es `Clip`. Hook (25) con portada `Clip`: `archivo` 8, `label` 5, `highlight` 4, título con número/tensión/pregunta 5, título 2–8 palabras 3. Pantalla (20): si no hay `Screen` pero hay `Clip`: 10 si algún `Clip` trae `label`, +5 si alguna slide trae `source`, +5 si el primer `Clip` está en índice ≤ ⌈n/2⌉ (índice 0 vale). Narración: los checks «la voz del Hook repite el titular» y «destinatario» usan la portada (Hook o Clip).

- [ ] **Step 1: Test**:

```ts
check("scoreReel: un reel con Clip de portada y Clip de desarrollo pasa el umbral; sin label ni source baja", () => {
  const pieza = JSON.parse(readFileSync(new URL("./calendario/fixtures/reel-clip.json", import.meta.url), "utf8"));
  const r = scoreDraft(pieza, { format: "reel" });
  assert.ok(r.total >= THRESHOLD, `${r.total}: ${r.suggestions.join(" | ")}`);
  assert.equal(r.dimensions.find((d) => d.name === "Hook")!.score, 25);
  assert.equal(r.dimensions.find((d) => d.name === "Pantalla")!.score, 20);
  const pobre = { ...pieza, slides: pieza.slides.map((s: any) => ({ ...s, props: { ...s.props, label: undefined, source: undefined } })) };
  assert.ok(scoreDraft(pobre, { format: "reel" }).total < r.total);
});
```

- [ ] **Step 2: Ver fallar** («sin slide Hook»). **Step 3: Implementar** según Interfaces, sin tocar las ramas existentes para `Hook`/`Screen`. **Step 4: Verificar** `npx tsx test/smoke.ts` (incluido el check existente de la línea 207). **Step 5: Commit** `score: la rúbrica de reel acepta Clip como portada y pantalla`.

---

### Task 5: Rangos y filtro ffmpeg de los clips (`clips.ts`, puro)

**Files:**
- Create: `src/calendario/clips.ts`
- Test: `test/calendario/clips.ts` (sumar a `test/calendario.ts`)

**Interfaces:**
- Produces:
  - `export const CLIP_BRILLO = 0.7; export const CLIP_FADE = 0.25; export const CLIPS_DIR_DEFECTO = join(homedir(), ".cache", "carrusel", "clips"); export const ARCHIVO_CLIP_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,120}\.mp4$/;`
  - `export interface RangoClip { escena: number; archivo: string; inicio: number; fin: number }`
  - `export function rangosClips(spec: CarouselSpec, timing: ReelTiming): RangoClip[]` — por cada slide con `props.archivo` string: `inicio = i === 0 ? 0 : start + transition`, `fin = start + dur − (i === last ? 0 : transition)`, redondeado a 3 decimales.
  - `export function archivoClipError(v: unknown): string | undefined` (regex, `..`, extensión).
  - `export function rutaClip(clipsDir: string, semana: string, id: string, archivo: string): string`.
  - `export function filtroClips(rangos: RangoClip[], dim: { width: number; height: number; fps: number }): string` — cadena `-filter_complex`: para la entrada `k+1` (el reel es la 0): `scale=W:H:force_original_aspect_ratio=increase,crop=W:H,fps=FPS,trim=duration=(fin−inicio),setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=(fin−inicio),trim=duration=(fin−inicio),colorchannelmixer=rr=0.7:gg=0.7:bb=0.7,fade=t=in:st=0:d=0.25 (omitida si inicio === 0),fade=t=out:st=(fin−inicio−0.25):d=0.25,tpad=start_duration=inicio:start_mode=add:color=black,tpad=stop_mode=add:stop_duration=36000:color=black,format=gbrp[cK]`; el reel `[0:v]format=gbrp[v0]`; luego encadena `[v(k−1)][cK]blend=all_mode=lighten:shortest=1[vk]`, y el último `format=yuv420p[v]`.
  - `export function mezclarClips(reel: string, clips: { ruta: string; rango: RangoClip }[], salida: string): Promise<void>` — `spawn("ffmpeg", ["-v","error","-y","-i",reel, ...clips.flatMap(c => ["-i", c.ruta]), "-filter_complex", filtro, "-map","[v]","-map","0:a?","-c:v","libx264","-preset","slow","-crf","18","-c:a","copy","-movflags","+faststart", salida])`; lee W/H/FPS con `ffprobe` como hace `reel-hook-video.sh`.

- [ ] **Step 1: Tests** (`rangosClips` con un timing hecho a mano `reelTiming([3, 2.5, 4, 3], 0.3, "gancho")` y spec con `archivo` en escenas 0 y 2: esperado `[{escena:0, inicio:0, fin:2.7}, {escena:2, inicio: 5.5, fin: 8.9}]`; `filtroClips` con dos rangos del **mismo** archivo produce dos `[1:v]`/`[2:v]` y dos `blend`; `archivoClipError("../a.mp4")`, `("a.mov")`, `("a/b.mp4")` devuelven texto y `("idea-1.mp4")` undefined; el filtro de un rango con `inicio 0` no contiene `fade=t=in`).

- [ ] **Step 2: Ver fallar** (módulo inexistente). **Step 3: Implementar.** **Step 4: Verificar** `npx tsx test/calendario/clips.ts`. **Step 5: Commit** `calendario: rangos y filtro ffmpeg de las escenas Clip`.

---

### Task 6: Mezcla real con ffmpeg (test de medios)

**Files:**
- Test: `test/calendario/render-media.ts` (ya usa ffmpeg real; agregar un check) o nuevo `test/calendario/clips-media.ts` sumado a `test:reel`.

- [ ] **Step 1: Test**: con `ffmpeg -f lavfi` crear `reel.mp4` negro 1080×1920 de 4 s a 30 fps con tono de audio (`sine`) y `clip.mp4` rojo 1080×1920 de **1 s**; `mezclarClips(reel, [{ ruta: clip, rango: { escena: 0, archivo: "clip.mp4", inicio: 0, fin: 2 } }], salida)`; luego con `ffmpeg -ss 1.5 -frames:v 1` extraer un cuadro y comprobar con `grisDeImagen` + `luminanciaMedia` (de `qa.ts`) que a 1,5 s **no** es negro (último cuadro congelado) y a 3 s sí lo es; `ffprobe` da la misma duración que el original (±0,1 s) y hay pista de audio (`tieneAudio`).

- [ ] **Step 2: Ver fallar / Step 3: ajustar `filtroClips` hasta que pase.** **Step 4: Verificar** `npm run test:reel`. **Step 5: Commit** `calendario: prueba de medios de la mezcla de clips`.

---

### Task 7: El render del calendario aplica los clips

**Files:**
- Modify: `src/calendario/render.ts` (`renderPieza`, `procesar` sin cambios de flujo, `Deps`/`EnvRender` no cambian), `src/calendario/render-cli.ts` (pasa `clipsDir`), `src/calendario/draft.ts` (`parseBorrador` valida `archivo` cuando `template === "Clip"`)
- Test: `test/calendario/render.ts`, `test/calendario/draft.ts`

**Interfaces:**
- Produces: `export class ErrorClipFaltante extends Error` (no es `ErrorContenido`). `renderPieza(p, tmp, opts & { clipsDir?: string })`: tras `renderReelResult`, `const rangos = rangosClips(spec, r.timing)`; si hay: para cada uno, `rutaClip(opts.clipsDir ?? CLIPS_DIR_DEFECTO, p.semana, p.pieza.id, archivo)`; si no existe → `throw new ErrorClipFaltante(\`Falta el clip ${ruta} de ${id}: cópialo a la caché; la pieza sigue planificada.\`)`; `mezclarClips(original, …, mezclado)`; `qaHookVideo(mezclado, original)` (integridad: duración, audio, cuadro 0) y si falla → `ErrorContenido`; `rename(mezclado, reel.mp4)`. **Después** de eso se extrae `cover.jpg` y corre `qaReel` (mover las dos líneas existentes debajo de la mezcla). `parseBorrador`: si `s.template === "Clip"` y `archivoClipError(s.props.archivo)` → Error con el motivo.

- [ ] **Step 1: Tests**:
  - `test/calendario/draft.ts`: «parseBorrador rechaza Clip con archivo con ruta y acepta `idea-1.mp4`».
  - `test/calendario/render.ts`: «clip faltante es error de entorno»: `falsos({ render: async () => { throw new ErrorClipFaltante("Falta el clip /x/a.mp4 de lun-clip: …") } })`, `procesar([pend("lun-clip")])` → `res.pendientes === 1`, `res.fallidas === 0`, `escribirRender` no llamado con `fallido`, `avisar` recibió un texto con «Falta el clip».
  - `test/calendario/render-media.ts` (ffmpeg real; sin Chromium si el test existente ya mockea el reel, seguir ese patrón): `renderPieza` de un borrador con `Clip` en escena 0 y `clipsDir` temporal **sin** el archivo lanza `ErrorClipFaltante`; con el archivo (clip rojo de la Tarea 6) deja `reel.mp4` cuyo cuadro 0 no es negro y `cover.jpg` tampoco.

- [ ] **Step 2: Ver fallar.** **Step 3: Implementar.** **Step 4: Verificar** `npx tsx test/calendario/draft.ts && npx tsx test/calendario/render.ts && npm run test:reel`. **Step 5: Commit** `calendario: el render mezcla los clips de la caché y saca la portada después`.

---

### Task 8: Validador de la base (`validar.mjs`) conoce `Clip`

**Files:**
- Modify: `kb-plantilla/_calendario/validar.mjs` (y copiar idéntico a `knowledge/_calendario/validar.mjs`), `kb-plantilla/_calendario/validar.d.mts`
- Test: `test/calendario/validar.ts`

**Interfaces:**
- Produces: `CATALOGO.Clip = { required: ["title", "archivo"], optional: ["highlight", "label"] }`; `DONDE_HIGHLIGHT.Clip = "title"`; `export function contarClips(borradores): number` (borradores con ≥ 1 slide `Clip`); constantes `CLIP_MAX_POR_REEL = 3`, `CLIP_MIN_SECONDS = 3.0`, `ARCHIVO_CLIP_RE` (misma de Tarea 5). Reglas en `erroresDeBorrador`: Clip solo si `p.formato === "reel"`; `archivo` válido; ≤ 3 Clip; «la primera slide debe ser un Hook **o un Clip**»; si la primera es Clip: `logoEnCuadro0 === false` obligatorio, ningún `Hook` en el reel, `hookVideo` prohibido. `segundosEscenasTexto`: piso `CLIP_MIN_SECONDS` cuando `esTexto(props.archivo)`. `lineasSlide` case `"Clip"`: `[video]`, `label` (no en prisa), título con destacado. `validarConfig`: `clipsMaxSemana` entero ≥ 0 opcional. `validarSemana`: `contarClips(borradores) > (config.clipsMaxSemana ?? 0)` → `semana: N reels con Clip (máximo M, config.clipsMaxSemana)`.

- [ ] **Step 1: Tests** (en `test/calendario/validar.ts`, estilo «una pieza válida y rompe una sola cosa»; partir de `fixtures/reel-clip.json` como borrador y `pieza({ formato: "reel", arquetipo: "demo", dia: "2026-10-22", hora: "19:00" })`):
  - `PLANTILLAS` incluye `Clip` (actualizar el deepEqual de la línea 113).
  - borrador válido → `assertNone(vb(...))`.
  - en carrusel → `/Clip solo va en reels/`; `archivo: "../a.mp4"` → `/archivo/`; 4 Clips → `/máximo 3/`; `logoEnCuadro0: true` con Clip primero → `/logoEnCuadro0/`; Clip primero + Hook en slide 3 → `/sin Hook/`; `hookVideo` + Clip primero → `/hookVideo/`.
  - `segundosEscenas` de la fixture `===` `sceneDurations` del motor (ya hay un check equivalente para otras plantillas; reutilizar su forma) y la escena 0 ≥ 3.0.
  - `validarSemana` con 1 reel Clip y config sin `clipsMaxSemana` → `/clipsMaxSemana/`; con `clipsMaxSemana: 3` → sin ese error; `validarConfig({ clipsMaxSemana: -1 })` → error.
  - `textosLector` de la fixture contiene `[video]` y el label solo en el texto completo.

- [ ] **Step 2: Ver fallar.** **Step 3: Implementar.** **Step 4: Copiar**: `cp kb-plantilla/_calendario/validar.mjs knowledge/_calendario/validar.mjs` (y el `.d.mts`). **Step 5: Verificar** `npx tsx test/calendario/validar.ts && diff -q kb-plantilla/_calendario/validar.mjs knowledge/_calendario/validar.mjs`. **Step 6: Commit** (solo el repo Carrusel; la copia en `knowledge/` la sube Obsidian).

---

### Task 9: Manual, README y despliegue del motor

**Files:**
- Modify: `kb-plantilla/_calendario/INSTRUCCIONES.md` (sección nueva «Reel con video generado (`Clip`)» tras «Hook con video IA»: cuándo, props, `archivo` en la caché del Mac, reglas duras, ejemplo de 6 slides tomado de la fixture, `clipsMaxSemana`), `README.md` (una línea en la lista de plantillas y otra en el calendario: `CLIPS_DIR`), `.env.example` si existe (`CLIPS_DIR`).

- [ ] **Step 1: Escribir la sección y el README.** **Step 2: Instalar en la base**: `scripts/kb-calendario-install.sh` (apunta a `knowledge/`; config.json no se toca). **Step 3: Verificar** `npm run typecheck && npm test && npm run test:reel`. **Step 4: Commit y PR** a `main` con el cuerpo que resume la spec; tras el merge, en `~/Documents/Claude/Carrusel-render`: `git pull && npm install`, y comprobar en `output/calendario/render.log` que la corrida siguiente (cada hora) no falla. Límite: jueves 2026-10-22 antes de las 09:00.

---

### Task 10: Generación de clips con Felipe y caché (operativa, sin código)

**Files:**
- Create (en el Mac, fuera de git): `~/.cache/carrusel/clips/2026-10-19/<id>/<archivo>.mp4` y, al lado, `prompts.json` con `{ archivo, modelo, prompt, creditos }` por clip.

- [ ] **Step 1: Pieza jueves** (`jue-pm-reel-tu-producto-en-anuncio`): 1 imagen Nano Banana Pro del producto (pedir a Felipe la foto o elegir un producto genérico chileno), 2–3 variantes Kling 3.0 pro 9:16 5 s sin sonido por slot (`producto girando`, `producto en uso`); mostrar a Felipe, elegir 2.
- [ ] **Step 2: Pieza viernes** (`vie-pm-reel-kling-vs-seedance`): un prompt; 2 Kling + 2 Seedance 2.0 (5 s); elegir 1 y 1.
- [ ] **Step 3: Pieza sábado** (`sab-pm-reel-tu-idea-en-10-segundos`): 2–3 Seedance 2.0 de 10 s; elegir 2 (o 1 si el reel usa un solo Clip).
- [ ] **Step 4: Copiar los elegidos** a la caché con nombres cortos (`anuncio-1.mp4`…), anotar créditos en `prompts.json`; no superar 350 en total (ver `transactions`).

---

### Task 11: Borradores, plan y mix de la semana 2026-10-19

**Files:**
- Modify (bóveda, se sube sola): `knowledge/_calendario/config.json` (`mix` + 3 entradas `{dia:4|5|6, formato:"reel", arquetipo:"demo", hora:"19:00"}`, `separacionMinHoras: 4`, `clipsMaxSemana: 3`), `knowledge/_calendario/2026-10-19/plan.json` (3 piezas: `serie: "lo-probe-por-ti"`, `pilar: "herramienta"`, `senal: "guardados"`, `parametros` como las demás, `lectorFrio` con resultado ok tras pasarlo, `motivo` del plan ampliado con la nota de la spec), 3 borradores `<id>.json` (escribirlos con la skill `reels-hooks-ia`; 6 slides; narración ≤ 19 s medida con `scratchpad/medir-voz.mts`), `knowledge/_calendario/experimentos.md` (nota bajo 2026-10-19: serie aparte, no entra en `hook`; comparar alcance y retención a 3 s).

- [ ] **Step 1: Escribir el borrador del jueves**, validar: `node knowledge/_calendario/validar.mjs` (o el comando que use INSTRUCCIONES.md) y `npm run score -- <borrador>` ≥ 75; lector frío con subagentes limpios (`lector-frio.md`).
- [ ] **Step 2: Agregar la pieza a `plan.json` solo cuando sus clips estén en la caché** (Tarea 10); `estado.json` y `render.json` no se tocan. Esperar la corrida horaria y confirmar en `render.log` «renderizada y subida»; mirar `reel.mp4` y `cover.jpg` en `output/calendario/2026-10-19/<id>/` con Felipe (ajustar `CLIP_BRILLO` si el texto no se lee).
- [ ] **Step 3: Repetir** para viernes y sábado.
- [ ] **Step 4: Sábado 2026-10-24 en la noche**: restaurar `mix` y `separacionMinHoras` en `config.json` (`git log -p knowledge/_calendario/config.json`), dejar `clipsMaxSemana: 0` o quitarlo; anotar en `plan.json → motivo`.
- [ ] **Step 5: 2026-10-27**: comparar alcance a 72 h de las piezas contra la mediana de la semana (`knowledge/_metricas/instantaneas/`) y decidir con Felipe el banco de clips con los créditos restantes.
