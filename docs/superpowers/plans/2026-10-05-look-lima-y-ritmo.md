# Look lima + ritmo de enseñanza — plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Las tareas de diseño exigen verificación visual (render + mirar las imágenes), no solo tests.

**Goal:** Cambiar el look de carruseles y reels al sistema "lima" (estilo `promo/reel-biblioteca`), agregar la plantilla `Stat` y animaciones `count`/`check`/`caret`, y un ritmo `ensenar` más lento para reels didácticos.

**Spec:** `docs/superpowers/specs/2026-10-05-look-lima-y-ritmo-design.md` (autoridad; leer completa).

**Tech Stack:** TypeScript, React SSR, Playwright/Chromium, GSAP 3.15 + SplitText, ffmpeg.

## Global Constraints

- Tokens exactos de la spec (bg `#06060A`, lima `#C6FF3D`, violeta `#7C5CFF`, rosa `#FF3D7F`, text `#F4F4F6`, muted `#8A8A99`, card `#13131A`, línea `#23232E`, grilla lima 7 % / 2 px / 120 px, viñeta radial).
- Pilar → color: herramienta/prompt lima, noticia violeta, curiosidad rosa.
- Easing solo `power*.out`, `power*.in`, `none`. Logo, etiqueta de cabecera, contador y fuente al pie no se animan (la grilla sí puede derivar).
- Hook del reel: titular completo y legible en t = 0, palabra clave en acento < 0.6 s, cuadro 0 no vacío — en ambos `pace`.
- Zona segura inferior del reel: 440 px sin texto.
- Comentarios y mensajes en español, estilo del código vecino.
- `npm run typecheck`, `npm test` y `npm run test:reel` en verde al cerrar cada tarea. Los tests del look anterior se actualizan (no se borran).
- Entorno: `export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/Users/felipevasquez/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell`; nunca `playwright install`. Fondos `ai`: `set -a; source /Users/felipevasquez/Documents/Claude/Carrusel/.env; set +a` (no imprimir la clave; hay caché en `.cache/ai`).
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Titulares largos en Hook/Cta/Step: el ajuste de tamaño no debe cortar ni desbordar (post y reel).
2. Step con `body` y `bullets` a la vez, o con 5+ bullets: la tarjeta no desborda el lienzo.
3. Stat con valor no numérico ("10×", "$25K/mes", "6 horas"): render correcto y `count` con respaldo.
4. Fondos `ai` con la grilla encima: el texto sigue legible.
5. Reel `pace: "rapido"` reproduce exactamente los tiempos actuales (tests existentes de timing siguen válidos).

---

### Task 1: Sistema visual lima (theme, Frame, plantillas, Stat)

**Files:** `src/theme.ts`, `src/templates/*.tsx` (Frame, Hook, Lead, Step, Prompt, MythReality, Cta, nueva `Stat.tsx`, `index.ts`, `types.ts` si hace falta), `src/remix/templates-catalog.ts` (+ tipos de remix si exige), `scripts/make-wordmark.py` / `src/assets/ia_es_wordmark.png` (punto del wordmark en lima), `test/smoke.ts`, `carousels/_smoke-plantillas.ts` (agregar un slide `Stat`).

**Requisitos:**
- Implementar todo lo de la sección "Sistema visual" y "Plantillas" de la spec, para formatos `post` y `reel`.
- Mantener las marcas `data-anim` existentes con la misma semántica (bg, words, pop, rise, stagger, type, strike) en los elementos equivalentes; agregar `data-anim="count"` en el número de Stat y `data-anim="check"` en cada círculo del checklist (dentro de su `li`), y `data-anim="caret"` en el cursor del Prompt. El runtime aún no los conoce: hasta la Task 2 los ignora con warning, y eso está bien.
- En el reel, la grilla vive en una capa propia marcada `data-grid` (la Task 2 la anima); en post es estática.
- Verificación visual obligatoria: `npm run generate carousels/_smoke-plantillas.ts` y los 3 carruseles de contenido (`video-3-segundos`, `escalera-dopamina`, `voz-subtitulos-gratis`) en post, y `npm run reel <x> -- --frames-only` en reel. Mira las imágenes y corrige jerarquía, tamaños, márgenes, desbordes, contraste. Itera hasta que se vean al nivel de los posts de referencia (ver imágenes de ejemplo en `knowledge/_adjuntos/` y cuadros de `promo/reel-biblioteca/reel-biblioteca-9x16.mp4`).
- Actualizar tests de smoke que dependan de markup/colores; agregar checks de `Stat` (render con value numérico y no numérico; marca `count`) y del checklist (`check` por bullet).

### Task 2: Runtime — grilla, count, check, caret

**Files:** `src/reel/runtime.js`, `src/reel/page.ts` si hace falta, `test/reel-runtime.ts`.

**Requisitos:**
- Grilla `[data-grid]` de cada escena (o una global): deriva diagonal lenta y continua durante todo el reel (`ease: none`, determinista con seek hacia adelante y atrás).
- `count`: anima el número desde 0 hasta el valor (parsear prefijo/sufijo y separadores; enteros o con decimales según el original; texto final idéntico al original al terminar). Si no es numérico, `rise`.
- `check`: el círculo pasa de escala 0 a 1 (`power2.out`, ~0.3 s) al entrar su bullet (encadenado con `stagger`).
- `caret`: tras terminar el `type`, parpadeo on/off cada 0.5 s hasta el fin de la escena.
- Hook de la escena 0 según "Ajustes por la auditoría" de la spec: titular completo en t=0 con acercamiento 1.04→1, pop < 0.6 s, eyebrow/subtítulo con rise (en lugar de words en la escena 0).
- Tests en Chromium: count llega exactamente al texto final; check visible al final de la escena e invisible antes de su bullet; seek hacia atrás restaura estados; las metas del hook siguen.

### Task 3: Ritmo `pace`

**Files:** `src/templates/types.ts` (`CarouselSpec.pace?: "ensenar" | "rapido"`), `src/reel/timing.ts`, `src/reel/runtime.js` (factor de lentitud de entradas vía `__REEL_TIMING__`), `src/reel/renderReel.ts`, `src/reel/cli.ts` (flag `--pace=`), `test/smoke.ts`, `README.md`.

**Requisitos:** incluye el escalonado de bullets de 1.8 s y la fórmula de duración con bullets de "Ajustes por la auditoría". Además, exactamente los valores de la sección "Reel: estilo y ritmo" de la spec. `rapido` = valores actuales (los tests actuales de timing deben pasar con `pace: "rapido"` explícito o con la función de ritmo rápido). Por defecto `ensenar`. Escena 0 conserva las metas del hook en ambos ritmos (test en Chromium con un carrusel `ensenar`).
