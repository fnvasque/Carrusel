# Reels animados — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el reel de slides estáticos por un reel animado con GSAP, generado desde el mismo `carousels/*.ts`.

**Architecture:** Las plantillas React marcan elementos con `data-anim`. `page.ts` arma una sola página HTML con todas las escenas, GSAP inline y un runtime que construye una timeline maestra pausada (`window.__reel.seek(t)`). `capture.ts` avanza la timeline cuadro a cuadro con Playwright y envía los PNG por stdin a ffmpeg.

**Tech Stack:** TypeScript (tsx, ESM), React 18 SSR (`renderToStaticMarkup`), Playwright (Chromium), GSAP 3.15 + SplitText, ffmpeg (libx264).

**Spec:** `docs/superpowers/specs/2026-10-04-reels-animados-design.md`

## Global Constraints

- Salida: 1080×1920, 30 fps, h264, `yuv420p`, `-movflags +faststart`.
- Transición por defecto `0.35` s (empuje vertical, `yPercent` ±6). El flag CLI existente `--fade=N` fija esa duración.
- Segundos por escena: `clamp(1.8 + chars/26, 2.4, 4.8)` + 0.7 en primera y última; `--seconds=N` la fija.
- Presupuesto de entrada por escena: `min(0.4 × dur, 1.6)` s.
- Easing permitido: solo `power*.out`, `power*.in`, `none`. Prohibidos `back`, `elastic`, `bounce`.
- Logo, chip de pilar, progreso y fuente al pie NO se animan.
- Los PNG del carrusel (formato `post`) deben salir idénticos byte a byte a los de antes.
- GSAP se inyecta inline desde `node_modules/gsap/dist` (sin CDN, render offline).
- Mensajes al usuario y comentarios en español, con el estilo del código vecino.
- `npm run typecheck` y `npm test` deben pasar al final de cada tarea.

## Review Focus

1. Carrusel de 1 solo slide → reel sin transiciones, sin error (test en Task 1 y Task 3).
2. `--fade` ≥ duración de alguna escena (p. ej. `--seconds=0.5`) → error claro en español, no un video roto (test en Task 1).
3. `highlight` ausente o que no aparece en el título → el título se anima igual y no hay `pop` (test en Task 2).
4. Texto con emoji o acentos (`📩 Link en bio`, "cambió") → SplitText no rompe glifos ni el layout (verificación en Task 3 con `_smoke-plantillas`).
5. ffmpeg ausente o que falla a mitad → mensaje claro y sin `reel.mp4` parcial (Task 4).

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/reel/timing.ts` | Crear | Matemática pura de tiempos |
| `src/templates/Frame.tsx` | Modificar | Capa de fondo separada con `data-anim="bg"` solo en formato reel |
| `src/templates/highlight.tsx` | Modificar | `data-anim="pop"` en la palabra clave |
| `src/templates/{Hook,Lead,Step,Prompt,MythReality,Cta}.tsx` | Modificar | Marcas `data-anim`; línea `strike` en MythReality solo en reel |
| `src/reel/runtime.js` | Crear | Runtime de navegador: timeline maestra |
| `src/reel/page.ts` | Crear | HTML de una página con escenas + GSAP + runtime + tiempos |
| `src/render/renderSlide.ts` | Modificar | Exportar `findChromium` |
| `src/reel/capture.ts` | Crear | Playwright → ffmpeg |
| `src/reel/renderReel.ts` | Reescribir | Orquestación con la misma firma |
| `src/reel/cli.ts` | Modificar | `--fade` → transición (default 0.35) |
| `src/reel/video.ts` | Eliminar | Reemplazado |
| `test/smoke.ts` | Modificar | Tests de timing, marcas y page |
| `test/reel-runtime.ts` | Crear | Test del runtime en Chromium |
| `package.json` | Modificar | dependencia `gsap`, script `test:reel` |

---

### Task 1: Tiempos puros (`timing.ts`)

**Files:**
- Create: `src/reel/timing.ts`
- Modify: `test/smoke.ts` (agregar checks al final, antes del resumen)

**Interfaces:**
- Produces:
  - `export const FPS = 30`
  - `export const DEFAULT_TRANSITION = 0.35`
  - `export function sceneSeconds(props: Record<string, unknown>, hold: boolean): number`
  - `export function specDurations(spec: CarouselSpec, seconds?: number): number[]`
  - `export function entranceBudget(dur: number): number`
  - `export function entranceScale(natural: number, budget: number): number`
  - `export interface SceneTiming { start: number; dur: number; budget: number }`
  - `export interface ReelTiming { fps: number; transition: number; total: number; frames: number; scenes: SceneTiming[] }`
  - `export function reelTiming(durations: number[], transition?: number, fps?: number): ReelTiming`

- [ ] **Step 1: Escribir los tests que fallan**

En `test/smoke.ts`, agregar el import arriba:

```ts
import { sceneSeconds, specDurations, entranceBudget, entranceScale, reelTiming, FPS, DEFAULT_TRANSITION } from "../src/reel/timing.ts";
```

Y estos checks junto a los demás (antes del bloque que imprime el resumen `ok, fallos`):

```ts
check("sceneSeconds: más texto → más tiempo, con tope y piso", () => {
  assert.equal(sceneSeconds({ title: "Hola" }, false), 2.4);
  assert.equal(sceneSeconds({ body: "x".repeat(500) }, false), 4.8);
  assert.equal(sceneSeconds({ title: "Hola" }, true), 3.1);
  assert.equal(sceneSeconds({ bullets: ["a".repeat(26), "b".repeat(26)] }, false), 3.82);
});

check("specDurations: hold en primera y última; --seconds fija todas", () => {
  const T = () => null;
  const spec = { name: "x", slides: [{ template: T, props: { title: "A" } }, { template: T, props: { title: "B" } }, { template: T, props: { title: "C" } }] };
  assert.deepEqual(specDurations(spec as any), [3.1, 2.4, 3.1]);
  assert.deepEqual(specDurations(spec as any, 2), [2, 2, 2]);
});

check("reelTiming: escenas solapadas por la transición", () => {
  const t = reelTiming([3, 2.5, 4], 0.35);
  assert.deepEqual(t.scenes.map((s) => s.start), [0, 2.65, 4.8]);
  assert.equal(t.total, 8.8);
  assert.equal(t.frames, 264);
  assert.equal(t.fps, FPS);
  assert.equal(t.transition, 0.35);
});

check("reelTiming: 1 sola escena, sin transición", () => {
  const t = reelTiming([3.1]);
  assert.equal(t.total, 3.1);
  assert.equal(t.frames, 93);
  assert.equal(t.scenes[0].start, 0);
  assert.equal(DEFAULT_TRANSITION, 0.35);
});

check("reelTiming: transición demasiado larga → error claro", () => {
  assert.throws(() => reelTiming([0.5, 0.5], 0.35), /transición/);
  assert.throws(() => reelTiming([]), /escena/);
});

check("entranceBudget/entranceScale: comprime solo si hace falta", () => {
  assert.equal(entranceBudget(3), 1.2);
  assert.equal(entranceBudget(10), 1.6);
  assert.equal(entranceScale(1.0, 1.2), 1);
  assert.equal(entranceScale(2.4, 1.2), 2);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test`
Expected: falla al importar `../src/reel/timing.ts` (módulo no existe).

- [ ] **Step 3: Implementar `src/reel/timing.ts`**

```ts
import type { CarouselSpec } from "../templates/types.ts";

/**
 * Matemática de tiempos del reel animado, en funciones puras: cuánto dura cada
 * escena según su texto, dónde empieza cada una (se solapan durante la
 * transición), duración total, cuadros y presupuesto de las entradas.
 */

/** Cuadros por segundo de salida. */
export const FPS = 30;
/** Duración (s) del empuje vertical entre escenas. */
export const DEFAULT_TRANSITION = 0.35;

const TEXT_KEYS = ["title", "subtitle", "eyebrow", "heading", "body", "bullets", "text", "kicker", "quote", "reality", "myth", "reason", "note"];

/** Segundos que se muestra una escena, según cuánto texto tiene (legibilidad). */
export function sceneSeconds(props: Record<string, unknown>, hold: boolean): number {
  let chars = 0;
  for (const k of TEXT_KEYS) {
    const v = props[k];
    if (typeof v === "string") chars += v.length;
    else if (Array.isArray(v)) chars += v.filter((x) => typeof x === "string").join(" ").length;
  }
  const s = Math.min(4.8, Math.max(2.4, 1.8 + chars / 26));
  return +(s + (hold ? 0.7 : 0)).toFixed(2);
}

/** Duración de cada escena del carrusel; `seconds` la fija para todas. */
export function specDurations(spec: CarouselSpec, seconds?: number): number[] {
  const last = spec.slides.length - 1;
  return spec.slides.map((slide, i) => {
    const props = { ...spec.defaults, ...slide.props } as Record<string, unknown>;
    return seconds ?? sceneSeconds(props, i === 0 || i === last);
  });
}

/** Tiempo máximo (s) que pueden ocupar las entradas de una escena. */
export function entranceBudget(dur: number): number {
  return +Math.min(0.4 * dur, 1.6).toFixed(3);
}

/** timeScale a aplicar a las entradas: >1 solo si no caben en el presupuesto. */
export function entranceScale(natural: number, budget: number): number {
  return natural > budget ? natural / budget : 1;
}

export interface SceneTiming {
  /** Segundo en que empieza la escena (incluye su transición de entrada). */
  start: number;
  /** Duración de la escena (s). */
  dur: number;
  /** Presupuesto (s) para sus entradas. */
  budget: number;
}

export interface ReelTiming {
  fps: number;
  transition: number;
  total: number;
  frames: number;
  scenes: SceneTiming[];
}

/**
 * Tiempos del reel: la escena i empieza en Σ dur[j<i] − i·transition, de modo
 * que cada par consecutivo se solapa `transition` segundos.
 */
export function reelTiming(durations: number[], transition = DEFAULT_TRANSITION, fps = FPS): ReelTiming {
  if (durations.length === 0) throw new Error("El reel necesita al menos una escena.");
  if (durations.length > 1 && transition * 2 >= Math.min(...durations)) {
    throw new Error(
      `La transición (${transition}s) es demasiado larga para escenas de ${Math.min(...durations)}s: debe durar menos de la mitad de la escena más corta.`,
    );
  }
  let cursor = 0;
  const scenes = durations.map((dur) => {
    const scene = { start: +cursor.toFixed(3), dur, budget: entranceBudget(dur) };
    cursor += dur - transition;
    return scene;
  });
  const sum = durations.reduce((a, b) => a + b, 0);
  const total = +(sum - (durations.length - 1) * transition).toFixed(3);
  return { fps, transition, total, frames: Math.round(total * fps), scenes };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm test && npm run typecheck`
Expected: todos los checks ✓, `0 fallos`, typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/reel/timing.ts test/smoke.ts
git commit -m "reel: tiempos puros del reel animado (timing.ts)"
```

---

### Task 2: Marcas `data-anim` en las plantillas

**Files:**
- Modify: `src/templates/Frame.tsx`, `src/templates/highlight.tsx`, `src/templates/Hook.tsx`, `src/templates/Lead.tsx`, `src/templates/Step.tsx`, `src/templates/Prompt.tsx`, `src/templates/MythReality.tsx`, `src/templates/Cta.tsx`
- Modify: `test/smoke.ts`

**Interfaces:**
- Produces (contrato con el runtime de Task 3): atributos `data-anim` con valores `bg | words | pop | rise | stagger | type | strike`.
  - `bg`: solo en formato `reel`, en una capa absoluta (`inset: 0`) que pinta el fondo; el overlay queda encima de esa capa.
  - `pop`: el `<span>` de la palabra clave que devuelve `highlightText`.
  - `strike`: solo en formato `reel`, un `<div>` absoluto que cruza el texto del mito.

**Reglas de marcado (exactas):**

| Plantilla | Elemento | Marca |
|---|---|---|
| Hook | eyebrow `<span>` | `rise` |
| Hook | `<h1>` | `words` |
| Hook | subtitle `<p>` | `rise` |
| Lead | barra cian (`div` 96×4) | `rise` |
| Lead | kicker | `rise` |
| Lead | `<p>` texto | `words` |
| Step | número `step` | `rise` |
| Step | `<h2>` | `words` |
| Step | body `<p>` | `rise` |
| Step | `<ul>` | `stagger` |
| Prompt | `<h2>` | `words` |
| Prompt | etiqueta "Copia este prompt" | `rise` |
| Prompt | panel del prompt | `type` |
| Prompt | note | `rise` |
| MythReality | cada `Panel` (div raíz) | `rise` |
| MythReality | línea sobre el texto del mito (solo reel) | `strike` |
| Cta | `<h2>` | `words` |
| Cta | reason, pastilla, handle | `rise` |

- [ ] **Step 0: Línea base de PNG del carrusel (antes de tocar nada)**

```bash
npm run generate carousels/_smoke-plantillas.ts
rm -rf .baseline-smoke && cp -R output/_smoke-plantillas .baseline-smoke
```

(`.baseline-smoke/` es temporal: bórralo al final de la tarea, no se commitea.)

- [ ] **Step 1: Escribir los tests que fallan**

Agregar imports en `test/smoke.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Hook, Lead, Step, MythReality, Cta } from "../src/templates/index.ts";
```

Checks:

```ts
check("plantillas: marcas data-anim en formato reel", () => {
  const hook = renderToStaticMarkup(createElement(Hook, { title: "La IA cambió todo", highlight: "cambió", eyebrow: "Ojo", subtitle: "Sub", format: "reel", background: { color: "#000" } }));
  assert.match(hook, /<h1[^>]*data-anim="words"/);
  assert.match(hook, /data-anim="pop"[^>]*>cambió</);
  assert.match(hook, /data-anim="bg"/);
  assert.equal((hook.match(/data-anim="rise"/g) ?? []).length, 2);
  const step = renderToStaticMarkup(createElement(Step, { heading: "Paso", bullets: ["a", "b"], format: "reel" }));
  assert.match(step, /<ul[^>]*data-anim="stagger"/);
  const myth = renderToStaticMarkup(createElement(MythReality, { myth: "M", reality: "R", format: "reel" }));
  assert.match(myth, /data-anim="strike"/);
});

check("plantillas: sin highlight (o no encontrado) no hay pop", () => {
  const a = renderToStaticMarkup(createElement(Cta, { title: "Suscríbete", format: "reel" }));
  const b = renderToStaticMarkup(createElement(Lead, { text: "Una frase", highlight: "nada", format: "reel" }));
  assert.doesNotMatch(a, /data-anim="pop"/);
  assert.doesNotMatch(b, /data-anim="pop"/);
  assert.match(b, /data-anim="words"/);
});

check("plantillas: formato post sin capa bg ni strike", () => {
  const hook = renderToStaticMarkup(createElement(Hook, { title: "T", background: { color: "#000" } }));
  const myth = renderToStaticMarkup(createElement(MythReality, { myth: "M", reality: "R" }));
  assert.doesNotMatch(hook, /data-anim="bg"/);
  assert.doesNotMatch(myth, /data-anim="strike"/);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test`
Expected: los 3 checks nuevos fallan (✗).

- [ ] **Step 3: `highlight.tsx`**

Cambiar el span resaltado a:

```tsx
<span data-anim="pop" style={{ color }}>{match}</span>
```

- [ ] **Step 4: `Frame.tsx` — capa de fondo en reel**

Cuando `format === "reel"`, el fondo se pinta en una capa absoluta animable en vez del div raíz; en `post` todo queda exactamente igual. En el `style` del div raíz reemplazar `...backgroundStyle(background),` por:

```tsx
...(format === "reel" ? {} : backgroundStyle(background)),
```

e inmediatamente antes de `{overlayLayer(background)}` agregar:

```tsx
{format === "reel" && background && (
  <div data-anim="bg" style={{ position: "absolute", inset: 0, ...backgroundStyle(background) }} />
)}
```

- [ ] **Step 5: Marcar las plantillas**

Agregar el atributo `data-anim="…"` a cada elemento de la tabla de reglas (React lo emite tal cual). Ejemplo Hook:

```tsx
{eyebrow && (<span data-anim="rise" style={{ /* igual */ }}>{eyebrow}</span>)}
<h1 data-anim="words" style={{ /* igual */ }}>{highlightText(title, highlight, cyan)}</h1>
{subtitle && (<p data-anim="rise" style={{ /* igual */ }}>{subtitle}</p>)}
```

MythReality: el componente recibe `format` dentro de `...base`; extraerlo y pasarlo a `Frame` y al `Panel` del mito:

```tsx
export function MythReality({ myth, reality, mythLabel = "El mito", realityLabel = "La realidad", format, ...base }: MythRealityProps) {
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 32 }}>
        <Panel label={mythLabel} labelColor={theme.colors.textMuted} text={myth} textColor={theme.colors.textMuted} strike={format === "reel"} />
        <Panel label={realityLabel} labelColor={theme.colors.green} text={reality} textColor={theme.colors.text} />
      </div>
    </Frame>
  );
}
```

En `Panel`, agregar prop `strike?: boolean`, `data-anim="rise"` en el div raíz, y envolver el `<p>` así:

```tsx
<div style={{ position: "relative" }}>
  <p style={{ /* igual */ }}>{text}</p>
  {strike && (
    <div
      data-anim="strike"
      style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 8, marginTop: -4, backgroundColor: theme.colors.textMuted, transformOrigin: "left center" }}
    />
  )}
</div>
```

Nota: el wrapper `position: relative` cambia el DOM también en post. Para que el post quede idéntico, renderizar el wrapper solo cuando `strike` es true:

```tsx
{strike ? (<div style={{ position: "relative" }}>{p}{line}</div>) : p}
```

- [ ] **Step 6: Correr tests y comparar PNG**

```bash
npm test && npm run typecheck
npm run generate carousels/_smoke-plantillas.ts
for f in ./.baseline-smoke/*.png; do cmp "$f" "output/_smoke-plantillas/$(basename "$f")" || echo "DIFERENTE: $f"; done
```

Expected: tests ✓; ningún "DIFERENTE". Si algún PNG difiere, la marca alteró el layout del post: corregir (las marcas deben ser solo atributos en post).

- [ ] **Step 7: Commit**

```bash
git add src/templates test/smoke.ts
git commit -m "templates: marcas data-anim para el reel animado (post intacto)"
```

---

### Task 3: Página del reel + runtime GSAP

**Files:**
- Modify: `package.json` (dep `gsap`, script `test:reel`)
- Create: `src/reel/runtime.js`, `src/reel/page.ts`, `test/reel-runtime.ts`
- Modify: `test/smoke.ts`

**Interfaces:**
- Consumes: `reelTiming`, `specDurations`, `ReelTiming` (Task 1); marcas `data-anim` (Task 2); `htmlShell(markup: string): Promise<string>` de `src/render/htmlShell.ts`; `resolveBackground` de `src/render/background.ts`.
- Produces:
  - `export async function buildReelPage(spec: CarouselSpec, timing: ReelTiming): Promise<string>` — los fondos ya deben venir resueltos (sin `ai`); la resolución la hace el llamador.
  - En la página: `window.__REEL_TIMING__: ReelTiming`, `window.__reel = { duration: number, seek(t: number): void }`, y `window.__reelErrors: string[]`.

- [ ] **Step 1: Instalar GSAP**

```bash
npm install gsap@^3.15.0
ls node_modules/gsap/dist/gsap.min.js node_modules/gsap/dist/SplitText.min.js
```

Expected: ambos archivos existen.

- [ ] **Step 2: Test que falla (HTML de la página)**

En `test/smoke.ts`:

```ts
import { buildReelPage } from "../src/reel/page.ts";
```

```ts
await checkAsync("buildReelPage: una escena por slide, GSAP y tiempos inline", async () => {
  const spec = {
    name: "t",
    slides: [
      { template: Hook, props: { title: "Hola mundo", highlight: "mundo" } },
      { template: Cta, props: { title: "Chao" } },
    ],
  };
  const timing = reelTiming([3, 3]);
  const html = await buildReelPage(spec as any, timing);
  assert.equal((html.match(/data-scene="/g) ?? []).length, 2);
  assert.match(html, /window\.__REEL_TIMING__\s*=\s*\{/);
  assert.match(html, /SplitText/);
  assert.match(html, /__reel\s*=/);
  assert.match(html, /data-anim="pop"/);
});
```

Si `test/smoke.ts` no tiene `checkAsync`, agregarlo junto a `check` (mismo contador; los checks async se esperan con `await` en el top-level, el archivo es ESM):

```ts
async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log("✓", name);
  } catch (e) {
    failed++;
    console.error("✗", name, "—", e instanceof Error ? e.message : e);
  }
}
```

Run: `npm test` → Expected: falla (no existe `page.ts`).

- [ ] **Step 3: `src/reel/runtime.js`**

JS plano para el navegador (no se compila; `page.ts` lo lee como texto). Requiere `gsap` y `SplitText` globales.

```js
/* Runtime del reel animado: lee window.__REEL_TIMING__ y las marcas data-anim,
 * arma una timeline maestra pausada y expone window.__reel = { duration, seek }.
 * Sin rebotes: solo easings power*.out / none. */
window.__reelErrors = [];
document.fonts.ready.then(function () {
  try {
    gsap.registerPlugin(SplitText);
    const T = window.__REEL_TIMING__;
    const scenes = Array.from(document.querySelectorAll("[data-scene]"));
    const master = gsap.timeline({ paused: true });
    const OVERLAP = 0.6; // el siguiente elemento entra al 60% del anterior

    function entrance(el, sub, at) {
      const kind = el.getAttribute("data-anim");
      if (kind === "rise") {
        sub.from(el, { y: 40, autoAlpha: 0, duration: 0.45, ease: "power3.out" }, at);
        return 0.45;
      }
      if (kind === "stagger") {
        const kids = Array.from(el.children);
        sub.from(kids, { y: 40, autoAlpha: 0, duration: 0.45, ease: "power3.out", stagger: 0.12 }, at);
        return 0.45 + 0.12 * Math.max(0, kids.length - 1);
      }
      if (kind === "words") {
        const split = new SplitText(el, { type: "words", wordsClass: "reel-word" });
        const words = split.words;
        sub.from(words, { yPercent: 60, autoAlpha: 0, duration: 0.45, ease: "power4.out", stagger: 0.06 }, at);
        let len = 0.45 + 0.06 * Math.max(0, words.length - 1);
        const pop = el.querySelector('[data-anim="pop"]');
        if (pop) {
          pop.dataset.accent = pop.style.color; // acento original, para tests
          const parentColor = getComputedStyle(el).color;
          sub.from(pop, { scale: 0.9, color: parentColor, duration: 0.3, ease: "power2.out", transformOrigin: "50% 60%" }, at + len);
          len += 0.3;
        }
        return len;
      }
      if (kind === "type") {
        const split = new SplitText(el, { type: "chars" });
        const chars = split.chars;
        const total = Math.min(1.5, 0.03 * chars.length);
        sub.from(chars, { autoAlpha: 0, duration: 0.01, ease: "none", stagger: chars.length > 1 ? total / (chars.length - 1) : 0 }, at);
        return total;
      }
      if (kind === "strike") {
        sub.from(el, { scaleX: 0, duration: 0.4, ease: "power2.out" }, at);
        return 0.4;
      }
      console.warn("data-anim desconocido: " + kind);
      return 0;
    }

    scenes.forEach(function (scene, i) {
      const s = T.scenes[i];
      const last = i === scenes.length - 1;
      // Visibilidad y transición de entrada/salida (empuje vertical).
      if (i === 0) {
        gsap.set(scene, { autoAlpha: 1 });
      } else {
        gsap.set(scene, { autoAlpha: 0 });
        master.fromTo(scene, { yPercent: 6, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: T.transition, ease: "power2.out", immediateRender: false }, s.start);
      }
      if (!last) {
        master.to(scene, { yPercent: -6, autoAlpha: 0, duration: T.transition, ease: "power2.in" }, s.start + s.dur - T.transition);
      }
      // Fondo: zoom lento durante toda la escena.
      const bg = scene.querySelector('[data-anim="bg"]');
      if (bg) master.fromTo(bg, { scale: 1.06 }, { scale: 1, duration: s.dur, ease: "none" }, s.start);
      // Entradas en orden de documento (bg y pop se manejan aparte; strike va
      // anidado dentro de un rise y se encadena igual).
      const sub = gsap.timeline();
      let cursor = 0;
      scene.querySelectorAll("[data-anim]").forEach(function (el) {
        const kind = el.getAttribute("data-anim");
        if (kind === "bg" || kind === "pop") return;
        const len = entrance(el, sub, cursor);
        cursor += len * OVERLAP;
      });
      const natural = sub.duration();
      if (natural > 0) {
        if (natural > s.budget) sub.timeScale(natural / s.budget);
        master.add(sub, i === 0 ? 0 : s.start + T.transition / 2);
      }
    });

    // Fija la duración exacta del reel aunque la última tween termine antes.
    master.set({}, {}, T.total);
    master.seek(0, false);
    window.__reel = {
      duration: master.duration(),
      seek: function (t) { master.seek(t, false); },
    };
  } catch (e) {
    window.__reelErrors.push(String(e && e.stack ? e.stack : e));
  }
  window.__reelReady = true;
});
```

Nota para el implementador: `master.set({}, {}, T.total)` hace que `master.duration() === T.total`. Si alguna tween se extiende más allá de `T.total` (p. ej. entradas tardías en la última escena), `duration()` será mayor y el chequeo de `capture.ts` lo detectará; en ese caso la causa está en el presupuesto, no en ajustar el chequeo.

- [ ] **Step 4: `src/reel/page.ts`**

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlShell } from "../render/htmlShell.ts";
import { FORMATS, type CarouselSpec } from "../templates/types.ts";
import type { ReelTiming } from "./timing.ts";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

/** Lee un archivo de gsap/dist como texto para inyectarlo inline (render offline). */
async function gsapScript(file: string): Promise<string> {
  const dist = dirname(require.resolve("gsap/dist/gsap.min.js"));
  return readFile(join(dist, file), "utf8");
}

/**
 * Arma la página única del reel: todas las escenas apiladas (una por slide, en
 * formato reel), GSAP + SplitText inline, los tiempos y el runtime que expone
 * `window.__reel`. Los fondos `ai` deben venir ya resueltos.
 */
export async function buildReelPage(spec: CarouselSpec, timing: ReelTiming): Promise<string> {
  const { width, height } = FORMATS.reel;
  const scenes = spec.slides
    .map((slide, i) => {
      const props = { ...spec.defaults, ...slide.props, format: "reel" as const };
      const markup = renderToStaticMarkup(createElement(slide.template, props));
      return `<div data-scene="${i}" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;overflow:hidden;">${markup}</div>`;
    })
    .join("");
  const [gsap, split, runtime] = await Promise.all([
    gsapScript("gsap.min.js"),
    gsapScript("SplitText.min.js"),
    readFile(join(HERE, "runtime.js"), "utf8"),
  ]);
  const body =
    `<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#000;">${scenes}</div>` +
    `<script>${gsap}</script><script>${split}</script>` +
    `<script>window.__REEL_TIMING__ = ${JSON.stringify(timing)};</script>` +
    `<script>${runtime}</script>`;
  return htmlShell(body);
}
```

Nota: el runtime arranca en `document.fonts.ready` para que SplitText mida con las fuentes finales, y marca `window.__reelReady = true` al terminar (también si falla). `capture.ts` y el test esperan `__reelReady`.

- [ ] **Step 5: Correr el test de HTML**

Run: `npm test && npm run typecheck`
Expected: ✓ en el check de `buildReelPage`.

- [ ] **Step 6: Test del runtime en Chromium (`test/reel-runtime.ts`)**

```ts
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildReelPage } from "../src/reel/page.ts";
import { reelTiming, specDurations } from "../src/reel/timing.ts";
import { findChromium } from "../src/render/renderSlide.ts";
import { FORMATS } from "../src/templates/types.ts";
import spec from "../carousels/_smoke-plantillas.ts";

/**
 * Prueba el runtime del reel en Chromium real (sin ffmpeg): duración, movimiento
 * desde el cuadro 0 y tiempos del hook (titular completo a 1.2 s, palabra clave
 * en acento a 1.5 s). Uso: npm run test:reel
 */
const timing = reelTiming(specDurations(spec));
const html = await buildReelPage(spec, timing);
const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const page = await browser.newPage({ viewport: FORMATS.reel });
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForFunction(() => (window as any).__reelReady === true);
  const errors = await page.evaluate(() => (window as any).__reelErrors as string[]);
  assert.deepEqual(errors, [], "errores del runtime");
  assert.deepEqual(consoleErrors, [], "errores de consola");

  const duration = await page.evaluate(() => (window as any).__reel.duration as number);
  assert.ok(Math.abs(duration - timing.total) <= 1 / timing.fps, `duración ${duration} vs ${timing.total}`);

  const wordOpacities = (t: number) =>
    page.evaluate((x) => {
      (window as any).__reel.seek(x);
      return Array.from(document.querySelectorAll('[data-scene="0"] h1 .reel-word')).map((w) => Number(getComputedStyle(w).opacity));
    }, t);
  const at0 = await wordOpacities(0);
  assert.ok(at0.length > 0, "el titular se dividió en palabras");
  assert.ok(at0.some((o) => o < 1), "hay movimiento en el cuadro 0");
  const at12 = await wordOpacities(1.2);
  assert.ok(at12.every((o) => o === 1), `titular completo a 1.2 s: ${at12}`);

  const pop = await page.evaluate(() => {
    (window as any).__reel.seek(1.5);
    const el = document.querySelector('[data-scene="0"] [data-anim="pop"]') as HTMLElement;
    const probe = document.createElement("span");
    probe.style.color = el.dataset.accent!;
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return { now: getComputedStyle(el).color, accent };
  });
  assert.equal(pop.now, pop.accent, "palabra clave en acento a 1.5 s");

  // Al final, la última escena visible y la primera oculta.
  const vis = await page.evaluate((t) => {
    (window as any).__reel.seek(t);
    const s = Array.from(document.querySelectorAll("[data-scene]")) as HTMLElement[];
    return s.map((el) => getComputedStyle(el).visibility);
  }, timing.total);
  assert.equal(vis[vis.length - 1], "visible");
  assert.equal(vis[0], "hidden");
  console.log(`✓ runtime del reel OK (${timing.scenes.length} escenas, ${timing.total}s)`);
} finally {
  await browser.close();
}
```

El runtime guarda el color inline original de la palabra clave en `data-accent` (solo en el DOM del reel, nunca en el post) para que el test compare contra él.

En `package.json` agregar el script: `"test:reel": "tsx test/reel-runtime.ts"`.

En `src/render/renderSlide.ts`, exportar `findChromium` (`export function findChromium`).

Run: `npm run test:reel`
Expected: `✓ runtime del reel OK (…)`. Si falla el tiempo del hook, ajustar duraciones del runtime (palabras 0.45 s, stagger 0.06, pop 0.3) sin romper el presupuesto; no relajar el test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/reel/runtime.js src/reel/page.ts src/render/renderSlide.ts test/smoke.ts test/reel-runtime.ts
git commit -m "reel: página única con runtime GSAP (timeline maestra con seek)"
```

---

### Task 4: Captura con Playwright → ffmpeg y nuevo `renderReel`

**Files:**
- Create: `src/reel/capture.ts`
- Rewrite: `src/reel/renderReel.ts`
- Modify: `src/reel/cli.ts`
- Delete: `src/reel/video.ts`

**Interfaces:**
- Consumes: `buildReelPage(spec, timing)` y globals `__reel`, `__reelReady`, `__reelErrors` (Task 3); `reelTiming`, `specDurations`, `DEFAULT_TRANSITION`, `ReelTiming` (Task 1); `findChromium` (Task 3); `resolveBackground`.
- Produces:
  - `export async function captureReel(html: string, timing: ReelTiming, outPath: string, opts?: { audio?: string }): Promise<void>`
  - `export async function captureStills(html: string, timing: ReelTiming, outDir: string): Promise<string[]>` — un PNG por escena en `start + dur − transition − 0.05` (estado final, antes de salir); la última en `total − 0.05`.
  - `renderReel(spec, opts)` con `RenderReelOptions { outDir?, seconds?, fade?, audio?, framesOnly? }` — `fade` es ahora la duración de la transición (default `DEFAULT_TRANSITION`).

- [ ] **Step 1: `src/reel/capture.ts`**

```ts
import { spawn, spawnSync } from "node:child_process";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { findChromium } from "../render/renderSlide.ts";
import { FORMATS } from "../templates/types.ts";
import type { ReelTiming } from "./timing.ts";

/** Falla con un mensaje claro si ffmpeg no está en el PATH. */
export function assertFfmpeg(): void {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (r.error || r.status !== 0) {
    throw new Error("No encontré ffmpeg en el PATH. Instálalo con `brew install ffmpeg` y vuelve a intentar.");
  }
}

/** Carga la página del reel y valida que el runtime arrancó con la duración esperada. */
async function openReel(html: string, timing: ReelTiming) {
  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: FORMATS.reel, deviceScaleFactor: 1 });
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      console.warn(`  [página] ${m.text()}`);
      if (m.type() === "error") consoleErrors.push(m.text());
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction(() => (window as any).__reelReady === true, null, { timeout: 30_000 });
    const state = await page.evaluate(() => ({
      errors: (window as any).__reelErrors as string[],
      duration: (window as any).__reel?.duration as number | undefined,
    }));
    const problems = [...state.errors, ...consoleErrors];
    if (state.duration === undefined || problems.length) {
      throw new Error(`El runtime del reel no arrancó:\n${problems.join("\n") || "window.__reel no existe"}`);
    }
    if (Math.abs(state.duration - timing.total) > 1 / timing.fps) {
      throw new Error(`La animación dura ${state.duration.toFixed(3)}s pero se esperaban ${timing.total}s.`);
    }
  } catch (e) {
    await browser.close();
    throw e;
  }
  return { browser, page };
}

async function shot(page: Page, t: number): Promise<Buffer> {
  await page.evaluate((x) => (window as any).__reel.seek(x), t);
  return page.screenshot({ type: "png" });
}

/**
 * Captura el reel cuadro a cuadro y lo codifica con ffmpeg (PNG por stdin →
 * h264/yuv420p 30 fps, +faststart). Si ffmpeg falla, borra el mp4 parcial.
 */
export async function captureReel(html: string, timing: ReelTiming, outPath: string, opts: { audio?: string } = {}): Promise<void> {
  assertFfmpeg();
  const { browser, page } = await openReel(html, timing);
  const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(timing.fps), "-c:v", "png", "-i", "-"];
  if (opts.audio) args.push("-i", opts.audio, "-c:a", "aac", "-b:a", "192k", "-shortest");
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(timing.fps), "-movflags", "+faststart", outPath);
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ff.stderr.on("data", (d) => (stderr += d));
  const done = new Promise<number>((res) => ff.on("close", (code) => res(code ?? 1)));
  try {
    for (let k = 0; k < timing.frames; k++) {
      const png = await shot(page, k / timing.fps);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (k % timing.fps === 0) process.stdout.write(`\r  cuadro ${k}/${timing.frames}`);
    }
    ff.stdin.end();
    const code = await done;
    process.stdout.write("\n");
    if (code !== 0) throw new Error(`ffmpeg falló (código ${code}):\n${stderr.split("\n").slice(-8).join("\n")}`);
  } catch (e) {
    ff.stdin.destroy();
    ff.kill("SIGKILL");
    await rm(outPath, { force: true });
    throw e;
  } finally {
    await browser.close();
  }
}

/** Un PNG por escena en su estado final (para revisar rápido sin video). */
export async function captureStills(html: string, timing: ReelTiming, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const { browser, page } = await openReel(html, timing);
  const paths: string[] = [];
  try {
    const n = timing.scenes.length;
    for (let i = 0; i < n; i++) {
      const s = timing.scenes[i];
      const t = i === n - 1 ? timing.total - 0.05 : s.start + s.dur - timing.transition - 0.05;
      const p = join(outDir, `escena-${String(i + 1).padStart(2, "0")}.png`);
      await writeFile(p, await shot(page, t));
      paths.push(p);
    }
  } finally {
    await browser.close();
  }
  return paths;
}
```

- [ ] **Step 2: Reescribir `src/reel/renderReel.ts`**

```ts
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { resolveBackground } from "../render/background.ts";
import type { CarouselSpec } from "../templates/types.ts";
import { buildReelPage } from "./page.ts";
import { captureReel, captureStills, assertFfmpeg } from "./capture.ts";
import { DEFAULT_TRANSITION, reelTiming, specDurations } from "./timing.ts";

export interface RenderReelOptions {
  /** Carpeta base de salida (por defecto "output"). El reel va en <outDir>/<name>/. */
  outDir?: string;
  /** Override de duración uniforme por escena (s); por defecto según texto. */
  seconds?: number;
  /** Duración de la transición entre escenas (s). */
  fade?: number;
  /** Pista de audio opcional a muxear. */
  audio?: string;
  /** Solo exportar un PNG por escena (estado final), sin componer el video. */
  framesOnly?: boolean;
}

/**
 * Renderiza un carrusel como Reel animado 9:16 (1080×1920, 30 fps) en
 * <outDir>/<name>/reel.mp4. Compartido por `npm run reel` y `npm run remix --reel`.
 * Devuelve la ruta del MP4 (o del directorio de escenas si `framesOnly`).
 */
export async function renderReel(spec: CarouselSpec, opts: RenderReelOptions = {}): Promise<string> {
  const base = join(process.cwd(), opts.outDir ?? "output", spec.name);
  const timing = reelTiming(specDurations(spec, opts.seconds), opts.fade ?? DEFAULT_TRANSITION);
  if (!opts.framesOnly) assertFfmpeg();

  // Fondos `ai`/`image` resueltos a data URI antes de armar la página.
  const resolved: CarouselSpec = {
    ...spec,
    slides: await Promise.all(
      spec.slides.map(async (s) => {
        const props = { ...spec.defaults, ...s.props };
        return { ...s, props: { ...s.props, background: await resolveBackground(props.background) } };
      }),
    ),
  };
  const html = await buildReelPage(resolved, timing);

  if (opts.framesOnly) {
    const dir = join(base, "reel");
    const paths = await captureStills(html, timing, dir);
    console.log(`\n✓ ${paths.length} escenas de "${spec.name}" en ${dir}`);
    return dir;
  }

  await mkdir(base, { recursive: true });
  const mp4 = join(base, "reel.mp4");
  console.log(`⏳ Animando "${spec.name}" (${timing.scenes.length} escenas, ${timing.total}s, ${timing.frames} cuadros)…`);
  await captureReel(html, timing, mp4, { audio: opts.audio });
  console.log(`✓ Reel "${spec.name}" → ${mp4}  (${timing.total}s, 1080×1920${opts.audio ? "" : ", sin audio"})`);
  if (!opts.audio) console.log("  Súbelo y añádele un audio en tendencia dentro de la app.");
  return mp4;
}
```

- [ ] **Step 3: `src/reel/cli.ts`**

- Cambiar el comentario de cabecera: "Genera un Reel 9:16 animado a partir de un carrusel (entradas con GSAP, transiciones verticales, sin audio)".
- `const fade = numFlag("fade");` (sin `?? 0.4`; el default lo pone `renderReel`).
- Mensaje de uso: `--seconds=N --fade=N (transición) --frames-only --audio=ruta`.

- [ ] **Step 4: Eliminar `src/reel/video.ts`**

```bash
git rm src/reel/video.ts
grep -rn "video.ts\|composeReel\|reelDuration" src test
```

Expected: sin resultados.

- [ ] **Step 5: Verificar**

```bash
npm run typecheck && npm test && npm run test:reel
npm run reel carousels/_smoke-plantillas.ts
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name,pix_fmt -show_entries format=duration -of default=nw=1 output/_smoke-plantillas/reel.mp4
npm run reel carousels/_smoke-plantillas.ts -- --frames-only
PATH=/usr/bin:/bin npx tsx src/reel/cli.ts carousels/_smoke-plantillas.ts; echo "exit=$?"
```

Expected:
- ffprobe: `codec_name=h264`, `width=1080`, `height=1920`, `pix_fmt=yuv420p`, `r_frame_rate=30/1`, duración = total de timing ± 0.034.
- `--frames-only`: `output/_smoke-plantillas/reel/escena-01.png` … una por slide.
- Sin ffmpeg en PATH: mensaje "No encontré ffmpeg…" y exit ≠ 0. (Si `npx`/`node` no están en `/usr/bin`, usar la ruta absoluta de `node` y ejecutar `node --import tsx src/reel/cli.ts …`.)
- Mirar `escena-01.png`…: el texto no pisa la zona inferior (440 px) y el layout coincide con el slide estático.

- [ ] **Step 6: Commit**

```bash
git add -A src/reel
git commit -m "reel: captura cuadro a cuadro a ffmpeg y renderReel animado (adiós zoompan)"
```

---

### Task 5: Documentación

**Files:**
- Modify: `README.md` (sección de Reels si existe; si no, agregar una breve)

- [ ] **Step 1:** Documentar `npm run reel` animado: qué hace, flags (`--seconds`, `--fade` como transición, `--frames-only`, `--audio`), que requiere ffmpeg, y el vocabulario `data-anim` para quien cree plantillas nuevas (tabla de la spec, sin repetir números de tiempos).
- [ ] **Step 2:** `npm run typecheck && npm test`
- [ ] **Step 3: Commit** `git commit -am "docs: reels animados en el README"`
