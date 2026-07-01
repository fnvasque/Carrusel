# SPDD Analysis: Prevención de regresiones de marca (guard anti-fondo-oscuro + handle único)

## Original Business Requirement

Iteración 2/2 (dentro de /spdd-loop). Prevención estructural para que los defectos corregidos en la iteración 1 (fondo oscuro ilegible + handle incorrecto) NO vuelvan a ocurrir.

Tarea elegida por el usuario: **Prevención completa** —
1. Constante de handle ÚNICA (fuente de verdad de marca), reemplazando los 3 hardcodeos actuales.
2. Guard anti-fondo-oscuro que **BLOQUEA en render** (hace estructuralmente imposible shipear un slide con fondo oscuro bajo la identidad clara).
3. Test en el gate del repo (`npm run test`) que detecte fondos oscuros y handle != "ia.punto.es".

Contexto de la regresión: el handle ya se había corregido antes y volvió porque no había ningún guard/test que lo protegiera. El gate actual (`typecheck` + `test`) no cubre contraste ni handle.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **theme** (`src/theme.ts`): fuente de verdad de tokens de marca. NO tiene constante de handle/nombre; el handle está hardcodeado en 3 sitios: `Cta.tsx:73` (`"ia.punto.es"`), `analyze.ts` BRAND_RULES (texto `"ia.punto.es"`) y antes en `ejemplo.ts` (regresó como `"ia.es"`).
- **Background** (`src/templates/types.ts`): `color` | `gradient` | `image` | `ai`. Los `color`/`gradient` oscuros rompen el contraste (texto tinta fijo); `ai`/`image` llevan scrim claro (`Frame.scrimLayer`) y son legítimos.
- **Frame** (`src/templates/Frame.tsx`): texto siempre `color ?? theme.colors.text` (tinta). Cualquier fondo oscuro = ilegible.
- **renderCarousel** (`src/render/renderCarousel.ts`): único punto de render de PNGs (lo usan `generate` y `remix --render`). Ya corre un gate de viralidad + gate de contenido. Es el lugar natural para bloquear.
- **renderReel** (`src/reel/renderReel.ts`): render 9:16; también consume CarouselSpec. Debe gatear igual para cobertura completa.
- **slideText** (`src/templates/slideText.ts`): precedente de util puro sobre CarouselSpec en `templates/` — mismo patrón para el guard.
- **Carruseles existentes** (`carousels/*.ts`): `estudiar-3-ias.ts` (1 slide navy en línea 36) y `mentiras-ia.ts` (5 slides navy) tienen el MISMO defecto de fondo oscuro; sus `ai`/`image` son legítimos y sus handles ya son correctos. Quedan FUERA de alcance de arreglo (opción 1 elegida) pero el guard los bloqueará al renderizar → se reportan como follow-up.

### New Concepts Required
- **BrandViolation**: `{ slide: number; kind: "dark-background" | "wrong-handle"; message: string; fix: string }`. Resultado del guard.
- **theme.brand**: `{ name: "ia.es"; handle: "ia.punto.es" }` — constante única de marca.

### Key Business Rules
- **Contraste**: ningún slide puede declarar `background` con `color`/`gradient` cuya luminancia sea oscura (texto tinta requiere fondo claro). `ai`/`image` exentos (scrim claro).
- **Handle único**: toda prop `handle` debe ser exactamente `theme.brand.handle` ("ia.punto.es"). El wordmark `ia.es` (Frame) es otra cosa, intocable.
- **Fail-closed en render**: una violación de marca BLOQUEA el render (no se advierte y se sigue).

## Strategic Approach

### Solution Direction
1. Añadir `theme.brand = { name, handle }` como fuente de verdad; referenciarla en `Cta.tsx` (default) y `analyze.ts` (BRAND_RULES). Actualizar de paso el comentario de cabecera desactualizado de `theme.ts`.
2. Crear `src/templates/brandGuard.ts` (util puro, sin render): `lintBrand(spec): BrandViolation[]` + helpers de luminancia (`relLuminance`, `extractHexColors`, umbral `MIN_BG_LUMINANCE`) + `assertBrandOk(spec)` (lanza si hay violaciones) + `printBrandViolations`.
3. Wire `assertBrandOk(spec)` como PRIMER gate (fail-closed, offline, determinista) en `renderCarousel` y `renderReel`.
4. Tests puros en `test/smoke.ts`: luminancia, lintBrand (flag dark gradient/color + wrong handle; NO flag ai/image ni handle correcto), y `ejemplo.ts` importado pasa con 0 violaciones (candado de regresión del fix de la iteración 1).

### Key Design Decisions
- **Guard como función pura sobre CarouselSpec** (no en el DOM/CSS): → determinista, testeable offline, corre en el gate y en render. Trade-off: aproxima "oscuro" por luminancia de los hex declarados (no evalúa la imagen `ai` renderizada), que es exactamente lo que queremos (los `ai` se eximen por diseño).
- **Umbral de luminancia 0.5**: el ink es ~0.008 y la crema ~0.9; los navy (#0B1020..#1C2640) son ~0.01-0.02. 0.5 separa limpio "claro vs oscuro". Trade-off: un fondo `color` gris medio podría quedar en el borde; aceptable — bajo la identidad clara no debería haber `color` sólidos, y si los hay, cerca del umbral es señal legítima de revisar.
- **Bloqueo duro (sin env de escape) para el guard de marca**: → la identidad clara no admite fondos oscuros ni handle equivocado; son siempre errores. Trade-off: `estudiar-3-ias.ts`/`mentiras-ia.ts` quedarán bloqueados al renderizar hasta corregirse — deseable (es el defecto real aflorando), se reporta como follow-up.
- **Gatear también `renderReel`**: → cobertura completa ("estructuralmente imposible"). Reutiliza `assertBrandOk`.

### Alternatives Considered
- **Solo test, sin bloqueo en render**: rechazado — el usuario pidió que BLOQUEE en render; un test no evita renderizar un `.ts` suelto.
- **Bloqueo con env de escape (como CONTENT_GATE_LENIENT)**: rechazado para el guard de marca — no hay caso legítimo de fondo oscuro/handle malo bajo la identidad clara; un escape reabre la puerta a la regresión.
- **Reparar CSS para forzar texto claro sobre fondo oscuro**: rechazado — habilitaría slides oscuros, contra la identidad; queremos impedirlos, no maquillarlos.

## Risk & Gap Analysis

### Requirement Ambiguities
- "Fondo oscuro" definido operacionalmente como luminancia < 0.5 de la stop más oscura de un `color`/`gradient`. `ai`/`image` exentos.

### Edge Cases
- **`background` en `defaults`**: el guard debe evaluar el fondo efectivo (`{ ...defaults, ...slide.props }`), como hace `renderCarousel`.
- **Colores en formato corto (#abc)** o rgba en gradientes: `extractHexColors` maneja #rgb y #rrggbb; si un gradiente usa `rgba()` sin hex, no hay hex que evaluar (no se marca) — aceptable, la marca usa hex.
- **Slides sin `handle`** (no-Cta): no se evalúa handle (solo props que lo declaran).
- **Carruseles legítimos con `ai`/`image`**: NO se marcan (exentos) — verificado con `estudiar-3-ias.ts`.

### Technical Risks
- **Romper el render de carruseles con defecto preexistente** (`estudiar`, `mentiras`): esperado y deseado (afloran el bug). Mitigación: reportarlos como follow-up inmediato; su handle ya es correcto, solo faltará limpiar navy.
- **Falsos positivos de luminancia**: bajo riesgo con umbral 0.5 y marca de colores claros; cubierto con tests.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | `theme.brand.handle` único y usado por Cta + remix | Yes | Reemplaza 3 hardcodeos |
| 2 | `lintBrand` marca fondo `color`/`gradient` oscuro | Yes | Umbral luminancia 0.5 |
| 3 | `lintBrand` marca `handle != ia.punto.es` | Yes | Compara con `theme.brand.handle` |
| 4 | `lintBrand` NO marca `ai`/`image` ni handle correcto | Yes | Exención por tipo de fondo |
| 5 | `renderCarousel` y `renderReel` BLOQUEAN si hay violación | Yes | `assertBrandOk` fail-closed |
| 6 | Tests en el gate (`npm run test`) cubren lo anterior | Yes | +tests puros en smoke.ts |
| 7 | `ejemplo.ts` pasa el guard con 0 violaciones | Yes | Candado de regresión it.1 |
| 8 | Wordmark `ia.es` intacto | Yes | No se toca Frame wordmark |

## Decisiones tomadas autónomamente
- Guard como función pura en `src/templates/brandGuard.ts` (junto a `slideText.ts`).
- Umbral `MIN_BG_LUMINANCE = 0.5`; luminancia relativa WCAG sobre los hex de la stop más oscura.
- Bloqueo duro sin env de escape para el guard de marca (a diferencia del gate de contenido).
- Gatear `renderCarousel` y `renderReel`.
- NO corregir `estudiar-3-ias.ts`/`mentiras-ia.ts` en esta vuelta (opción 1); reportarlos como follow-up. Los tests NO asertan sobre ellos para no ampliar alcance.
- Actualizar de paso el comentario de cabecera desactualizado de `theme.ts` (identidad vieja navy/Anton).
