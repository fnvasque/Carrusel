# Look «papel con presencia» — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar el look de todas las plantillas de marca del negro/lima al papel A3, sin cambiar las props que ya escribe el planificador.

**Architecture:** Los tokens viven en `src/theme.ts`; `Frame` pinta fondo, cabecera (serie) y pie (firma). `highlight.tsx` pasa de color a marcador y suma la frase `cursiva`. Cada plantilla cambia solo estilos. El reel cambia subtítulo, barra y la animación `pop`.

**Tech Stack:** React SSR → HTML → Playwright (Chromium ya instalado), GSAP en el runtime del reel, `node:test` vía `npm test`.

**Spec:** `docs/superpowers/specs/2026-10-29-look-papel-design.md`

## Global Constraints

- Colores: papel `#ECECEA`, tinta `#111111`, secundario `#555555`, apagado `#6B6B6B`, tarjeta `#FFFFFF`, marcador `#C6FF3D`.
- Titulares Inter 700, sin `text-transform`, `letter-spacing: -0.04em`; serif = `InstrumentSerif` (400 normal e italic, OFL, en `src/fonts/`).
- Marcador: `linear-gradient(transparent 52%, #C6FF3D 52%, #C6FF3D 92%, transparent 92%)`, `padding: 0 0.04em`.
- Firma: `Felipe Vásquez` / `FV` / `Te ayudo a partir con la IA en tu trabajo`.
- Series: `por-donde-partir` → «Por dónde partir», `lo-que-construi` → «Lo que construí».
- No se ejecuta `playwright install`; no se borra nada de `.cache/`.

## Review Focus

- Titulares largos con `cursiva` + `highlight` solapados: gana `highlight`, como hoy gana sobre `mark` (test en Task 3).
- Frase `cursiva` que no aparece en el título: el texto sale igual, sin error (test en Task 3).
- Pieza sin `serie` (piezas antiguas, `npm run generate` a mano): cabecera vacía, sin «undefined» (test en Task 2).
- `Cta` sin PARTIR (pastilla «Guárdalo»): sigue siendo pastilla, ahora tinta (test en Task 5).
- Reel con `Clip` (video oscuro) y subtítulo: la píldora se lee igual sobre video (test en Task 6).

---

### Task 1: Tokens, fuentes y medición de texto

**Files:**
- Create: `src/fonts/InstrumentSerif-400.woff2`, `src/fonts/InstrumentSerif-400-italic.woff2` (Google Fonts, OFL)
- Modify: `src/theme.ts`, `src/templates/fit.ts`, `src/templates/layout.ts` (`CHAR_EM`)
- Test: `test/smoke.ts`

**Interfaces:**
- Produces: `theme.colors.{bg,ink,text,textSoft,textMuted,card,line,accent,onAccent}` (se conservan `violet`, `pink`, `amber` y los alias de legado), `theme.fonts.{display:"Inter",serif:"InstrumentSerif",body:"Inter",mono:"JetBrainsMono"}`, `theme.firma`, `theme.marker` (el string del degradado), `SERIES: Record<string,string>` y `serieLabel(serie?: string): string | undefined` en `src/theme.ts`.
- Produces: `estimateLines`/`fitDisplaySize` en `fit.ts` estiman Inter 700 tal como se escribe (no `toUpperCase`).

- [ ] **Step 1:** En `test/smoke.ts`, el assert `/background-color:#06060A/` pasa a `/background-color:#ECECEA/` (el spec cambia el fondo de marca), y se agrega `serieLabel("por-donde-partir") === "Por dónde partir"`, `serieLabel(undefined) === undefined`.
- [ ] **Step 2:** `npm test` → falla en esos asserts.
- [ ] **Step 3:** Descargar las dos woff2, actualizar `theme.ts`. En `fit.ts`, reemplazar `antonEm` por `displayEm(ch)` medido en Chromium para Inter 700 con −0,04 em (medir con un script de una vez en el scratchpad: ancho de minúsculas, mayúsculas, espacio y signos; anotar los valores en el comentario).
- [ ] **Step 4:** `npm run typecheck && npm test` → 0 (los tests de layout que fallen por la nueva medida se revisan uno a uno; si un test asume Anton, se dice en la PR).
- [ ] **Step 5:** Commit `plantillas: tokens del look papel, Instrument Serif y medida de Inter 700`.

### Task 2: Frame — papel, serie y firma

**Files:**
- Modify: `src/templates/Frame.tsx`, `src/templates/types.ts` (`serie?: string` en `BaseSlideProps`), `src/calendario/draft.ts` (pasa `serie` de la pieza a `defaults` y a `storySpec`), `src/calendario/plan.ts` solo si hace falta exponer `serie` a `draft`
- Test: `test/smoke.ts`, `test/calendario.ts`

**Interfaces:**
- Consumes: `serieLabel`, `theme.firma`.
- Produces: `Frame` acepta `serie`; marca `data-brand="serie"`, `data-brand="firma"`, `data-brand="pagina"`. Se quitan `data-grid` y la viñeta; `data-brand="logo"` desaparece (y con él el efecto de `logoEnCuadro0`, que queda como prop sin uso documentada así).

- [ ] **Step 1:** Tests: markup de `Step` con `serie: "por-donde-partir", index: 2, total: 6` contiene «Por dónde partir», «Felipe Vásquez» y `2/6`; sin `serie` no contiene `data-brand="serie"` ni «undefined»; `format: "reel"` lleva la firma en la cabecera y no en el pie. En `test/calendario.ts`: un borrador con pieza `serie: "lo-que-construi"` produce un spec cuyo `defaults.serie` es `lo-que-construi`.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar. Post: pie con firma a la izquierda (círculo 84 px tinta, iniciales serif cursiva 44 px lima; nombre Inter 700 32 px) y `n/total` serif cursiva 56 px a la derecha; reserva de alto del pie en `layout.ts` (`firmaReserve(format)`), sumada a `sourceReserve`. Reel: firma compacta (círculo 56 px + nombre 28 px) en la cabecera derecha; nada en el pie.
- [ ] **Step 4:** `npm run typecheck && npm test` → 0.
- [ ] **Step 5:** Commit `plantillas: Frame papel con serie en la cabecera y firma`.

### Task 3: Marcador y frase en cursiva

**Files:**
- Modify: `src/templates/highlight.tsx`, `src/reel/runtime.js` (animación `pop`)
- Test: `test/smoke.ts`, `test/reel-runtime.ts`

**Interfaces:**
- Produces: `highlightText(text, highlight, color, mark?, markColor?, cursiva?: string)`; el rango `pop` pinta `background-image: theme.marker` con `background-size: 100% 100%` y conserva `data-anim="pop"`; el rango `cursiva` es `<span data-cursiva style="font-family:InstrumentSerif;font-style:italic;font-weight:400;font-size:1.13em;letter-spacing:-0.01em">`. Solape: `highlight` > `mark` > `cursiva`.
- Produces (runtime): el `pop` anima `backgroundSize` de `0% 100%` a `100% 100%` (mismo instante y duración que hoy); `dataset.accent` guarda el degradado.

- [ ] **Step 1:** Tests: `highlightText("Que tu equipo no piense", "piense", …, undefined, undefined, "Que tu equipo")` → markup con `data-cursiva` alrededor de «Que tu equipo» y el marcador en «piense»; `cursiva` inexistente → texto intacto; `cursiva` solapada con `highlight` → solo marcador. En `reel-runtime.ts`, el `pop` termina con `background-size` `100% 100%`.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar; en `fit.ts`, el rango `cursiva` se estima con el ancho de Inter (conservador: la serif es más angosta).
- [ ] **Step 4:** `npm run typecheck && npm test` → 0.
- [ ] **Step 5:** Commit `plantillas: marcador lima y frase en serif cursiva`.

### Task 4: Plantillas de contenido

**Files:**
- Modify: `src/templates/{Hook,Lead,Step,Stat,MythReality,Prompt,Screen,ui}.tsx`
- Test: `test/layout-bounds.ts`, `test/revision-visual.ts` (fixtures de fondo `#06060A` → sin fondo)

**Interfaces:**
- Consumes: Task 1–3. Hook, Step, Lead y Cta aceptan `cursiva?: string` y la pasan a `highlightText`.

Reglas por plantilla:
- **Hook:** titular Inter 700 hasta 124 px (post) con `cursiva`; `subtitle` Inter 400 40 px `#555`; tarjeta de respuesta (si la hay) blanca. En el post, el pie lleva además la línea de la firma.
- **Step:** número en cuadro lima 110×110 radio 28 con la cifra en serif cursiva 92 px; `heading` Inter 700 hasta 84 px; `body` 44 px; cita/ejemplo con borde izquierdo lima 6 px (no tarjeta).
- **Lead:** Inter 700, ya no Inter 600 en otro tamaño fuera de escala.
- **Stat:** valor Inter 800 tinta con marcador; `label` Inter 700; `context` 44 px.
- **MythReality:** sin tachado; «Lo que se cree» en serif cursiva `#6B6B6B` con ícono ✕ gris; «Lo que pasa» Inter 700 tinta con marcador en el `highlight`.
- **Prompt:** tarjeta blanca, mono tinta 36 px; etiqueta «Copia esto» Inter 700 24 px.
- **Screen:** burbujas según el spec; etiqueta «Tú» lima sobre tinta, «La IA» `#6B6B6B`; el `caret` del reel en tinta.

- [ ] **Step 1:** Cambiar los fixtures de fondo en los tests y correr `test/layout-bounds.ts` y `test/revision-visual.ts` como red: deben seguir en verde con el look nuevo (miden desborde y márgenes, no colores).
- [ ] **Step 2:** Migrar plantilla por plantilla, corriendo `npm test` tras cada una.
- [ ] **Step 3:** Render de `carousels/_smoke-plantillas.ts` en post y reel; mirar los PNG (todas las plantillas) y corregir lo que se vea mal.
- [ ] **Step 4:** `npm run typecheck && npm test` → 0.
- [ ] **Step 5:** Commit `plantillas: Hook, Step, Lead, Stat, Mito, Prompt y Screen en papel`.

### Task 5: Cierre PARTIR y story

**Files:**
- Modify: `src/templates/Cta.tsx`, `src/templates/StoryCover.tsx`
- Test: `test/smoke.ts`

**Interfaces:**
- Produces: `Cta` detecta `/\bPARTIR\b/` en `cta` o en `title` → caja de DM (`data-cta="dm"`): fondo blanco radio 40, cabecera con círculo FV 60 px + nombre, burbuja tinta «PARTIR» Inter 700 46 px tracking 0,04 em a la derecha, pista = `reason` (o «Escríbeme esto por mensaje y te respondo yo.»). Sin PARTIR: pastilla tinta con texto blanco (ícono como hoy).
- `StoryCover`: papel, titular con marcador, pastilla «Nuevo en el feed ↑» tinta, firma con línea.

- [ ] **Step 1:** Tests: `Cta` con `cta: "Escríbeme PARTIR"` contiene `data-cta="dm"` y «PARTIR» una vez dentro de la burbuja; `Cta` con `cta: "Guárdalo 🔖"` no contiene `data-cta="dm"`.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm run typecheck && npm test` → 0.
- [ ] **Step 5:** Commit `plantillas: cierre PARTIR como mensaje directo y story papel`.

### Task 6: Reel y fondos IA

**Files:**
- Modify: `src/reel/page.ts` (subtítulo y barra), `src/templates/Clip.tsx`, `src/render/background.ts` (estilo de marca del prompt), `src/ai/analyze.ts` (texto de marca del remix)
- Test: `test/reel-capture.ts` o `test/smoke.ts`, `test/calendario/qa.ts`

- [ ] **Step 1:** Tests: `subtitulo("hola")` lleva `background:rgba(17,17,17,0.88)` y `color:#FFFFFF` sin `text-shadow`; la barra lleva `background:#111111`; `applyBrandStyle("x")` menciona «light warm grey paper». Revisar que `qa.ts` (pantalla negra) no marque el papel liso: agregar caso «papel #ECECEA liso no es pantalla negra».
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar. La clave de caché de `.cache/ai/` cambia con el prompt: está bien (no se borra nada; se generan nuevos solo si una pieza pide fondo IA).
- [ ] **Step 4:** `npm run typecheck && npm test && npm run test:reel` → 0.
- [ ] **Step 5:** Commit `reel: subtítulo en píldora, barra tinta y fondos IA en papel`.

### Task 7: Docs, regla y prueba con pieza real

**Files:**
- Modify: `README.md` (sección Marca), `kb-plantilla/_calendario/INSTRUCCIONES.md` (prop `cursiva`: 2–4 palabras del inicio del titular, opcional; `serie` la pone el motor), `kb-plantilla/_calendario/reglas.json`
- Test: `test/calendario/validar.ts` si valida props conocidas

- [ ] **Step 1:** Agregar a `reglas.json`: `{"id":"look-papel","desde":"2026-11-02","formato":null,"descripcion":"Look papel con presencia (A3): fondo claro, Inter + serif cursiva, marcador lima, serie en la cabecera, firma y cierre PARTIR como mensaje directo","fuente":"auditoría de plantillas 2026-10-29; spec docs/superpowers/specs/2026-10-29-look-papel-design.md"}`.
- [ ] **Step 2:** Si `validar.mjs` rechaza props desconocidas, aceptar `cursiva` (test primero).
- [ ] **Step 3:** Re-renderizar `mar-carrusel-tu-correo-en-tres-lineas` y `lun-reel-pide-que-revise-sus-cifras` desde sus borradores a una carpeta del scratchpad (no a `output/` del Mac) y revisar PNG y fotogramas.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run test:reel` → 0.
- [ ] **Step 5:** Commit `docs: look papel en README, instrucciones y reglas.json`, push de la rama y PR.
