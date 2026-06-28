# SPDD Analysis: Evolutivo 2 — Auto-tamaño del titular Hook

## Original Business Requirement
El `Hook` usa Anton a un tamaño fijo (`display` 128px). Un titular de 6+ palabras desborda a 3 líneas y
puede recortarse. Objetivo: que el tamaño del titular se reduzca automáticamente según su longitud, para
que titulares cortos se vean enormes y los largos quepan sin recortarse, manteniendo el impacto. Permitir
override manual. Gate: `npm run typecheck` + `npm run generate`.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **Hook** (`src/templates/Hook.tsx`): titular en `<h1>` con `fontSize: theme.fontSize.display` fijo.
- **theme.fontSize** (`src/theme.ts`): escala (`display:128, title:96, heading:64, ...`).
- **CANVAS** (`types.ts`): 1080×1350; con `padding` 120, el ancho útil del titular es ~840px.

### New Concepts Required
- **fitDisplaySize(text, max)**: helper puro que devuelve un tamaño de fuente decreciente según la longitud del texto (buckets calibrados para Anton en ~840px de ancho útil).
- **`titleSize?` en HookProps**: override manual opcional (precede al auto).

### Key Business Rules
- **Impacto del Hook** (design-brand.md §1, regla de 1,5s): el titular domina; cortos = enormes.
- **No recortar**: el titular no debe desbordar el lienzo; ≤3 líneas.
- **Determinismo**: el render es por captura; el tamaño debe ser función pura del texto (sin medición DOM iterativa) para mantenerlo predecible y simple.

## Strategic Approach

### Solution Direction
Heurística por longitud de caracteres: un helper `fitDisplaySize` mapea rangos de longitud a tamaños de la
escala (calibrado para Anton, condensada, en ~840px útiles). `Hook` usa `titleSize ?? fitDisplaySize(title)`.
Es determinista, sin medición iterativa, y suficiente para las reglas de copy (≤9 palabras).

### Key Design Decisions
- **Heurística por caracteres (no medición DOM)**: trade-off = no es pixel-perfect vs. simple, puro y predecible. → Recomendado: el copy de marca acota la longitud; los buckets cubren el rango real. Evita complejidad de auto-fit por binary-search en el navegador.
- **Override `titleSize?`**: → da control fino cuando el autor lo necesite (mismo patrón que el antiguo Cover).
- **Helper reutilizable en `src/templates/fit.ts`**: → lo puede usar también `Cta` a futuro sin duplicar.
- **Buckets calibrados a Anton/840px**: ≤16→132, ≤26→116, ≤40→96, ≤56→78, resto→64. → Calibrados con los titulares reales (ejemplo 34, smoke 37 → ~96px, 2 líneas).

### Alternatives Considered
- **Auto-fit real midiendo en el navegador** (reducir hasta que quepa): rechazado — complejo, requiere medir en `renderSlide`, acopla layout y render; innecesario dado el copy acotado.
- **Reducir por nº de palabras**: rechazado — caracteres correlaciona mejor con el ancho ocupado.

## Risk & Gap Analysis

### Requirement Ambiguities
- **Calibración exacta de buckets**: aproximada; se valida visualmente con titulares corto/medio/largo en el gate. Decisión registrada con valores iniciales, ajustables.

### Edge Cases
- **Titular muy largo (>56 chars)**: cae a 64px; si aún desbordara, el copy excede las reglas de marca (≤9 palabras) — fuera de contrato, pero `overflow:hidden` evita romper el layout.
- **Titular de 1-2 palabras**: 132px, máximo impacto (deseado).
- **`titleSize` explícito**: ignora la heurística.

### Technical Risks
- **Buckets mal calibrados** → titulares apretados o con demasiado aire. Mitigación: validación visual en el gate; valores fáciles de ajustar en un solo lugar.
- **Afecta solo a Hook**: cambio aislado; no toca otras plantillas. Bajo riesgo.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | El titular del Hook reduce su tamaño según longitud | Yes | helper fitDisplaySize |
| 2 | Override manual `titleSize` | Yes | precede al auto |
| 3 | Titulares cortos grandes / largos sin recortar | Yes | validación visual |
| 4 | Gate verde | Yes | typecheck + generate |

### Decisiones tomadas autónomamente
- Heurística por caracteres con buckets (no medición DOM).
- Helper en `src/templates/fit.ts`, reutilizable.
- Buckets iniciales: ≤16→132, ≤26→116, ≤40→96, ≤56→78, resto→64.
- `titleSize?` override en HookProps.
