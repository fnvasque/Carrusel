# SPDD Analysis: Remix de IG — smoke tests del pipeline (Tanda 2 · Iteración 2/3)

## Original Business Requirement

> Tanda 2 · Iteración 2/3 del "remix de Instagram". Tarea: SMOKE TESTS del pipeline, sin red ni API ni binarios externos, con un runner mínimo (el repo NO tiene framework de test; usar tsx + asserts de node:assert, y un script `npm run test` que falle con exit≠0 si algo se rompe, para sumarlo al quality gate). Cubrir las funciones puras y deterministas ya existentes: detectType / extractImageUrls (dedup, unescape \/ y &amp;, filtro por CDN) / extractVideoUrl (de src/remix/ingest.ts); isTemplateName / validPropKeys (templates-catalog.ts); slugify / validateDraft (emit.ts: filtra props inválidas, garantiza Hook inicial + Cta final, recalcula index/total); draftToSpec / scoreDraft (registry.ts: mapea a componentes y puntúa en memoria, weak < strong, y un draft fuerte supera el umbral). NO testear nada que requiera OpenAI, ffmpeg, yt-dlp o red. Mantener typecheck verde y que generate/reel/remix sigan funcionando; el nuevo `npm run test` debe pasar en verde.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **Funciones puras de la ingesta** (`src/remix/ingest.ts`): `detectType`, `extractImageUrls`, `extractVideoUrl` — exportadas, deterministas, sin IO. Son el objetivo de test más frágil (parsing de IG).
- **Catálogo de plantillas** (`src/remix/templates-catalog.ts`): `isTemplateName`, `validPropKeys` — puras; definen el contrato de validación.
- **Validación/serialización** (`src/remix/emit.ts`): `slugify` (pura) y `validateDraft` (pura: filtra props, garantiza Hook+Cta, recalcula index/total). `emitCarouselFile` escribe a disco (no es objetivo de smoke puro, opcional con tmp).
- **Scoring en memoria** (`src/remix/registry.ts`): `draftToSpec`, `scoreDraft` — puras (no resuelven fondos), usan `scoreCarousel`.
- **Indicador de viralidad** (`src/score/virality.ts`): `scoreCarousel`, `THRESHOLD` — base del scoreDraft; ya probado indirectamente.
- **Runner de scripts** (`package.json`): convención `tsx src/...`; no hay framework de test ni script `test`. Node trae `node:assert` (sin dependencias).
- **Patrón de CLI/exit codes**: scripts terminan con exit≠0 en fallo (p. ej. `score/cli.ts` exit 1/2). El runner de test seguirá ese patrón para servir de gate.

### New Concepts Required

- **Runner de smoke tests** (`test/smoke.ts`, nuevo): un archivo `tsx` con un mini-helper de aserciones (`check(name, fn)`) sobre `node:assert/strict`, que ejecuta todos los casos, imprime ✓/✗ por caso, y hace `process.exit(1)` si alguno falla (verde = exit 0).
- **Script `npm run test`** (`package.json`): `tsx test/smoke.ts`.
- **(Opcional) helper de fixtures**: HTML de ejemplo de IG y drafts (strong/weak) embebidos en el test, sin archivos externos.

### Key Business Rules

- **Cero red/API/binarios**: los tests solo tocan funciones puras; nada de OpenAI/ffmpeg/yt-dlp/fetch. Deben correr offline y rápido.
- **Gate verde**: `npm run test` debe pasar (exit 0) y sumarse al quality gate junto a `npm run typecheck`.
- **Determinismo**: las aserciones se basan en comportamiento estable (dedup, unescape, conteos, umbrales relativos), no en strings frágiles del modelo.
- **No tocar producción**: solo se agrega `test/` y el script; el código bajo test no cambia (si un test revela un bug, se corrige vía SPDD).

## Strategic Approach

### Solution Direction

Un único archivo `test/smoke.ts` ejecutado por `npm run test` (tsx), con `node:assert/strict` y un helper minimalista:

- **Helper**: `check(name, fn)` corre `fn()`, captura errores, acumula fallos; al final imprime resumen y `process.exit(fails ? 1 : 0)`.
- **Casos por módulo**:
  - *ingest*: `detectType` (reel/p/tv/unknown); `extractImageUrls` sobre un HTML fixture (dedup de og:image repetido, unescape `\/` y `&amp;`, descarte de hosts no-CDN, orden); `extractVideoUrl` (og:video y `"video_url"`).
  - *catalog*: `isTemplateName` (true para Hook…Cta, false para inexistente); `validPropKeys` (incluye required+optional+base; excluye props inventadas).
  - *emit*: `slugify` (acentos→ascii, espacios→guiones, recorte); `validateDraft` (elimina prop fuera de catálogo; inserta Hook al inicio y Cta al final si faltan; recalcula index/total en slides de desarrollo).
  - *registry*: `draftToSpec` (nº de slides, template = componente, defaults.pillar); `scoreDraft` (weak < strong; un draft fuerte ≥ THRESHOLD).
- **Ubicación**: `test/` en la raíz (no está en `tsconfig.include` = `["src","carousels"]`; para que typecheck cubra el test, añadir `test` al include).

### Key Design Decisions

- **Runner casero con `node:assert`** (vs. agregar Vitest/Jest): → sin dependencias nuevas, alineado con la filosofía del repo (tsx + scripts), arranque instantáneo. Recomendado. Trade-off: sin watch/coverage, pero suficiente para smoke.
- **Un solo archivo `test/smoke.ts`** (vs. múltiples archivos + glob): → simple de ejecutar (`tsx test/smoke.ts`) sin runner que descubra archivos. Recomendado. A futuro se puede dividir.
- **Añadir `test` a `tsconfig.include`** (vs. dejarlo fuera): → que `npm run typecheck` también valide los tests (atrapa drift de tipos en las APIs probadas). Recomendado.
- **Aserciones por comportamiento, no por strings exactos del score** (p. ej. `weak.total < strong.total` y `strong.total >= THRESHOLD`): → robustas ante ajustes de pesos del score. Recomendado.
- **Fixtures embebidos** (HTML/drafts como literales en el test): → sin archivos externos, test autocontenido y determinista. Recomendado.

### Alternatives Considered

- **Vitest/Jest**: descartado — dependencia y config nuevas para un smoke mínimo; contradice "sin dependencias nuevas".
- **Probar funciones internas (no exportadas)**: descartado — solo se testea la API pública exportada; lo interno se cubre indirectamente.
- **Tests que golpean red/ffmpeg/OpenAI**: explícitamente fuera de alcance (no deterministas, requieren entorno).

## Risk & Gap Analysis

### Requirement Ambiguities

- **Dónde viven los tests**: `test/smoke.ts` en la raíz; añadir `test` a `tsconfig.include`. Registrar.
- **Nombre del script**: `npm run test` (estándar). Registrar.
- **Qué umbral usa el caso "strong ≥ umbral"**: usar `THRESHOLD` importado, no un número mágico. Registrar.

### Edge Cases

- **`validateDraft` inserta Hook con título derivado**: el test debe tolerar el contenido por defecto y solo afirmar estructura (primer slide Hook, último Cta).
- **`extractImageUrls` orden/dedup**: afirmar que og:image aparece una vez y que las display_url se incluyen; no fijar el orden exacto más allá de "og primero".
- **`scoreDraft` de un draft fuerte podría no llegar a 75 si el contenido fixture es flojo**: diseñar el fixture fuerte con número en el hook + enemigo + bucle + CTA de guardar + reframe para superar el umbral de forma estable.
- **Acentos en `slugify`**: afirmar que "Á/ñ/espacios" se normalizan a ascii-kebab.
- **Un test falla**: el runner debe exit 1 (gate rojo), no silenciar.

### Technical Risks

- **Fragilidad del fixture del score**: mitigación: construir el draft fuerte con todas las palancas que `virality.ts` premia (número, ENEMY, OPEN_LOOP, highlight, reframe, CTA guardar, index/total) para margen sobre 75.
- **`tsconfig.include` ampliado podría exponer errores de tipo en test**: mitigación: escribir el test con tipos correctos; es deseable que typecheck lo cubra.
- **Falsos negativos por cambios futuros del score**: mitigación: aserciones relativas (weak<strong) además de la absoluta (strong≥THRESHOLD).

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Runner mínimo sin framework (tsx + node:assert), exit≠0 si falla | Yes | `test/smoke.ts` + `check()` |
| 2 | Script `npm run test` | Yes | package.json |
| 3 | Tests de detectType/extractImageUrls/extractVideoUrl | Yes | fixtures HTML embebidos |
| 4 | Tests de isTemplateName/validPropKeys | Yes | — |
| 5 | Tests de slugify/validateDraft | Yes | estructura Hook+Cta, index/total |
| 6 | Tests de draftToSpec/scoreDraft (weak<strong, strong≥umbral) | Yes | usa THRESHOLD |
| 7 | Sin red/API/binarios; gate verde (test + typecheck) | Yes | solo funciones puras |

## Decisiones tomadas autónomamente

1. **Runner casero** `test/smoke.ts` con `node:assert/strict` + helper `check()`; `process.exit(1)` si algún caso falla. Sin dependencias nuevas.
2. **Script** `"test": "tsx test/smoke.ts"` en package.json.
3. **Añadir `test`** a `tsconfig.include` para que typecheck cubra los tests.
4. **Fixtures embebidos** (HTML de IG y drafts strong/weak) en el propio archivo.
5. **Aserciones por comportamiento** (dedup, unescape, conteos, weak<strong, strong≥THRESHOLD) en vez de strings frágiles.
6. **Solo API pública exportada**; nada de red/OpenAI/ffmpeg/yt-dlp.
7. **Gate de la iteración** = `npm run typecheck` && `npm run test`, ambos verdes.
