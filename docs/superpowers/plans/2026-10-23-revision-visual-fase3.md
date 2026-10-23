# Revisión visual, fase 3 (corrección automática acotada) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando el revisor visual marca el fondo de una slide como problemático, el Mac re-renderiza esa pieza con fondo liso en esa slide, la vuelve a subir antes de su hora y deja registro de la corrección. Solo actúa si el revisor demostró acertar: al menos 30 avisos respondidos y una precisión de 0,8 o más. No bloquea piezas ni regenera imágenes.

**Architecture:**
- **Dónde corre:** en el Mac, en `render-cli.ts`, después de `revisarRenderizadas`. Ahí entra un paso nuevo, `corregirFondos`.
- **Qué corrige:** para cada pieza recién revisada con avisos sobre slides que tienen fondo `ai`, decide qué slides corregir (función pura) y comprueba la puerta de activación (precisión acumulada y un interruptor en `config.json`).
- **Cómo corrige:** re-renderiza con `renderPieza`, quitando esos fondos con el mismo mecanismo que hoy usa `fondosIaQuitados`. Sube con rsync, verifica y reescribe la entrada de `render.json` con un `en` nuevo, así el bot manda un preview nuevo.
- **Registro:** `visual.json → correccion`. Una pieza corregida no se vuelve a revisar ni a corregir.
- **Medición:** el aviso de Telegram sigue saliendo con «Tenía razón / No», ahora con la marca «(corregido: fondo quitado)», para que la precisión se siga midiendo.

**Tech Stack:** TypeScript (tsx), los módulos de las fases 1 y 2 (`render.ts`, `revision-fondos.ts`, `cuadros-visuales.ts`, `visual.ts`, `telegram.ts`), ffmpeg y Playwright con el Chromium local.

**Spec:** `docs/superpowers/specs/2026-10-23-revision-visual-design.md`, en «Fase 3 — Corrección automática acotada (decisión futura)» y «Anti-metas». Se apoya en las fases 1 y 2, ya en `main` (PRs #59, #60 y #61).

## Global Constraints

- **Lo que dice el spec:** «Solo si en la fase 2 el revisor acierta al menos el 80 % de las veces en lo que marca, con 30 avisos o más: ante un "no", quitar el fondo de esa slide y re-renderizar con el fondo liso. Nunca regenerar la imagen ni bloquear la pieza.»
- **Puerta de activación.** Tienen que cumplirse las dos condiciones, y se comprueban en cada corrida:
  1. `config.json → revisionVisual.corregir === true`. El usuario lo enciende a mano; por defecto está apagado.
  2. Con `resumenVisual` sobre todas las semanas con `visual.json` del clon del Mac, `total.respondidos ≥ 30` y `total.precision ≥ 0.8`.

  Si alguna falla, se registra en el log una vez por corrida («fase 3 inactiva: <motivo>») y no se toca nada.
- **Qué se corrige.** Solo slides o escenas con fondo `{ ai }` en el borrador, que hoy solo puede estar en Hook o Cta (`PLANTILLAS_IA`). Las escenas `Clip` (video) nunca se corrigen: siguen solo con aviso.
- **Fondo liso.** Se quita `background`, que es lo mismo que hace `fondosIaQuitados`: la slide queda con el fondo por defecto del look lima. Nunca se llama a la API de imágenes.
- **Plazo.** Solo se corrige si faltan al menos 30 min para la hora de la pieza (`MARGEN_CORRECCION_MS = 30 * 60_000`). La hora se vuelve a comprobar antes de subir y antes de anotar. Si no alcanza, queda el render original, que ya estaba subido y es válido.
- **Una corrección por pieza.** Una pieza con `visual.json → <id>.correccion` no se vuelve a revisar ni a corregir. Esto evita bucles de revisar, corregir y volver a revisar.
- **Fallo de la corrección.** Si falla el re-render, la subida o la verificación, todo queda como estaba: el original sigue subido y `render.json` no cambia. Se anota `correccion.estado: "fallida"` con el motivo y se avisa una vez por Telegram. Nunca deja la pieza en `fallido`.
- **Fase 1 en el re-render.** Las comprobaciones de la fase 1 corren igual en modo bloquear. Si el re-render no pasa, cuenta como corrección fallida y se queda el original.
- Español; ramas `claude/…`; nunca push a `main`; no editar tests para que pasen; `knowledge/` es de solo lectura. Puerta de calidad: `npm run typecheck && npm test && npm run test:reel` en 0, con Chromium vía `PLAYWRIGHT_CHROMIUM_EXECUTABLE=…/chromium_headless_shell-1217/…`; nunca `playwright install`.
- Es un cambio de riesgo (decide qué se publica y reescribe medios ya subidos): antes del merge, `/codex:adversarial-review`, que lo lanza el usuario.

## Review Focus

1. **Carrera con la publicación:** el bot publica a la hora usando los nombres de archivo de `render.json`. Una subida que pise los archivos justo a esa hora podría publicar un archivo a medias. Por eso se usan el margen de 30 min y la doble comprobación de la hora. Test en la Task 3.
2. **Bucle:** no puede pasar que una corrección dispare una nueva revisión y una nueva corrección. Test en la Task 3.
3. **Puerta mal leída:** con `config.json` ausente o corrupto, o con `precision` ausente (0 respondidos), la fase 3 queda inactiva. Test en la Task 1.
4. **Aviso de una escena Clip o de una slide sin fondo ai:** nunca se corrige. Test en la Task 2.
5. **Preview del bot:** al reescribir `render.json` con un `en` nuevo, `previewsPendientes` vuelve a mandar el preview. Debe llegar exactamente uno. Test en la Task 3, contra `previewsPendientes` de `telegram.ts`.

---

### Task 1: Puerta de activación

**Files:**
- Create: `src/calendario/correccion-fondos.ts`, `test/calendario/correccion-fondos.ts` (sumarlo a `test/calendario.ts`)
- Modify: `kb-plantilla/_calendario/config.json` (`"revisionVisual": { "corregir": false }`), y `kb-plantilla/_calendario/validar.mjs` solo si su autoprueba rechaza claves desconocidas (comprobar con `node kb-plantilla/_calendario/validar.mjs --self-test`)

**Interfaces:**
- Consumes: `resumenVisual`, `leerVisual`, `leerRespuestasVisuales` (`visual.ts`); `calendarioDir`, `listarSemanas` (`plan.ts`).
- Produces:
  ```ts
  export const UMBRAL_CORRECCION = { respondidos: 30, precision: 0.8 } as const;
  export interface PuertaCorreccion { activa: boolean; motivo: string; respondidos: number; precision?: number }
  /** Pura: decide con el interruptor y el resumen. */
  export function puertaCorreccion(interruptor: unknown, total: { respondidos: number; precision?: number }): PuertaCorreccion;
  /** Lee config.json → revisionVisual.corregir y el resumen de todas las semanas con visual.json. Nunca lanza (cualquier error → inactiva con motivo). */
  export async function leerPuertaCorreccion(): Promise<PuertaCorreccion>;
  ```
  Ejemplos de `motivo`: `«apagada en config.json»`, `«solo 12 avisos respondidos (faltan 18)»`, `«precisión 0,72 < 0,8»`, `«activa (precisión 0,86 con 34 respondidos)»`.

- [ ] **Step 1: Tests:**
  - `puertaCorreccion(true, {respondidos: 30, precision: 0.8})` → activa;
  - con `false` o `undefined` → inactiva, motivo «apagada»;
  - con 29 respondidos → inactiva;
  - con precisión 0,79 → inactiva;
  - con precisión ausente → inactiva;
  - `leerPuertaCorreccion` con `config.json` corrupto en un `KB_DIR` temporal → inactiva, sin lanzar.
- [ ] **Step 2: Correr** `npx tsx test/calendario/correccion-fondos.ts` → FAIL. **Step 3: Implementar.** **Step 4: Correr** → PASS. Correr también `node kb-plantilla/_calendario/validar.mjs --self-test` → OK.
- [ ] **Step 5: Commit** `calendario: puerta de la fase 3 (interruptor + precisión ≥ 0,8 con ≥ 30 respuestas)`

### Task 2: Qué slides corregir

**Files:**
- Modify: `src/calendario/cuadros-visuales.ts` (`Cuadro` gana `slide: number`, el índice de slide o escena; la portada es la 0) y `src/calendario/visual.ts` (`VeredictoImagen` gana `slide?: number`; `VisualPieza` gana `correccion?: CorreccionPieza`, saneado en `leerVisual`)
- Modify: `src/calendario/revision-fondos.ts` (propaga `slide` del cuadro al veredicto)
- Modify: `src/calendario/correccion-fondos.ts`, `test/calendario/correccion-fondos.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CorreccionPieza { en: string; estado: "aplicada" | "fallida" | "omitida"; slides: number[]; motivo?: string }
  /** Pura: índices de slide (ordenados, sin repetir) con aviso (compite || ajeno) cuyo borrador tiene background.ai y no es Clip; excluye los que fondosIaQuitados ya quita. */
  export function slidesACorregir(b: Borrador, imagenes: VeredictoImagen[], yaQuitadas: number[]): number[];
  ```

- [ ] **Step 1: Tests:**
  - Hook con fondo ai y aviso en la portada → `[0]`.
  - Aviso en una escena Clip → `[]` (Review Focus 4).
  - Aviso en un Step sin fondo → `[]`.
  - Dos avisos de la misma slide (0 s y final) → `[i]` una vez.
  - Una slide ya quitada por el tope → `[]`.
  - `leerVisual` conserva una `correccion` válida y descarta una mal formada.
  - El veredicto guardado por `revisarRenderizadas` lleva `slide`.
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar.** **Step 4: Correr** `npx tsx test/calendario.ts` → PASS.
- [ ] **Step 5: Commit** `calendario: qué slides corrige la fase 3 (solo fondos ai, nunca Clip)`

### Task 3: Re-render corregido y nueva subida

**Files:**
- Modify: `src/calendario/render.ts`. `renderPieza` gana `opts.quitarFondos?: { slide: number; motivo: string }[]`, que se suma a lo de `fondosIaQuitados`. El aviso «Fondo ai quitado…» dice el motivo.
- Modify: `src/calendario/correccion-fondos.ts`, `test/calendario/correccion-fondos.ts`

**Interfaces:**
- Consumes: `renderPieza`, `leerManifiesto`, `MANIFIESTO`, `destinoRemoto`, `urlPublica`, `tipoDe`, `armarMedios` (exportarlo si hace falta), `horaDe` y el escritor (`escribirRender`, `escribirVisual`, `visualPendiente`).
- Produces:
  ```ts
  export const MARGEN_CORRECCION_MS = 30 * 60_000;
  export interface DepsCorreccion {
    render: (p: PiezaPendiente, tmp: string, quitar: { slide: number; motivo: string }[]) => Promise<{ archivos: string[]; duracionMs?: number; escenas?: { start: number; dur: number }[] }>;
    rsync: Deps["rsync"]; verificar: Deps["verificar"];
    escribirRender: Deps["escribirRender"]; escribirVisual: (semana: string, id: string, e: VisualPieza) => Promise<void>;
    avisar: (t: string) => Promise<boolean | void>; log: (t: string) => void; ahora?: () => Date;
  }
  /** Para cada pieza con revisión nueva en esta corrida (las que devolvió revisarRenderizadas) y slidesACorregir no vacío: re-render en tmp → swap atómico de la carpeta final → rsync → verificar → escribirRender(renderizado, en nuevo) → visual.correccion "aplicada". Nunca lanza. */
  export async function corregirFondos(piezas: { semana: string; id: string }[], outRoot: string, env: EnvRender, puerta: PuertaCorreccion, deps: DepsCorreccion): Promise<{ aplicadas: number; fallidas: number; omitidas: number }>;
  ```
  - **Hora:** se comprueba al empezar, antes de rsync y antes de `escribirRender`. Si en cualquiera de esos puntos falta menos de `MARGEN_CORRECCION_MS`, queda `correccion: "omitida"`, con el motivo «sin margen antes de la hora».
  - **Swap de la carpeta final:** el render nuevo va a `<id>.tmp-corr-<pid>`. La carpeta final actual pasa a `<id>.prev-<pid>`, la nueva pasa a final, y la previa se borra al terminar bien.
  - **Si algo falla:** la previa se restaura, se anota `"fallida"` con el motivo y se avisa una vez.
  - Un `ErrorVisual` o un `ErrorContenido` del re-render cuenta como fallida.
  - **No se vuelve a revisar** (Review Focus 2): `revisarRenderizadas` ya omite las piezas con `correccion`, y `procesar` (M-b de la fase 2) solo borra `revisor` e `intentos`, no `correccion`. Hay que confirmarlo en un test.

- [ ] **Step 1: Tests con deps falsas:**
  - Pieza a 2 h → re-render con `quitar = [0]`, rsync, verificar, `escribirRender` con un `en` posterior al original, `correccion.aplicada`, y la carpeta previa borrada.
  - Pieza a 20 min → omitida, sin render.
  - La hora cruza el margen durante el render → omitida antes de rsync. La carpeta original queda restaurada y `render.json` no se toca (Review Focus 1).
  - rsync falla → fallida, original restaurado, un aviso.
  - Puerta inactiva → no hace nada.
  - Pieza con `correccion` previa → no hace nada.
  - Después de una corrección aplicada, `revisarRenderizadas` no revisa esa pieza (Review Focus 2).
  - Con `previewsPendientes` de `telegram.ts` y el `en` nuevo, la pieza vuelve a estar pendiente de preview una sola vez (Review Focus 5).
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar.** **Step 4: Correr** `npx tsx test/calendario.ts` → PASS.
- [ ] **Step 5: Test de medios:** en `test/calendario/render-media.ts`, `renderPieza` con `quitarFondos: [{slide: 0, …}]` sobre un borrador de prueba con fondo ai en caché produce una portada sin la imagen. Comparar la luminancia media de la portada con la del render con fondo, o bien que el fondo no contenga la imagen de prueba. Correr con Chromium → PASS.
- [ ] **Step 6: Commit** `calendario: la fase 3 re-renderiza con fondo liso y vuelve a subir antes de la hora`

### Task 4: Conexión, aviso y registro en el bucle

**Files:**
- Modify: `src/calendario/revision-fondos.ts`. `revisarRenderizadas` devuelve también `revisadas: {semana, id}[]` y omite las piezas con `correccion`. Con la puerta activa y una corrección aplicada, la caption del aviso agrega «(corregido: fondo quitado)».
- Modify: `src/calendario/telegram.ts` (`captionVisual` acepta `corregido?: boolean`)
- Modify: `src/calendario/render-cli.ts`. Después de `revisarRenderizadas` llama a `leerPuertaCorreccion` y a `corregirFondos`, antes de los `confirmar`, y no corre con `--dry-run`. La corrección corre antes de enviar las fotos, para que la caption diga si se corrigió. Si eso obliga a partir `revisarRenderizadas` en «revisar» y «avisar», hazlo y documéntalo.
- Modify: `src/calendario/visual.ts` (`resumenVisual` suma `correcciones: { aplicadas, fallidas, omitidas }` por semana y en total)
- Modify: `kb-plantilla/_calendario/INSTRUCCIONES.md` (una línea en la viñeta `visual` sobre `correcciones`)
- Modify: tests de `revision-fondos.ts`, `telegram.ts`, `visual.ts` y `bucle.ts`

- [ ] **Step 1: Tests:**
  - Con la puerta activa, una pieza marcada se corrige y su foto lleva «(corregido: fondo quitado)».
  - Con la puerta inactiva, el aviso no cambia respecto de la fase 2.
  - `resumenVisual` cuenta las correcciones por semana.
  - `construirBucle` incluye `correcciones`.
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar.** **Step 4: Correr** `npm run typecheck && npm test` → PASS.
- [ ] **Step 5: Commit** `calendario: conecta la fase 3 al render del Mac y la mide en el bucle`

### Task 5: Prueba en seco, regla y PR

**Files:**
- Modify: `kb-plantilla/_calendario/reglas.json`, más su fila en la lista fija de `test/calendario/reglas.ts`:
  `{ "id": "revision-visual-fase3", "desde": "<día en que se enciende revisionVisual.corregir>", "formato": null, "descripcion": "Corrección automática acotada: con precisión del revisor ≥ 0,8 y ≥ 30 respuestas, el Mac quita el fondo ai de la slide marcada y re-renderiza antes de la hora", "fuente": "PR de la fase 3 de la revisión visual (docs/superpowers/specs/2026-10-23-revision-visual-design.md)" }`
- Modify: `deploy/README.md` (cómo encender o apagar la fase 3 en `config.json`)

- [ ] **Step 1: Prueba en seco sin gastar ni subir.**
  - Script desechable fuera del repo: corpus con `--conservar` para una pieza con fondo ai (p. ej. `2026-10-19/mar-carrusel-6-preguntas-para-delegar-en-ia` o un Hook con ai).
  - Luego `corregirFondos` con la puerta forzada a activa, un `render` real, y `rsync`, `verificar` y el escritor falsos.
  - Guarda en `informes/` la portada antes y después, en JPG chico.
- [ ] **Step 2: Puerta completa:** `npm run typecheck && npm test && npm run test:reel` → 0.
- [ ] **Step 3: Commit, push de la rama `claude/revision-visual-fase3` y PR.**
  - **Cuerpo:** puerta de activación, qué se corrige y qué no, margen, registro y antes/después.
  - **Despliegue:** `git pull` en `Carrusel-render`; el bot no cambia; encender con `revisionVisual.corregir: true` en el `config.json` de la base cuando `bucle.json → visual.total` cumpla la puerta, y ajustar el `desde` de la regla ese día.
  - Pide `/codex:adversarial-review` antes del merge.
