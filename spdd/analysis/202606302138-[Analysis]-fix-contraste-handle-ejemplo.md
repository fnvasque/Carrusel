# SPDD Analysis: Fix de contraste (fondos oscuros) y handle en el carrusel gold-standard

## Original Business Requirement

Iteración 1/2 (dentro de /spdd-loop). Corregir la causa raíz de dos defectos visuales en el carrusel gold-standard del proyecto carrusel (generador de carruseles IG, TypeScript).

Defectos reportados por el usuario (evidencia en `output/ejemplo/slide-01.png`, `slide-02.png`, `slide-06.png`):
1. **Contraste**: las slides Hook (slide-01) y Cta (slide-06) se renderizan con fondo OSCURO navy + texto tinta oscuro (#0B1020), quedando ilegibles; solo se lee el resaltado cian. La slide Lead (slide-02) usa correctamente el fondo CREMA claro (#FBFAF7) del rebrand 2026-06. Hay que alinear Hook y Cta a la superficie clara igual que slide-02.
2. **Handle**: slide-06 (Cta) muestra "@ia.es" cuando el handle correcto de la marca es "@ia.punto.es" (ya se había corregido antes y regresó).

Alcance de esta iteración: SOLO la corrección de causa raíz (la prevención estructural va en la iteración 2).

## Domain Concept Identification

### Existing Concepts (from codebase)
- **CarouselSpec / SlideSpec** (`carousels/ejemplo.ts`, `src/templates/types.ts`): un carrusel = lista de slides `{ template, props }`. El gold-standard `ejemplo.ts` es la plantilla que el usuario copia; sus defectos se propagan.
- **Background** (`src/templates/types.ts`): fondo por slide (`color` | `gradient` | `image` | `ai`). Es opcional; cuando está presente, `Frame` lo respeta tal cual.
- **Frame** (`src/templates/Frame.tsx`): capa base de todo slide. Regla clave (líneas 61-64): `backgroundColor: theme.colors.bg` + si NO hay `background` pinta `brandSurfaceStyle` (superficie crema); si HAY `background`, pinta `backgroundStyle(background)`. El color de texto es SIEMPRE `color ?? theme.colors.text` (tinta oscura #0B1020).
- **theme** (`src/theme.ts`): tokens de la identidad CLARA (rebrand): `bg #FBFAF7`, `text #0B1020`, `accent #22D3EE`. No existe una constante de "handle" de marca (está hardcodeado en la plantilla y en el remix).
- **Cta** (`src/templates/Cta.tsx`): default del handle correcto en línea 73 (`@{handle ?? "ia.punto.es"}`).
- **Wordmark** (`src/templates/Frame.tsx:85`): logo arriba-izquierda `ia.es` (con punto cian). Es el WORDMARK de marca, correcto — distinto del handle de cuenta `@ia.punto.es`. NO debe tocarse.

### New Concepts Required
- Ninguno en esta iteración. Es una corrección de datos del carrusel de ejemplo; no introduce conceptos.

### Key Business Rules
- **Legibilidad = contraste**: como el texto es tinta oscura fija, el fondo de un slide DEBE ser claro (superficie de marca). Un `background` oscuro rompe el contraste. Gobierna: `ejemplo.ts` (y cualquier CarouselSpec) vs `Frame`/`theme`.
- **Identidad clara post-rebrand**: la superficie por defecto es crema; el navy es identidad descartada (memoria `marca-ia-espanol`). Gobierna: `ejemplo.ts` como pieza de referencia.
- **Handle único de marca = "ia.punto.es"**; el wordmark "ia.es" es otra cosa. Gobierna: la prop `handle` del Cta.

## Strategic Approach

### Solution Direction
Corrección puntual de DATOS en `carousels/ejemplo.ts` (no de plantillas ni theme, que ya están correctos):
1. Eliminar la prop `background` (gradiente navy) de los slides Hook y Cta → `Frame` pinta la superficie crema, igual que Lead. Data flow: `ejemplo.ts` (sin background) → `Frame.brandSurfaceStyle` → crema.
2. Corregir `handle: "ia.es"` → `"ia.punto.es"` en el Cta (mantener la prop explícita y correcta; el default de la plantilla ya es correcto, pero dejarla explícita documenta la intención en la pieza de referencia).
3. Actualizar el comentario de cabecera desactualizado (líneas 12-17) a la identidad clara (superficie crema por defecto; ejemplos de override solo para `ai`/`image` con scrim claro, no navy).
4. Verificación: `npm run generate carousels/ejemplo.ts` + inspección visual de slide-01/06 (crema, legible, `@ia.punto.es`).

### Key Design Decisions
- **Quitar el `background` en vez de reemplazarlo por un `color` crema explícito**: → recomendado quitarlo. Trade-off: menos código y aprovecha `brandSurfaceStyle` (glow + grilla + grano), que un `{ color: "#FBFAF7" }` plano no da. Deja Hook/Cta idénticos a Lead.
- **Mantener `handle` explícito y correcto vs. quitarlo para usar el default**: → mantenerlo explícito con el valor correcto. Trade-off: como `ejemplo.ts` es la pieza que se copia, mostrar el handle correcto explícito enseña la convención; quitarlo lo escondería.
- **No tocar plantillas/theme en esta iteración**: la causa raíz de ESTOS defectos son datos de `ejemplo.ts`. El endurecimiento estructural (guard anti-fondo-oscuro + constante de handle) es la iteración 2 por diseño del loop.

### Alternatives Considered
- **Hacer que `Frame` ignore fondos oscuros ahora**: rechazado para esta iteración — es prevención estructural (iteración 2), cambia comportamiento global y merece su propio canvas/tests.
- **Cambiar el default de texto a claro cuando el fondo es oscuro**: rechazado — contradice la identidad clara (no queremos habilitar slides oscuros; queremos impedirlos).

## Risk & Gap Analysis

### Requirement Ambiguities
- "Alinear tal como slide-02": interpretado como "misma superficie de marca crema" (quitar background), no como copiar la plantilla Lead. Confirmado por la evidencia visual.

### Edge Cases
- **Reel export** (`npm run reel`): `ejemplo.ts` también alimenta el Reel 9:16; quitar el background beneficia igual al Reel (fondo claro consistente). Sin riesgo adicional.
- **Fondos `ai`/`image` legítimos**: esta corrección NO elimina el soporte de fondos con imagen (que llevan scrim claro en `Frame.scrimLayer`); solo quita el gradiente navy plano del ejemplo.

### Technical Risks
- **Regresión silenciosa (por qué volvió el handle)**: el defecto ya se había corregido antes y reapareció → indica falta de guard/test. Mitigación: la iteración 2 añade prevención. En esta iteración, riesgo bajo: cambio de datos verificable visualmente y por el gate.
- **Gate sin cobertura visual**: `npm run typecheck` + `npm run test` NO detectan contraste ni handle hoy. Mitigación en iteración 2 (guard/test). En iteración 1 la verificación es la inspección del PNG re-renderizado.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Hook (slide-01) queda crema/legible como slide-02 | Yes | Quitar `background` navy del Hook |
| 2 | Cta (slide-06) queda crema/legible como slide-02 | Yes | Quitar `background` navy del Cta |
| 3 | Cta muestra `@ia.punto.es` | Yes | `handle: "ia.es"` → `"ia.punto.es"` |
| 4 | Comentario de cabecera refleja la identidad clara | Yes | Reescribir líneas 12-17 |
| 5 | Gate verde (typecheck + test) | Yes | Cambio de datos, sin impacto de tipos/tests |
| 6 | Wordmark `ia.es` (Frame) intacto | Yes | Fuera de alcance; no se toca `Frame.tsx` |

## Decisiones tomadas autónomamente
- Mantener la prop `handle` explícita (valor correcto) en lugar de eliminarla, por el rol didáctico del gold-standard.
- Quitar `background` (no sustituir por color plano) para heredar la superficie de marca completa.
- No modificar plantillas/theme en esta iteración; la prevención estructural es la iteración 2 (según el plan del loop).
