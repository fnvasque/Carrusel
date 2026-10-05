# Reels animados — diseño

Fecha: 2026-10-04 · Estado: aprobado en conversación

## Objetivo

Reemplazar el reel actual (slides estáticos + zoompan/xfade de ffmpeg) por reels
**animados** generados desde el mismo `carousels/*.ts`: cada slide es una escena,
el titular entra palabra por palabra, la palabra clave se resalta, los bullets
aparecen escalonados y las escenas se cruzan con un empuje vertical.

`npm run reel carousels/x.ts` y `npm run remix --reel` mantienen su interfaz.

### Criterios de éxito

- Video 1080×1920, 30 fps, h264/yuv420p, aceptado por Instagram y TikTok.
- Movimiento visible desde el cuadro 0; el titular del Hook completo antes de
  1.2 s y la palabra clave resaltada antes de 1.5 s (regla de 3 s de TikTok,
  `knowledge/referencias/hook-de-video.md`).
- El texto respeta la zona segura inferior de Reels (`REEL_SAFE_BOTTOM`).
- Los PNG del carrusel (formato post) salen idénticos a los de antes.
- Render determinista: el mismo `.ts` produce el mismo video.

### Fuera de alcance

Audio, voz y subtítulos; formato TikTok foto (1080×1920 estático) y zonas
seguras por plataforma; escenas exclusivas del reel; transiciones elegibles por
escena; coreografías a medida por pieza.

## Enfoque

GSAP con marcas declarativas. Las plantillas React solo agregan atributos
`data-anim`; un runtime en la página construye una timeline maestra pausada y la
avanza con `seek(t)` cuadro a cuadro. Todas las escenas viven en **una sola
página**; Playwright captura cada cuadro y lo envía por stdin a ffmpeg.

Alternativas descartadas: Web Animations API (split de texto y coordinación de
escenas a mano, easing pobre) y motor propio tipo `promo/reel-biblioteca`
(reescribir lo que GSAP resuelve).

## Arquitectura

```
carousels/x.ts ─► renderReel ─► buildReelPage (HTML: escenas + GSAP + runtime + tiempos)
                                   │
                    capture: Playwright → __reel.seek(t) → screenshot ─► ffmpeg stdin ─► reel.mp4
```

### Unidades (`src/reel/`)

| Archivo | Responsabilidad | Depende de |
|---|---|---|
| `timing.ts` | Funciones puras: segundos por escena según texto, inicios de escena con transición, duración total, número de cuadros, factor de compresión de entradas | nada |
| `page.ts` | `buildReelPage(spec)`: HTML completo vía `htmlShell`; cada slide renderizado con `format: "reel"` en un contenedor absoluto `[data-scene]`; GSAP + SplitText inline (leídos de `node_modules/gsap/dist`); runtime inline; `window.__REEL_TIMING__` en JSON | templates, timing, render/htmlShell |
| `runtime.js` | Script de navegador (JS plano, sin build). Lee `__REEL_TIMING__` y las marcas `data-anim`, arma la timeline maestra pausada y expone `window.__reel = { duration, seek(t) }` | GSAP, SplitText |
| `capture.ts` | Lanza Chromium (reutiliza `findChromium`), carga la página, espera fuentes, valida `__reel`, recorre cuadros, screenshot PNG → stdin de ffmpeg (`image2pipe`), codifica h264 yuv420p 30 fps `+faststart`, audio opcional | Playwright, ffmpeg |
| `renderReel.ts` | Orquesta; misma firma `renderReel(spec, opts)`. `--frames-only` exporta un PNG por escena en su estado final | todo lo anterior |

### Cambios en código existente

- `Frame`: el contenedor del fondo lleva `data-anim="bg"`.
- `highlightText`: la palabra clave lleva `data-anim="pop"`.
- Plantillas Hook, Lead, Step, Prompt, MythReality, Cta: atributos `data-anim`
  en sus elementos (ver vocabulario). Cover/Bullet/Quote pueden quedar sin
  marcas (solo animan el fondo).
- `findChromium` se exporta desde `render/renderSlide.ts` para reutilizarlo.
- `src/reel/video.ts` se elimina (zoompan + xfade). `reelDuration` pasa a
  `timing.ts`.
- Nueva dependencia: `gsap` (3.15+, gratis incluidos plugins).

Las marcas `data-anim` son inertes sin el runtime: el render estático de los
carruseles no cambia.

## Vocabulario de animación

| `data-anim` | Efecto | Uso |
|---|---|---|
| `bg` | escala 1.06 → 1.0 durante toda la escena, lineal | Frame |
| `words` | SplitText por palabras; cada palabra `yPercent` 60 → 0 y opacidad 0 → 1, stagger 0.06 s, `power4.out`, 0.5 s por palabra | títulos de Hook, Lead, Step, Cta |
| `pop` | escala 0.9 → 1 y color de `currentColor` heredado → acento, 0.35 s, `power2.out`; empieza al terminar el `words` que lo contiene | palabra clave |
| `rise` | y 40 px → 0 y opacidad 0 → 1, 0.45 s, `power3.out` | eyebrow, kicker, subtítulos, body, etiquetas |
| `stagger` | hijos directos como `rise`, 0.12 s entre ellos | lista de bullets |
| `type` | revelado por caracteres (SplitText chars, opacidad), duración total min(1.5 s, 0.03 s × caracteres) | texto de Prompt |
| `strike` | línea absoluta `scaleX` 0 → 1 desde la izquierda, 0.4 s | mito en MythReality |

Reglas:

- Sin easing de rebote ni elástico (`back`, `elastic`, `bounce` prohibidos).
- Logo, chip de pilar, progreso y fuente al pie no se animan.
- Orden: dentro de una escena, los elementos animados (excepto `bg` y `pop`)
  entran en orden de documento; cada uno empieza cuando el anterior alcanza el
  60 % de su duración.
- Marca desconocida: se ignora con `console.warn`.

## Tiempos

- Segundos por escena: fórmula actual `clamp(1.8 + chars/26, 2.4, 4.8)` más
  0.7 s en la primera y la última escena; `--seconds` la fija para todas.
- Transición: empuje vertical de `T = 0.35 s`. La escena saliente va a
  `yPercent -6` y opacidad 0; la entrante viene de `yPercent 6` y opacidad 0.
  Se solapan `T` segundos. La escena `i` empieza en
  `start[i] = Σ_{j<i} dur[j] − i·T`. Duración total `Σ dur − (n−1)·T`.
- Cuadros: `round(total × 30)`; el cuadro `k` corresponde a `t = k / 30`.
- Presupuesto de entrada: las entradas de una escena (salvo `bg`) deben caber
  en `min(0.4 × dur, 1.6 s)`. Si la secuencia natural mide más, se aplica
  `timeScale = natural / presupuesto` a la sub-timeline (factor de compresión
  calculado por la función pura `entranceScale(natural, dur)` en `timing.ts`,
  replicada en el runtime).
- Hook: las entradas arrancan en t = 0 (incluido `bg`), así hay movimiento
  desde el cuadro 0. La primera escena no tiene transición de entrada.
- Escena final: sin salida; queda quieta hasta el último cuadro.

## Errores

- Sin `ffmpeg` en el PATH: error en español con `brew install ffmpeg`, antes
  de abrir Chromium.
- ffmpeg sale con código ≠ 0: cerrar Chromium, borrar el mp4 parcial, mostrar
  las últimas líneas de stderr.
- Runtime no inicializado o `__reel.duration` distinta (± 1 cuadro) de la de
  `timing.ts`: abortar antes del primer cuadro con los errores de consola de la
  página.
- Errores de consola de la página se reenvían al terminal.
- Fuentes: `document.fonts.ready` antes de capturar.
- Fondos `ai`: `resolveBackground` como hoy, antes de armar la página.

## Pruebas

Unitarias (en `test/smoke.ts`, offline):

- `timing.ts`: segundos por texto, extra en primera/última, override, inicios
  con solape, duración total, cuadros a 30 fps, `entranceScale` (≥ 1 solo
  cuando hace falta comprimir, respeta tope 1.6 s).
- `page.ts`: una `[data-scene]` por slide, GSAP inline, `__REEL_TIMING__`,
  `data-anim="pop"` en la palabra clave, `data-anim="words"` en el título del
  Hook.
- Carrusel intacto: el markup estático de las plantillas sin runtime renderiza
  igual (comparación de PNG de `carousels/_smoke-plantillas.ts` antes/después,
  o del markup sin atributos `data-anim`).

Integración (manual, requiere Chromium + ffmpeg):

- `npm run reel carousels/mentiras-ia.ts` y `ffprobe`: 1080×1920, 30 fps,
  h264, yuv420p, duración = `timing.ts` ± 1 cuadro.
- Cuadros del Hook en t = 0, 0.5, 1.2, 1.5 s: movimiento en t = 0, titular
  completo a 1.2 s, palabra clave en acento a 1.5 s. Revisión visual.
- `--frames-only`: un PNG por escena en estado final.
