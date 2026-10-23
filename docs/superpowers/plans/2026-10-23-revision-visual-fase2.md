# Revisión visual, fase 2 (revisor con visión, solo aviso) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un revisor con visión de OpenAI mire los fondos de cada pieza ya renderizada en el Mac. Si el fondo compite con el texto o no tiene que ver con la pieza, avisa por Telegram con la imagen y dos botones («Tenía razón» / «No»). El bot del servidor guarda la respuesta, y el bucle informa cada semana la precisión del revisor y los hallazgos por tipo.

**Architecture:**
- **Mac:** después de `procesar`, `render-cli.ts` llama a `revisarRenderizadas`.
  1. Saca los cuadros a revisar con ffmpeg, en una carpeta que no se sube.
  2. Llama una vez por pieza al modelo de visión, con las dos preguntas fijas.
  3. Anota los veredictos en `_calendario/<semana>/visual.json`, que sube con la misma maquinaria que `render.json`.
  4. Por cada «no», manda `sendPhoto` con botones `cal-visual:…`.
- **Topes:** van en `visual.json → _presupuesto`.
- **Servidor:** el bot atiende `cal-visual:…`, responde «Anotado», agrega una línea a `_calendario/<semana>/visual-respuestas.jsonl` y quita los botones.
- **Bucle:** `bucle.ts` cruza los dos archivos.
- **Registro común:** las piezas que la fase 1 bloqueó (`ErrorVisual`) también quedan anotadas en `visual.json`, en el campo `fase1`.

**Tech Stack:** TypeScript (tsx), SDK `openai` v4 (chat.completions con `image_url` y `response_format: json_object`, como `src/ai/analyze.ts`), grammY en el bot, ffmpeg y la API HTTP de Telegram con `fetch` + `FormData` desde el Mac.

**Spec:** `docs/superpowers/specs/2026-10-23-revision-visual-design.md` (sección «Fase 2», «Aprendizaje», «Decisiones del diseñador»). Depende de la fase 1 (PR #59, rama `claude/revision-visual-fase1`), que esta rama extiende.

## Global Constraints

- Español en código, mensajes y commits; identificadores como estén. Puerta: `npm run typecheck && npm test && npm run test:reel` en 0 (Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=…/chromium_headless_shell-1217/…`; nunca `playwright install`).
- **El revisor nunca bloquea ni cambia una pieza.** Corre después de que la pieza queda `renderizado`. Si falla (sin clave, red, JSON malo), solo se anota en el log. Nunca lanza fuera de `revisarRenderizadas`.
- **Topes (spec):**
  - 12 imágenes por pieza;
  - 120 imágenes por semana;
  - US$5 por semana.

  Pasado un tope, la pieza queda `"sin revisar"` con su motivo y no se llama a la API. Nunca se regeneran fondos.
- **Clave:** solo `OPENAI_API_KEY`, que ya está en el `.env` del Mac. El modelo sale de `REVISOR_VISUAL_MODEL` y por defecto es `"gpt-4o"`. El costo de cada llamada se calcula con `usage` y una tabla de precios en el código. Un modelo que no esté en la tabla usa el precio más caro de la tabla.
- **Las dos preguntas, sin cambios:**
  1. «¿El fondo compite con el texto, o deja alguna parte del texto difícil de leer?»
  2. «¿El fondo tiene que ver con lo que dice la pieza?»

  La respuesta es un JSON con un veredicto por imagen y una frase.
- `callback_data`: `cal-visual:<semana>:<id>:<n>:si|no`. Si pasa de 64 bytes, el id va como `~<huella>`, igual que `callbackSaltar`.
- **Cada archivo tiene un solo escritor:**
  - `visual.json` lo escribe solo el Mac;
  - `visual-respuestas.jsonl` lo escribe solo el bot (y solo agrega líneas);
  - `knowledge/` es de solo lectura desde aquí.
- Tipos del registro: `tilde`, `puntuacion`, `transicion`, `numero-solo`, `zona` (fase 1), `fondo-compite`, `fondo-ajeno` (fase 2).
- No editar tests para que pasen. No desplegar el bot ni tocar `Carrusel-render`.

## Review Focus

1. **Doble toque o toque tardío de un botón:** gana la última respuesta por (pieza, imagen). Un callback de una semana que el bot ya no tiene cargada responde «Ese botón ya no vale» y no escribe nada. Test en la Task 6.
2. **Carreras de git con `visual.json`:** la alineación con el remoto no puede tratar un commit `visual.json` del Mac como ajeno («commits sin subir que no son de render.json»). Test en la Task 2.
3. **La misma pieza en dos corridas:** no se vuelve a revisar ni a avisar si ya tiene entrada `revisor` en `visual.json`, aunque sea `"sin revisar"`. El presupuesto no se descuenta dos veces. Test en la Task 7.
4. **JSON del modelo malo o incompleto:** cuenta como «sin revisar», con motivo. Se descuenta lo gastado (hubo llamada) y no se avisa nada. Test en la Task 4.
5. **Cuadros de la carpeta de revisión:** nunca deben quedar dentro de la carpeta final que se sube por rsync. Test en la Task 3.

---

### Task 1: Modelo de datos del registro visual

**Files:**
- Create: `src/calendario/visual.ts`, `test/calendario/visual.ts` (sumarlo a `test/calendario.ts`)

**Interfaces:**
- Produces:
  ```ts
  export type TipoHallazgo = "tilde" | "puntuacion" | "transicion" | "numero-solo" | "zona" | "fondo-compite" | "fondo-ajeno";
  export interface VeredictoImagen { n: number; que: string; compite: boolean; ajeno: boolean; frase: string }
  export interface RevisionPieza { en: string; modelo: string; estado: "revisado" | "sin revisar"; motivo?: string; imagenes: VeredictoImagen[]; usd: number }
  export interface VisualPieza { revisor?: RevisionPieza; fase1?: { tipo: TipoHallazgo; motivo: string; en: string }[] }
  export interface PresupuestoSemana { imagenes: number; usd: number }
  export type VisualJson = Record<string, VisualPieza> & { _presupuesto?: PresupuestoSemana };
  export interface RespuestaVisual { id: string; n: number; respuesta: "si" | "no"; en: string }
  export const TOPES_REVISOR = { imagenesPorPieza: 12, imagenesPorSemana: 120, usdPorSemana: 5 } as const;
  export const visualPath = (semana: string) => string;            // <semanaDir>/visual.json
  export const respuestasVisualesPath = (semana: string) => string; // <semanaDir>/visual-respuestas.jsonl
  export async function leerVisual(semana: string): Promise<VisualJson>;              // falta o corrupto → {}
  export async function leerRespuestasVisuales(semana: string): Promise<RespuestaVisual[]>; // líneas malas se saltan
  export async function anotarRespuestaVisual(semana: string, r: RespuestaVisual): Promise<string>; // appendFile, devuelve la ruta
  /** Cuántas imágenes puede revisar la pieza sin pasar los topes (0 = sin revisar), y el motivo si se recorta a 0. */
  export function cupo(pres: PresupuestoSemana | undefined, pedidas: number): { imagenes: number; motivo?: string };
  ```
  `cupo` devuelve `min(pedidas, 12, 120 − pres.imagenes)`. Si `pres.usd ≥ 5`, devuelve 0 con el motivo «tope semanal de US$5».

- [ ] **Step 1: Tests:** `cupo` con presupuesto vacío y 15 pedidas → 12; con 115 usadas → 5; con 120 → 0 y motivo; con usd 5,01 → 0. `leerVisual` con un archivo corrupto → `{}`. `leerRespuestasVisuales` con una línea mala entre dos buenas → 2. `anotarRespuestaVisual` agrega una línea por llamada (`KB_DIR` en una carpeta temporal).
- [ ] **Step 2: Correr** `npx tsx test/calendario/visual.ts` → FAIL. **Step 3: Implementar.** **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `calendario: modelo del registro visual (visual.json, respuestas, topes)`

### Task 2: El Mac sube `visual.json` con la misma maquinaria que `render.json`

**Files:**
- Modify: `src/calendario/render.ts`:
  - `RENDER_REL_RE`, `aplicarEntradas`, `commitArchivo`, `escribirLocal`, `entradasLocales`, `alinearConRemoto`, `subirRender`, `crearEscritorRender`, `sincronizarPendiente`;
  - `procesar` (anota la fase 1);
  - `Deps` (nuevo `escribirVisual?`).
- Modify: `test/calendario/render.ts`

**Interfaces:**
- Consumes: `VisualPieza` (Task 1).
- Produces:
  - Las entradas pendientes pasan a indexarse por `(semana, archivo)`, con `archivo` = `"render.json" | "visual.json"`. Siguen fusionándose por id en el nivel superior, y `_presupuesto` se trata como un id más.
  - `crearEscritorRender` gana `escribirVisual(semana: string, id: string, e: VisualPieza | PresupuestoSemana): Promise<void>`. `id` = `"_presupuesto"` para el contador.
  - El asunto de commit de visual es `calendario: visual <semana> (n piezas)`.
  - `alinearConRemoto` acepta como propios los commits `calendario: render …` y `calendario: visual …` que tocan solo esos dos archivos.
  - `Deps.escribirVisual?` es opcional, para no romper los fakes existentes.
  - En `procesar`, ante un `ErrorVisual` con motivos nuevos, anota `fase1: [...previos, {tipo, motivo, en}]` en `visual.json`. Los motivos nuevos son los mismos que se avisan.
  - En `procesar`, `fase1` es acumulativo: lee el actual con `leerVisual`.

- [ ] **Step 1: Tests que fallan:**
  - `escribirVisual` + `confirmar` crean `visual.json` con la entrada y hacen un commit `calendario: visual …`. Usa el mismo patrón de repo git temporal con remoto que ya usan los tests de `subirRender` en `test/calendario/render.ts`; si no existe, usa `KB_GIT=0` y verifica el archivo.
  - Un commit local `calendario: visual …` sin subir no hace que `alinearConRemoto` devuelva «no son de render.json» (Review Focus 2).
  - `procesar` con un `ErrorVisual` llama a `escribirVisual` con `fase1` que contiene el tipo y el motivo.
- [ ] **Step 2: Correr** `npx tsx test/calendario.ts` → FAIL. **Step 3: Implementar** sin cambiar el comportamiento de `render.json`. Los tests existentes siguen verdes sin editarse. **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `render: el Mac sube visual.json junto con render.json y anota los bloqueos de la fase 1`

### Task 3: Cuadros a revisar por pieza

**Files:**
- Modify: `src/calendario/render.ts`:
  - el manifiesto (`.manifiesto.json`) gana `escenas?: { start: number; dur: number }[]`, sacado de `r.timing` en `renderPieza`;
  - `renderPieza` devuelve `escenas`;
  - `procesar` lo guarda.
- Create: `src/calendario/cuadros-visuales.ts`, `test/calendario/cuadros-visuales.ts` (offline) y un caso en `test/calendario/render-media.ts` (ffmpeg)

**Interfaces:**
- Produces:
  ```ts
  export interface Cuadro { n: number; que: string; t?: number; archivo: string /* en la carpeta final */ }
  /** Qué mirar (puro). Carrusel: portada (01.jpg) + cada slide cuyo borrador tiene background ai o image. Reel: portada (cover.jpg) + por cada escena con background ai/image o template Clip: cuadros en start+0, start+1 y fin (start+dur−transition−0,05; la última, total−0,05). Prioridad al recortar a `max`: portada, finales, 0 s, 1 s. `n` = posición 1..k estable. */
  export function cuadrosARevisar(formato: "reel" | "carrusel", b: Borrador, escenas: { start: number; dur: number }[] | undefined, transicion: number, max: number): Cuadro[];
  /** Extrae los cuadros a `<outRoot>/.revision/<semana>/<id>/<n>.jpg` (ffmpeg, 540 px de ancho); fuera de la carpeta final. Devuelve las rutas. */
  export async function extraerCuadros(final: string, destino: string, cuadros: Cuadro[]): Promise<{ n: number; ruta: string; que: string }[]>;
  ```
  `que` es legible, p. ej. `portada`, `slide 3`, `escena 2 (Clip) a 1 s`, `escena 4 (Step) final`. La transición sale del ritmo del borrador (`PACES[b.pace ?? DEFAULT_PACE].transition`).

- [ ] **Step 1: Tests offline:**
  - un carrusel de 5 slides con fondo `ai` en el 1 y el 4 → portada, slide 4 (n 1..2). La portada ya es el slide 1, así que no se duplica;
  - un reel de 6 escenas con `Clip` en la 1 y la 3 → portada + 6 cuadros;
  - con `max` 4, el recorte respeta la prioridad;
  - `escenas` ausente en un reel → solo la portada.
- [ ] **Step 2: Test de medios:** `extraerCuadros` sobre un MP4 de prueba, con el patrón de `render-media.ts`, deja JPGs en `destino`. Ningún archivo nuevo queda dentro de `final` (Review Focus 5).
- [ ] **Step 3: Correr** → FAIL. **Step 4: Implementar.** **Step 5: Correr** → PASS (`npx tsx test/calendario.ts && npx tsx test/calendario/render-media.ts`).
- [ ] **Step 6: Commit** `calendario: cuadros a revisar por pieza (fuera de la carpeta que se sube)`

### Task 4: El revisor con visión

**Files:**
- Create: `src/calendario/revisor-visual.ts`, `test/calendario/revisor-visual.ts`

**Interfaces:**
- Consumes: `VeredictoImagen` (Task 1).
- Produces:
  ```ts
  export const PREGUNTAS_REVISOR: readonly [string, string]; // las dos preguntas literales de Global Constraints
  export const PRECIOS_USD_POR_MTOK: Record<string, { entrada: number; salida: number }>; // al menos gpt-4o (2.5/10) y gpt-4o-mini (0.15/0.6)
  export function costoUsd(modelo: string, usage: { prompt_tokens: number; completion_tokens: number }): number;
  export interface ContextoPieza { id: string; formato: string; textos: string[] /* título y textos visibles del borrador */ }
  export type LlamarModelo = (args: { modelo: string; mensajes: unknown[] }) => Promise<{ contenido: string; usage: { prompt_tokens: number; completion_tokens: number } }>;
  /** Una llamada con todas las imágenes de la pieza (data URI JPEG, detail "high"). Nunca lanza. */
  export async function revisarFondos(imagenes: { n: number; ruta: string; que: string }[], ctx: ContextoPieza, deps: { llamar: LlamarModelo; modelo?: string; ahora?: () => Date }): Promise<RevisionPieza>;
  /** Implementación real de LlamarModelo con el SDK openai (cliente lazy; sin OPENAI_API_KEY lanza «falta OPENAI_API_KEY»). */
  export const llamarOpenAI: LlamarModelo;
  ```
  - El mensaje de sistema pide responder solo JSON `{"imagenes":[{"n":1,"compite":false,"ajeno":false,"frase":"…"}]}`, con una entrada por imagen y una frase de 25 palabras como máximo, en español.
  - Si el JSON es inválido, si falta alguna imagen o si `n` no coincide, el resultado es `estado: "sin revisar"` con el motivo y el `usd` gastado (Review Focus 4).
  - Si `llamar` lanza, el resultado es `estado: "sin revisar"` con `usd: 0`.

- [ ] **Step 1: Tests con `llamar` falso:**
  - El JSON correcto da `revisado` con los veredictos por `n`, y `usd` = `costoUsd(...)`.
  - El JSON con una imagen de menos da `sin revisar` con motivo y `usd > 0`.
  - Si `llamar` lanza, da `sin revisar` con `usd` 0.
  - El mensaje enviado contiene las dos preguntas literales, una `image_url` por imagen y los textos de la pieza.
  - `costoUsd("modelo-raro", …)` usa el precio más caro de la tabla.
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar.** **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `calendario: revisor visual con OpenAI (dos preguntas fijas, costo medido)`

### Task 5: Botones `cal-visual` y foto con botones desde el Mac

**Files:**
- Modify: `src/calendario/telegram.ts` (`callbackVisual`, `leerCallbackVisual`)
- Modify: `src/calendario/telegram-directo.ts` (`enviarFotoTelegram`)
- Modify: `test/calendario/telegram.ts`

**Interfaces:**
- Produces:
  ```ts
  export function callbackVisual(semana: string, id: string, n: number, resp: "si" | "no"): string; // ≤ 64 bytes, huella como callbackSaltar
  export function leerCallbackVisual(data: string, semanas: SemanaLeida[]): { semana: string; id: string; n: number; respuesta: "si" | "no" } | undefined;
  /** sendPhoto multipart (fetch + FormData + Blob) a cada chat permitido, con inline_keyboard. true si llegó a alguno. Nunca lanza; nunca deja tokens en logs. */
  export async function enviarFotoTelegram(ruta: string, caption: string, botones: { texto: string; data: string }[][], opts?: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch }): Promise<boolean>;
  ```
  Caption del aviso, con un helper exportado `captionVisual(id, semana, que, frase, tipo)` en `telegram.ts`: `🖼️ Revisión visual (aviso, no bloquea): <id> · <que>\n<frase>\n¿Tenía razón?`, truncado a `TELEGRAM_CAPTION_MAX`. `tipo` es «el fondo compite con el texto» o «el fondo no tiene que ver con la pieza».

- [ ] **Step 1: Tests:**
  - ida y vuelta de `callbackVisual` y `leerCallbackVisual` con un id corto y con uno largo (huella), siempre ≤ 64 bytes;
  - `n` no numérico, respuesta distinta de `si|no`, semana desconocida o huella ambigua → `undefined`;
  - `enviarFotoTelegram` con `fetch` falso recibe `FormData` con `chat_id`, `photo`, `caption` y `reply_markup` (JSON con dos botones) y devuelve true;
  - un 500 devuelve false;
  - sin token ni chats → false, sin llamar a `fetch`.
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar.** **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `telegram: botones cal-visual y foto con botones desde el Mac`

### Task 6: El bot del servidor atiende `cal-visual`

**Files:**
- Modify: `src/kb/bot.ts` (handler `bot.callbackQuery(/^cal-visual:/, …)` junto al de `cal-saltar`, ~l.303)
- Modify: `src/calendario/telegram.ts` (helper puro `textoRespuestaVisual(respuesta)` y, si hace falta, la marca que se agrega a la caption)
- Modify: `test/calendario/telegram.ts`

**Interfaces:**
- Consumes: `leerCallbackVisual` (Task 5), `anotarRespuestaVisual` (Task 1), `commitPaths` (`src/kb/store.ts`), `semanasActivas()` y `serial()` del bot.
- Produces: el handler.
  1. Llama a `answerCallbackQuery({ text: "Anotado" })`.
  2. Dentro de `serial`, resuelve la referencia contra las semanas activas.
  3. Si no hay referencia, responde con `sendMessage` «Ese botón ya no vale (la pieza ya no está en esta semana ni en la siguiente). No anoté nada.» y no escribe.
  4. Si la hay, ejecuta `anotarRespuestaVisual` y `commitPaths([ruta], "calendario: respuesta visual <semana>/<id> #<n>")`.
  5. Edita el mensaje: quita los botones y agrega a la caption `\n→ Tenía razón` o `\n→ No`. Un fallo al editar se ignora.

  Un segundo toque agrega otra línea, y gana la última (Review Focus 1).

- [ ] **Step 1: Tests puros:**
  - `textoRespuestaVisual("si")` → «→ Tenía razón», `("no")` → «→ No»;
  - `leerCallbackVisual` con una semana fuera de las activas → `undefined`.

  El handler es delgado y no tiene test de bot. Verifica con `npm run typecheck` y deja en el informe una prueba manual para el despliegue.
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar.** **Step 4: Correr `npm run typecheck && npm test`** → PASS.
- [ ] **Step 5: Commit** `bot: los botones de la revisión visual anotan la respuesta en visual-respuestas.jsonl`

### Task 7: Orquestación en el Mac (`revisarRenderizadas`)

**Files:**
- Create: `src/calendario/revision-fondos.ts`, `test/calendario/revision-fondos.ts`
- Modify: `src/calendario/render-cli.ts` (llamarla después de `procesar` y antes de confirmar las escrituras; en `--dry-run`, no)

**Interfaces:**
- Consumes: Tasks 1-5. `leerSemana`, `parseBorrador`, `leerBorradorSeguro`, el escritor (`escribirVisual`, `confirmar`).
- Produces:
  ```ts
  export interface DepsRevision {
    revisar: typeof revisarFondos; llamar: LlamarModelo;
    extraer: typeof extraerCuadros;
    enviarFoto: (ruta: string, caption: string, botones: { texto: string; data: string }[][]) => Promise<boolean>;
    escribirVisual: (semana: string, id: string, e: VisualPieza | PresupuestoSemana) => Promise<void>;
    log: (t: string) => void; ahora?: () => Date;
  }
  /** Revisa las piezas renderizadas en outRoot (carpeta final con manifiesto) cuya entrada en visual.json no tiene `revisor` y cuya hora no pasó. Respeta topes; nunca lanza. Devuelve un resumen. */
  export async function revisarRenderizadas(semanas: SemanaLeida[], outRoot: string, deps: DepsRevision): Promise<{ revisadas: number; sinRevisar: number; avisos: number; usd: number }>;
  ```
  - Por cada pieza, en orden de hora:
    1. calcula `cupo`; si da 0, guarda `revisor: {estado:"sin revisar", motivo, imagenes:[], usd:0}`;
    2. si hay cupo: `cuadrosARevisar` → `extraer` → `revisar`;
    3. guarda la revisión y actualiza `_presupuesto` (imágenes enviadas y `usd`);
    4. por cada imagen con `compite || ajeno`, ejecuta `enviarFoto` con `captionVisual` y los botones `[[{texto:"Tenía razón", data: callbackVisual(…, "si")}, {texto:"No", data: callbackVisual(…, "no")}]]`.
  - Si una imagen tiene las dos cosas, se manda un solo aviso con el tipo `fondo-compite`.
  - Sin `OPENAI_API_KEY`, se registra en el log una vez y no se toca `visual.json`: se reintenta cuando haya clave.
  - Los cuadros de `.revision/` se borran al terminar cada pieza.

- [ ] **Step 1: Tests con deps falsas:**
  - Una pieza con un «no» manda 1 foto con 2 botones y escribe `revisor` y `_presupuesto`.
  - Una segunda corrida sobre la misma pieza no llama a `revisar` ni a `enviarFoto` (Review Focus 3).
  - Con un presupuesto de 118 imágenes y una pieza que pide 5, se revisan 2.
  - Con 120 imágenes, queda `sin revisar` y no hay llamada.
  - Con US$5, queda `sin revisar`.
  - Si `revisar` devuelve `sin revisar`, no se manda ninguna foto.
  - Una pieza cuya hora pasó se omite.
  - Si `extraer` lanza, la pieza no se anota y solo hay log, para que la próxima corrida reintente.
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar y conectar en `render-cli.ts`.** **Step 4: Correr `npm run typecheck && npm test`** → PASS.
- [ ] **Step 5: Commit** `calendario: el Mac revisa los fondos de lo renderizado y avisa con botones (sin bloquear)`

### Task 8: Precisión y hallazgos en el bucle

**Files:**
- Modify: `src/calendario/bucle.ts`:
  - `EntradasBucle.visual?: { semana: string; visual: VisualJson; respuestas: RespuestaVisual[] }[]`;
  - `BucleJson.visual`;
  - `leerBase` lee las últimas 4 semanas.
- Create: función pura `resumenVisual` en `src/calendario/visual.ts`
- Modify: `test/calendario/bucle.ts`, `test/calendario/visual.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ResumenVisual {
    porSemana: { semana: string; avisos: number; respondidos: number; aciertos: number; precision?: number /* aciertos/respondidos, 2 decimales; ausente si 0 respondidos */ }[];
    porTipo: Record<string, Record<string, number>>; // tipo → semana → casos
    total: { avisos: number; respondidos: number; aciertos: number; precision?: number };
    alertas: string[];   // tipo de fase 1 que reaparece con fecha ≥ `desde` de la regla revision-visual-fase1: «el motor volvió a fallar en <tipo> (<n> casos desde <desde>): revisar el código»
    propuestas: string[]; // tipo fondo-* con ≥ 3 casos en ≥ 2 semanas distintas: «proponer regla en aprendizajes.md: <tipo> (<n> casos en <k> semanas)»
  }
  export function resumenVisual(semanas: { semana: string; visual: VisualJson; respuestas: RespuestaVisual[] }[], desdeFase1?: string): ResumenVisual;
  ```
  - Un aviso es una imagen con `compite || ajeno` en una revisión `revisado`.
  - Respondido = hay al menos una respuesta para ese (id, n), y gana la última por `en`.
  - Acierto = la última respuesta es `"si"`.

- [ ] **Step 1: Tests:** precisión 2/3 con tres avisos respondidos (si, si, no) y uno sin responder → `porSemana[0] = {avisos:4, respondidos:3, aciertos:2, precision:0.67}`. Doble respuesta (no y después si) → cuenta como si. `fondo-ajeno` con 3 casos en 2 semanas → 1 propuesta; con 3 casos en 1 semana → 0. `zona` en `fase1` con fecha posterior a `desde` → 1 alerta. `construirBucle` incluye `visual` cuando hay entradas.
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar.** **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `bucle: precisión semanal del revisor visual y hallazgos por tipo`

### Task 9: Regla, documentación de despliegue y PR

**Files:**
- Modify: `kb-plantilla/_calendario/reglas.json`, más su entrada en la lista fija de `test/calendario/reglas.ts`, como en la fase 1:
  `{ "id": "revision-visual-fase2", "desde": "2026-10-24", "formato": null, "descripcion": "Revisor visual con IA en modo aviso (fondo que compite o ajeno), con botones Tenía razón/No y precisión en el bucle", "fuente": "PR de la fase 2 de la revisión visual (docs/superpowers/specs/2026-10-23-revision-visual-design.md)" }`
- Modify: `.env.example` (`REVISOR_VISUAL_MODEL`, comentada)
- Modify: `deploy/README.md` (una línea: el bot atiende `cal-visual`; se despliega con el procedimiento existente)

- [ ] **Step 1: Puerta completa:** `npm run typecheck && npm test && npm run test:reel` → 0.
- [ ] **Step 2: Prueba en seco en el Mac, sin gastar ni avisar:** corre `revisarRenderizadas` sobre una carpeta de salida del corpus, con `llamar` falso y `enviarFoto` que solo registra. Es un script desechable fuera del repo. Pega el resumen en el informe.
- [ ] **Step 3: Commit** `docs: regla y despliegue de la fase 2 de la revisión visual`. El controlador hace el push y la PR (base: `claude/revision-visual-fase1`).
