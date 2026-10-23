# Revisión visual, fase 1 (motor y comprobaciones exactas) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ninguna pieza se publique con tildes que pisan la línea de arriba, espacio antes de la puntuación, textos de dos escenas encimados o un número de paso solo, y que el render del Mac lo compruebe en el DOM y lo bloquee con un aviso por pieza y motivo.

**Architecture:** Un script de navegador (`src/render/revision-dom.js`, como `runtime.js`) mide el DOM de un slide o de un instante del reel y devuelve estados y hallazgos. Del lado de Node, `src/render/revision.ts` (carrusel, story) y `src/reel/revision.ts` (reel, recorre la timeline con `__reel.seek`) los agregan en `Hallazgo[]`. Si hay hallazgos, el render lanza `ErrorVisual`. `procesar` lo trata como error reintentable: la pieza sigue `planificado` y avisa una vez por pieza y motivo. Los arreglos de fondo van en el motor: `fit.ts` y las plantillas para las tildes, `runtime.js` para la puntuación, la transición y el número.

**Tech Stack:** TypeScript (tsx), React SSR, Playwright con el Chromium local, GSAP SplitText, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-23-revision-visual-design.md` (y `docs/superpowers/plans/2026-10-23-revision-visual-PROMPT.md`).

## Global Constraints

- Español en código nuevo (comentarios, mensajes, commits); identificadores como estén.
- Puerta: `npm run typecheck && npm test && npm run test:reel` en 0. Para correr Chromium en este Mac:
  `export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/Users/felipevasquez/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell`
  (es el mismo que usa el launchd del render). **No** ejecutes `playwright install`.
- No edites ni borres tests para que pasen. Si un test fija algo que este plan cambia (p. ej. la
  opacidad en mitad de una transición), detente y repórtalo.
- `knowledge/` es de solo lectura. No borres `.cache/` ni los clips. Cero llamadas a APIs de pago
  (el corpus usa solo fondos en caché).
- Motivos legibles con el prefijo `visual:`, p. ej. `visual: tilde de «PRÓXIMO» pisa la línea anterior en escena 6 (Cta)`.
- Tipos de hallazgo (los mismos de la fase 2): `tilde`, `puntuacion`, `transicion`, `numero-solo`, `zona`.
- Umbrales de partida (spec): encime = dos textos de escenas distintas con opacidad ≥ 0,3 cada uno
  e intersección ≥ 10 % del área del menor; número solo = número con opacidad ≥ 0,8 mientras su
  heading está bajo 0,2 durante más de 0,4 s. Solo se calibran con el corpus y queda escrito en la PR.
- Los tiempos totales de `timing.ts` no cambian.
- Un fallo visual **no** es `fallido` terminal: la pieza sigue `planificado`, se avisa una vez por
  (pieza, motivo) y se reintenta en cada corrida.

## Review Focus

1. **Texto con transform a medio animar:** `getBoundingClientRect` y `Range.getClientRects` ya incluyen los transforms. Una palabra al 90 % de escala entre dos palabras normales no debe contar como espacio antes de la puntuación si no hay puntuación. La prueba va en la Task 1.
2. **Elementos ocultos que siguen en el DOM**, como el marcador de `strike` con `display:none`, los trozos de subtítulo con `autoAlpha 0` o el cursor apagado: no pueden disparar encime ni zona. La prueba va en la Task 4.
3. **Escena única, o un reel sin Step:** `revisarReel` no falla y no inventa transiciones. La prueba va en la Task 3.
4. **El mismo hallazgo en 20 instantes seguidos:** sale un solo motivo por (tipo, escena, texto), no 20. La prueba va en la Task 1, sobre el agregador.
5. **Un aviso ya enviado en una corrida anterior:** no se repite cada hora. Si cambia el motivo, avisa del nuevo. Cuando la pieza sale bien, su registro se limpia. La prueba va en la Task 7.

---

### Task 1: Núcleo de la revisión (DOM + agregador) con tilde, puntuación y zona

**Files:**
- Create: `src/render/revision-dom.js` (navegador; define `window.__revisarVisual`)
- Create: `src/render/revision.ts` (tipos, `ErrorVisual`, agregadores puros, `revisarPagina`)
- Create: `test/revision.ts` (offline, agregadores) y súmalo a `npm test`
- Create: `test/revision-visual.ts` (Chromium) y súmalo al inicio de `test:reel`

**Interfaces:**
- Produces:
  ```ts
  export type TipoVisual = "tilde" | "puntuacion" | "transicion" | "numero-solo" | "zona";
  export interface Hallazgo { tipo: TipoVisual; motivo: string; escena?: number; t?: number }
  export class ErrorVisual extends Error { constructor(public hallazgos: Hallazgo[]) } // name "ErrorVisual", message = motivos unidos
  export type ModoRevision = "bloquear" | "avisar" | "no";
  /** Estado de un texto visible en un instante (lo devuelve el DOM). */
  export interface TextoDom { escena: number; texto: string; opacidad: number; rect: { x: number; y: number; w: number; h: number }; paso?: "numero" | "heading"; marca: boolean }
  /** Lo que devuelve window.__revisarVisual(opts) */
  export interface InstanteDom { textos: TextoDom[]; hallazgos: Hallazgo[] }
  export function inyectarRevision(page: Page): Promise<void>;          // addScriptTag con revision-dom.js (idempotente)
  export function revisarPagina(page: Page, contexto: string, opts: { reel: boolean; altura: number }): Promise<Hallazgo[]>; // tilde+puntuación(+zona si reel)
  export function unicos(h: Hallazgo[]): Hallazgo[];                     // dedup por (tipo, escena, motivo)
  export function aplicarModo(h: Hallazgo[], modo: ModoRevision, log?: (t: string) => void): void; // bloquear → throw ErrorVisual; avisar → log; no → nada
  ```
- `window.__revisarVisual({ comprobar: ("tilde"|"puntuacion"|"zona")[], zona?: { arriba: number; abajo: number } })` → `InstanteDom`. `textos` lista cada elemento con texto propio dentro de `[data-scene]` (o del body si no hay escenas; escena 0), con su opacidad efectiva. La opacidad efectiva es el producto de `opacity` por los ancestros; vale 0 si algún ancestro tiene `visibility:hidden` o `display:none`. `marca` = está dentro de `[data-brand]`. `paso` sale de `data-paso`.

**Algoritmos que el test no determina:**
- *Tilde:* para cada carácter `[ÁÉÍÓÚÜÑ]` visible (después de `text-transform`; usa el texto que se pinta) dentro de un elemento con `font-family` Anton, mide con `Range` el rect del carácter. Línea base = `rect.top + fontBoundingBoxAscent` (canvas `measureText` con la fuente computada). Tope de tinta = base − `actualBoundingBoxAscent(char)`. Contra cada carácter de cualquier texto visible de la misma escena cuyo rect esté arriba y se solape en x más de 1 px: su fondo de tinta es su base + `actualBoundingBoxDescent(char)`. Hay hallazgo si el tope de tinta queda por encima de ese fondo menos 1 px (se tocan o se pisan). Motivo: `visual: tilde de «<palabra>» pisa la línea anterior en <contexto>`.
- *Puntuación:* para cada carácter de cierre `[,.;:!?…)»”]` visible, toma el carácter visible no blanco anterior en orden de documento (TreeWalker sobre nodos de texto). Si están en la misma línea (solape vertical > 50 %) y `left(puntuación) − right(anterior) > 0,12 × font-size`, hay hallazgo `visual: espacio antes de «,» tras «<palabra>» en <contexto>`.
- *Zona (solo reel):* un texto que no es marca, con opacidad ≥ 0,3, cuyo rect sale de `[zona.arriba, altura − zona.abajo]`.

- [ ] **Step 1: Tests offline del agregador** (`test/revision.ts`, arnés `test/_check.ts`)

```ts
check("unicos: el mismo hallazgo en 20 instantes queda uno", () => {
  const h = { tipo: "puntuacion" as const, motivo: "visual: espacio antes de «,» tras «SEEDANCE» en escena 3 (Clip)", escena: 2 };
  assert.equal(unicos(Array.from({ length: 20 }, (_, i) => ({ ...h, t: i / 10 }))).length, 1);
});
check("aplicarModo bloquear lanza ErrorVisual con los motivos", () => {
  assert.throws(() => aplicarModo([h], "bloquear"), (e: unknown) => e instanceof ErrorVisual && /SEEDANCE/.test(e.message));
});
check("aplicarModo avisar y no: no lanzan", () => { aplicarModo([h], "avisar", () => {}); aplicarModo([h], "no"); });
```

- [ ] **Step 2: Correr `npx tsx test/revision.ts`** → falla (no existe `src/render/revision.ts`).
- [ ] **Step 3: Implementar `src/render/revision.ts` (tipos, `ErrorVisual`, `unicos`, `aplicarModo`)** → el test pasa.
- [ ] **Step 4: Tests de Chromium** (`test/revision-visual.ts`), sobre HTML hecho con `htmlShell` y `revisarPagina`:

```ts
// tilde: Anton 124 px, ancho 640, dos líneas
"PARA TU<br>PRÓXIMO" con line-height 0.98 → 1 hallazgo tipo "tilde" con «PRÓXIMO»
igual con line-height 1.14                → 0 hallazgos
"GUÁRDALO<br>PARA TU" (tilde en la 1.ª línea) con 0.98 → 0 hallazgos
// puntuación
'<h2 style="font-family:Anton;font-size:124px"><span style="display:inline-block;transform:scale(0.9)">SEEDANCE</span>, MISMO</h2>' → 1 hallazgo "puntuacion"
'<h2 ...>SEEDANCE, MISMO</h2>' → 0
'<h2 ...>GANA <span style="display:inline-block;transform:scale(0.9)">KLING</span> REAL</h2>' → 0  (Review Focus 1: no hay puntuación)
// zona (reel, alto 1920, zona {arriba:150, abajo:440}): texto en top 1600 → 1 "zona"; mismo texto con opacity 0 → 0
```

- [ ] **Step 5: Correr `npx tsx test/revision-visual.ts`** → falla (no existe `revision-dom.js`).
- [ ] **Step 6: Implementar `src/render/revision-dom.js` e `inyectarRevision`/`revisarPagina`** → pasa.
- [ ] **Step 7: Agregar `tsx test/revision.ts` a `npm test` y `tsx test/revision-visual.ts` al inicio de `test:reel` en `package.json`; correr `npm run typecheck && npx tsx test/revision.ts && npx tsx test/revision-visual.ts`** → 0.
- [ ] **Step 8: Commit** `revision: núcleo de la revisión visual del DOM (tilde, puntuación, zona)`

### Task 2: Arreglo de tildes en los titulares Anton

**Files:**
- Modify: `src/templates/fit.ts` (nuevo `displayLineHeight`)
- Modify: `src/templates/Hook.tsx`, `Cta.tsx`, `Clip.tsx`, `Step.tsx`, `Screen.tsx`, `Prompt.tsx`, `Stat.tsx` (valor y etiqueta), `MythReality.tsx`, `StoryCover.tsx`: cada `lineHeight` fijo de un texto Anton y el mismo número en su `antonHeight(...)` pasan por `displayLineHeight(texto, base)`
- Create: `test/fixtures/revision-visual/` con copias de `knowledge/_calendario/2026-10-12/sab-reel-narra-sin-tu-voz.json` y `knowledge/_calendario/2026-10-19/vie-pm-reel-kling-vs-seedance.json` (se leen de la bóveda y se copian; no se modifica la bóveda)
- Modify: `test/revision-visual.ts`

**Interfaces:**
- Consumes: `revisarPagina` (Task 1).
- Produces: `export const ANTON_LH_ACENTO = 1.14;` y `export function displayLineHeight(text: string, base: number): number` en `fit.ts`. Devuelve `Math.max(base, ANTON_LH_ACENTO)` si `text` tiene `[ÁÉÍÓÚÜÑáéíóúüñ]`; si no, `base`. Medido en Chromium: la tilde de Anton sube 1,101 em sobre la línea base, más 0,04 em de aire. Así los titulares sin tildes no cambian.

- [ ] **Step 1: Test que falla:** renderiza la escena Cta del fixture de narra-sin-tu-voz (`borradorASpec(parseBorrador(...), { format: "reel" })`, slide 6) en reel y en post con `htmlShell(renderToStaticMarkup(...))`, más Hook «Narra videos sin tu voz» y StoryCover del mismo borrador. Comprueba que `revisarPagina` da 0 hallazgos `tilde`. Antes del arreglo la Cta da 1 con «PRÓXIMO».
- [ ] **Step 2: Correr `npx tsx test/revision-visual.ts`** → FAIL con «PRÓXIMO».
- [ ] **Step 3: Implementar `displayLineHeight` y aplicarlo en las 9 plantillas** (estilo y estimador con el mismo valor, para que `fitDisplaySize` y `pickFill` achiquen si ya no cabe).
- [ ] **Step 4: Correr `npx tsx test/revision-visual.ts && npx tsx test/layout-bounds.ts`** → PASS. Si `layout-bounds` falla porque un texto ya no cabe, el arreglo va en la escala de la plantilla, no en el test.
- [ ] **Step 5: Commit** `plantillas: interlineado Anton con tildes (1.14) para que no pisen la línea de arriba`

### Task 3: Revisión del reel en el tiempo y arreglo de la puntuación tras SplitText

**Files:**
- Create: `src/reel/revision.ts`
- Modify: `src/reel/page.ts:172` (cada escena lleva `data-plantilla="<template.name>"`)
- Modify: `src/reel/runtime.js` (bloque `kind === "words"`, después de `new SplitText`)
- Modify: `test/revision-visual.ts`, `test/revision.ts`

**Interfaces:**
- Consumes: `inyectarRevision`, `TextoDom`, `Hallazgo`, `unicos` (Task 1); `ReelTiming` (`timing.ts`).
- Produces:
  ```ts
  /** Instantes a revisar: cada 0,1 s de 0 a total, más el estado final de cada escena (como captureStills) y la mitad de cada transición. Ordenados y sin repetir. */
  export function instantesRevision(timing: ReelTiming): number[];
  /** Agregadores puros sobre la serie de instantes. */
  export function encimes(serie: { t: number; textos: TextoDom[] }[], contexto: (escena: number) => string): Hallazgo[];
  export function numerosSolos(serie: { t: number; textos: TextoDom[] }[], contexto: (escena: number) => string, maxS?: number /* 0.4 */): Hallazgo[];
  /** Recorre la timeline con __reel.seek y junta todos los hallazgos (puntuación en cada instante; tilde y zona en los estados finales; encime y número solo con los agregadores). */
  export function revisarReel(page: Page, timing: ReelTiming): Promise<Hallazgo[]>;
  ```
  `contexto(i)` = `escena ${i + 1} (${data-plantilla})`.

- [ ] **Step 1: Tests offline de `instantesRevision`** (escena única → sin mitades de transición; incluye `total − 0,05`) y de `encimes` y `numerosSolos` con series sintéticas. Encime: opacidades 0,5/0,5 e intersección del 50 % → 1; 0,25/0,9 → 0; intersección del 5 % → 0. Número: el número a 0,9 y el heading a 0 durante 0,5 s → 1; durante 0,3 s → 0.
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar los puros** → PASS.
- [ ] **Step 4: Test de Chromium que falla:** con `buildReelPage(offline(spec), specTiming(spec, { pace: b.pace }))` del fixture de Kling (fondos `ai` a color, como en `test/reel-runtime.ts`), `revisarReel` no da hallazgos `puntuacion`. Hoy da «SEEDANCE ,» en la escena 3 y «KLING :» en la 4, mientras la palabra clave crece desde 0,9.
- [ ] **Step 5: Implementar `revisarReel`** y verificar que el test falla por la puntuación (no por otra cosa).
- [ ] **Step 6: Arreglo en `runtime.js`:** después del split, cada `.reel-word` cuyo texto es solo puntuación de cierre y cuyo `.reel-word` anterior (en orden de documento) está dentro de `[data-anim="pop"]` o `[data-mark]` pasa a ser hijo de esa palabra. Conserva su color con `style.color` = el color computado que tenía. Sale de la lista de palabras animadas, porque entra y escala con su palabra. Comentario de una línea sobre el porqué.
- [ ] **Step 7: Correr `npx tsx test/revision-visual.ts && npx tsx test/reel-runtime.ts`** → PASS.
- [ ] **Step 8: Commit** `reel: la puntuación escala con su palabra clave; revisión del reel en el tiempo`

### Task 4: Transición sin encime

**Files:**
- Modify: `src/reel/runtime.js` (bloque «Visibilidad y transición» del `scenes.forEach`)
- Modify: `test/revision-visual.ts`

**Interfaces:**
- Consumes: `revisarReel`, `encimes` (Task 3).

- [ ] **Step 1: Test que falla:** el fixture de Kling da 0 hallazgos `transicion` en `revisarReel`. Hoy falla en el paso de la escena 4 a la 5 y en las demás. Otro caso en el mismo test, por el Review Focus 2: un reel de 2 escenas con un `strike` y subtítulos (usa `carousels/_smoke-plantillas.ts`) no da hallazgos de `transicion` ni de `zona` por elementos ocultos.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar:** la escena que sale baja `autoAlpha` a 0 y `yPercent` a −6 en `T.transition / 2` (power2.in), desde `s.start + s.dur − T.transition`. La que entra hace `fromTo` de `{yPercent: 6, autoAlpha: 0}` en `T.transition / 2` (power2.out), desde `s.start + T.transition / 2`. El solape total sigue siendo `T.transition`, así que no cambian ni `timing.ts`, ni el offset de las entradas, ni el inicio de la voz.
- [ ] **Step 4: Correr `npx tsx test/revision-visual.ts && npx tsx test/reel-runtime.ts && npx tsx test/reel-capture.ts`** → PASS. Si un test de `reel-runtime` fija la opacidad del cruce anterior, detente y repórtalo.
- [ ] **Step 5: Commit** `reel: la escena sale antes de que entre la siguiente (sin textos encimados)`

### Task 5: Número de paso sin su heading

**Files:**
- Modify: `src/templates/Step.tsx` (número con `data-paso="numero"` y `data-junto=""`; `h2` con `data-paso="heading"`)
- Modify: `src/reel/runtime.js` (en el `forEach` de entradas: si `el.hasAttribute("data-junto")`, el cursor no avanza)
- Modify: `test/revision-visual.ts`

**Interfaces:**
- Consumes: `revisarReel`, `numerosSolos` (Task 3).

- [ ] **Step 1: Reproducir:** con `revisarReel` sobre el fixture de narra-sin-tu-voz, más el de Kling y `carousels/estudiar-3-ias.ts` (los tres ritmos), anota en el commit cuánto queda solo cada número. En el MP4 publicado de narra-sin-tu-voz se ven unos 0,3 s, de 10,85 a 11,1 s. Si alguno pasa de 0,4 s, reporta la causa: fallback de SplitText, compresión del presupuesto o seek.
- [ ] **Step 2: Test que falla:** en los tres casos, ningún número de paso queda a opacidad ≥ 0,8 con su heading bajo 0,2 por más de 0,15 s. Es un umbral más estricto que el de bloqueo y fija el arreglo. Con el código actual falla.
- [ ] **Step 3: Implementar `data-junto`:** el número y la primera palabra del heading entran en el mismo instante.
- [ ] **Step 4: Correr `npx tsx test/revision-visual.ts && npx tsx test/reel-runtime.ts && npx tsx test/layout-bounds.ts`** → PASS.
- [ ] **Step 5: Commit** `reel: el número de paso entra junto con su heading`

### Task 6: Zonas seguras desde las constantes

**Files:**
- Modify: `src/templates/layout.ts` (nuevo `franjaSegura`)
- Modify: `src/calendario/qa.ts:166` (`franja` usa `franjaSegura`)
- Modify: `test/layout-bounds.ts` (límite superior del reel)
- Modify: `test/calendario/qa.ts`

**Interfaces:**
- Produces: `export function franjaSegura(w: number, h: number): [number, number]`. En 9:16 (`h / w > 1.5`) devuelve `[REEL_SAFE_TOP / 1920, (1920 − REEL_SAFE_BOTTOM) / 1920]`; en 4:5, `[POST_PAD_Y / 1350, 1 − POST_PAD_Y / 1350]`. Son fracciones y valen para cualquier escala.

- [ ] **Step 1: Tests que fallan:**
  - en `test/calendario/qa.ts`: `franjaSegura(540, 960)` es `[150/1920, 1480/1920]` y `franjaSegura(1080, 1350)` es `[72/1350, 1 − 72/1350]`;
  - en `test/layout-bounds.ts`, dentro de `problems`: en reel, todo texto con `r.top < REEL_SAFE_TOP − 1` es problema `sobre el límite superior`, incluidas las marcas. La cabecera empieza en `REEL_SAFE_TOP`.
- [ ] **Step 2: Correr** → FAIL (no existe `franjaSegura`).
- [ ] **Step 3: Implementar y usar en `qa.ts`.** Borra el comentario «15-75 %» y cambia los textos de `motivosDeCuadro` para que digan los porcentajes reales.
- [ ] **Step 4: Correr `npx tsx test/calendario/qa.ts && npx tsx test/layout-bounds.ts && npx tsx test/calendario/qa-media.ts`** → PASS. Si `qa-media` fijaba 15-75 %, repórtalo.
- [ ] **Step 5: Commit** `qa: la franja segura sale de layout.ts; test de layout con límite superior del reel`

### Task 7: La revisión en el render y el aviso por pieza y motivo

**Files:**
- Modify: `src/render/renderSlide.ts` (`Renderer.revisar(contexto)` revisa la página actual tras `render`)
- Modify: `src/render/renderCarousel.ts` (`RenderCarouselOptions.revision?: ModoRevision`, por defecto `"avisar"`; revisa cada slide con contexto `slide N (<Plantilla>)` y aplica `aplicarModo` al final con todos los hallazgos)
- Modify: `src/reel/capture.ts` (`captureReel(..., opts.revision)`: revisa con `revisarReel` justo después de `openReel` y antes de capturar; con `"bloquear"` y hallazgos lanza `ErrorVisual` sin capturar)
- Modify: `src/reel/renderReel.ts` (`RenderReelOptions.revision`, se pasa a `captureReel`)
- Modify: `src/calendario/render.ts`:
  - `renderPieza` pasa `revision: "bloquear"` al carrusel, al reel y a `renderStory`;
  - nuevo `opts.omitirScore?: boolean`, solo para el corpus;
  - `procesar` trata `ErrorVisual`;
  - helper `avisosVisualesNuevos`
- Modify: `test/calendario/render.ts`

**Interfaces:**
- Consumes: `ErrorVisual`, `ModoRevision`, `aplicarModo`, `revisarPagina` (Task 1); `revisarReel` (Task 3).
- Produces:
  ```ts
  /** Registro de avisos visuales ya enviados: <outRoot>/.avisos-visuales.json = { "<semana>/<id>": string[] }. Devuelve los motivos aún no avisados y los anota. */
  export async function avisosVisualesNuevos(outRoot: string, semana: string, id: string, motivos: string[]): Promise<string[]>;
  /** Borra la entrada de la pieza (al renderizarse bien). */
  export async function olvidarAvisosVisuales(outRoot: string, semana: string, id: string): Promise<void>;
  ```
  En `procesar`, un `ErrorVisual` en `deps.render` borra `tmp` y no escribe `render.json`. Suma 1 a `res.pendientes`. Con motivos nuevos, avisa una vez: `Revisión visual: <id> (<semana>) no se sube: <motivos nuevos>. Sigue planificada; se reintenta cada hora hasta su hora.` Un render bien hecho llama a `olvidarAvisosVisuales`.

- [ ] **Step 1: Tests offline que fallan** (en `test/calendario/render.ts`, con `falsos()`):
  - Un `ErrorVisual` deja la pieza pendiente, sin escribir nada, con un aviso que menciona el id y el motivo y sin el token.
  - Una segunda corrida con el mismo motivo no avisa.
  - Una tercera con otro motivo avisa solo el nuevo.
  - Si la pieza sale bien, se borra su entrada. Una falla posterior vuelve a avisar.
  - Un `ErrorContenido` sigue como antes: queda `fallido` y no avisa.
- [ ] **Step 2: Correr `npx tsx test/calendario.ts`** → FAIL.
- [ ] **Step 3: Implementar** según las interfaces.
- [ ] **Step 4: Correr `npm run typecheck && npm test && npx tsx test/calendario/render-media.ts && npx tsx test/reel-capture.ts`** → PASS. `render-media` ahora revisa de verdad. Si sus fixtures tenían uno de los errores, eso confirma que la revisión funciona: el arreglo va en el motor, no en el fixture.
- [ ] **Step 5: Commit** `render: la revisión visual bloquea la subida y avisa una vez por pieza y motivo`

### Task 8: Script del corpus (3 semanas, sin subir nada)

**Files:**
- Create: `src/calendario/corpus-visual-cli.ts` + script `"calendario:corpus-visual": "tsx src/calendario/corpus-visual-cli.ts"`
- Modify: `src/ai/openaiImage.ts` (`CARRUSEL_AI_CACHE_DIR` cambia la carpeta de caché; con `CARRUSEL_AI_SOLO_CACHE=1`, si no está en caché lanza `ErrorSinCacheIa` sin llamar a la API)
- Modify: `src/render/background.ts` (si atrapa `ErrorSinCacheIa`, devuelve `undefined`, el fondo por defecto, y avisa por consola)
- Create: `test/calendario/corpus.ts` (offline) y súmalo a `test/calendario.ts`

**Interfaces:**
- Consumes: `renderPieza` (con `omitirScore: true`, `puerta: await leerPuerta()`, `voz: await leerVoz()`), `leerSemana`, `ErrorVisual`, `ErrorContenido`, `ErrorClipFaltante`.
- Produces:
  ```ts
  export type ResultadoCorpus = { semana: string; id: string; estado: "limpia" | "visual" | "otro"; motivos: string[] };
  export function resumirCorpus(r: ResultadoCorpus[]): { texto: string; violaciones: number };
  ```
  Uso: `npm run calendario:corpus-visual -- --kb <dir> [--semanas 2026-10-05,2026-10-12,2026-10-19] [--solo <id>]`.
  - `KB_DIR=<dir>` es de solo lectura. Por defecto apunta a la bóveda `knowledge/` de la carpeta principal.
  - Cada pieza del `plan.json` se renderiza, sin importar su hora ni su estado, en `os.tmpdir()/corpus-visual-<pid>/<semana>/<id>`.
  - No hay rsync, ni `escribirRender`, ni Telegram.
  - `CARRUSEL_AI_SOLO_CACHE=1` siempre. `CARRUSEL_AI_CACHE_DIR` por defecto apunta a `~/Documents/Claude/Carrusel-render/.cache/ai`, que se lee y no se escribe.
  - Imprime una línea por pieza y el resumen.
  - Sale con código 1 si hay al menos una violación visual.
  - En la salida, un `ErrorClipFaltante` o un error de QA o de entorno queda como `otro`: se lista aparte y no cuenta como violación.

- [ ] **Step 1: Tests que fallan:** `resumirCorpus` cuenta solo las `visual` y lista las `otro` con su motivo. `generateBackground` con `CARRUSEL_AI_SOLO_CACHE=1` y una caché vacía (carpeta temporal en `CARRUSEL_AI_CACHE_DIR`) lanza `ErrorSinCacheIa` sin crear el cliente de OpenAI: sin `OPENAI_API_KEY` en el entorno del test no debe salir un error de clave.
- [ ] **Step 2: Correr `npx tsx test/calendario.ts`** → FAIL. **Step 3: Implementar.** **Step 4: Correr** → PASS.
- [ ] **Step 5: Humo:** `npm run calendario:corpus-visual -- --kb /Users/felipevasquez/Documents/Claude/Carrusel/knowledge --solo sab-reel-narra-sin-tu-voz` termina y deja la línea de esa pieza. Corre en segundo plano si tarda más de 2 min.
- [ ] **Step 6: Commit** `calendario: script del corpus visual (re-renderiza 3 semanas sin subir nada)`

### Task 9: Corpus limpio, regla y PR

**Files:**
- Modify: `kb-plantilla/_calendario/reglas.json` (entrada nueva)
- Modify: lo que el corpus obligue a arreglar **en el motor**

- [ ] **Step 1: Correr el corpus completo en segundo plano** (las 3 semanas) y guardar la salida en `informes/2026-10-23-corpus-visual-fase1.txt`.
- [ ] **Step 2: Cada violación se resuelve en el motor** (plantillas, `runtime.js`, `fit.ts`). Un umbral solo se calibra si el hallazgo es un falso positivo demostrado. Lo que sea contenido imposible de encajar va a la lista de excepciones de la PR, con su motivo. Vuelve a correr hasta 0 violaciones.
- [ ] **Step 3: Las 5 piezas citadas, re-renderizadas sin el problema:**
  - narra-sin-tu-voz: Cta y «3»;
  - Kling: «SEEDANCE ,» y el paso a «$400 vs $1.100»;
  - 6 preguntas: es de la fase 2, aquí solo se re-renderiza.

  Extrae cuadros con ffmpeg de los MP4 del corpus en esos instantes y guárdalos en `informes/2026-10-23-corpus-visual-fase1/`.
- [ ] **Step 4: Entrada en `reglas.json`:**
  ```json
  { "id": "revision-visual-fase1", "desde": "<primer día publicado con el motor nuevo; poner al desplegar en el Mac>", "formato": null,
    "descripcion": "Revisión visual exacta en el render del Mac (tilde, puntuación, transición, número solo, zona): bloquea y avisa una vez",
    "fuente": "PR de la fase 1 de la revisión visual (docs/superpowers/specs/2026-10-23-revision-visual-design.md)" }
  ```
  `desde` queda en `"2026-10-24"` con una nota en la PR para ajustarlo al día real del despliegue. Corre `npm test`: `test/calendario/reglas.ts` valida el formato.
- [ ] **Step 5: Puerta completa:** `npm run typecheck && npm test && npm run test:reel` → 0.
- [ ] **Step 6: Commit, push de `claude/revision-visual-fase1` y PR** contra `main`. La PR lleva:
  - el resumen del corpus;
  - las excepciones;
  - los tests que cambiaron de expectativa, si hay alguno;
  - las instrucciones de despliegue en el Mac.
