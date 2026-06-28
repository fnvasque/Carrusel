# SPDD Analysis: Evolutivo 3 — Migrar Quote a marca + auto-tamaño en Cta/Step

## Original Business Requirement
Pulido del sistema: (1) migrar la plantilla `Quote` (legado) al sistema visual de marca (tokens
navy/cian, fuentes Anton/Inter, legible); (2) aplicar el auto-tamaño de titular (`fitDisplaySize`)
también a los headings de `Cta` y `Step`, no solo a `Hook`. Gate: `npm run typecheck` + `npm run generate`.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **Quote** (`src/templates/Quote.tsx`): plantilla legado; usa `theme.fontSize.heading` y `theme.colors.accent`, pero la fuente la hereda de `Frame` (Inter fallback) y no usa los tokens de marca de forma explícita. Comilla gigante + cita + autor.
- **fitDisplaySize** (`src/templates/fit.ts`): hoy calibrado para Hook (max=display 132) con buckets absolutos. Para reutilizarse en Cta (max=title 96) y Step (max=heading 64) debe escalar **relativo al max**.
- **Cta** (`Cta.tsx`): título con `theme.fontSize.title` fijo. **Step** (`Step.tsx`): heading con `theme.fontSize.heading` fijo.
- **theme**: tokens y escala; `fonts.{display,body}`.

### New Concepts Required
- **fitDisplaySize generalizado**: factor de reducción por longitud aplicado a un `max` arbitrario, preservando los valores actuales de Hook.

### Key Business Rules
- **Legibilidad** (design-brand.md §1): una cita larga en Anton MAYÚS sería difícil de leer → la cita va en Inter; el acento (comilla) en cian.
- **Coherencia**: Cta/Step headings deben comportarse como el Hook (cortos grandes, largos sin recortar), a su escala.
- **No romper Hook**: el refactor de `fitDisplaySize` debe mantener idénticos los tamaños actuales del Hook.

## Strategic Approach

### Solution Direction
Generalizar `fitDisplaySize` a `round(max * factor(longitud))`, con factores calibrados para que con
`max=display(132)` devuelva exactamente los valores actuales del Hook (132/116/96/78/64). Aplicarla en
`Cta` (max=title) y `Step` (max=heading). Migrar `Quote` a tokens/fuentes de marca: comilla gigante en
cian (Anton), cita en Inter 600 legible, autor en etiqueta `label` apagada.

### Key Design Decisions
- **Factor relativo al `max`** (no buckets absolutos): trade-off = leve cambio de redondeo vs. reutilización en 3 escalas. → Recomendado: una sola heurística sirve a Hook/Cta/Step; se preservan los valores de Hook con los factores elegidos.
- **Cita en Inter, no Anton**: → legibilidad; Anton es para titulares cortos, no para frases.
- **Migración aditiva de Quote** (sin cambiar su API `quote`/`author`): → no rompe usos existentes.
- **Step/Cta: aplicar fit a su heading con su propio max**: Step→`heading`(64), Cta→`title`(96). → coherencia visual a cada escala.

### Alternatives Considered
- **Buckets absolutos por plantilla**: rechazado — duplica calibración; el factor relativo lo unifica.
- **Quote con cita en Anton**: rechazado — ilegible en frases largas.

## Risk & Gap Analysis

### Requirement Ambiguities
- **Factores exactos**: se eligen para reproducir Hook; validación visual en el gate. Registrado.

### Edge Cases
- **Headings muy cortos en Step/Cta** → factor 1.0 (tamaño máximo), deseado.
- **Cita muy larga en Quote** → Inter ajusta por line-height; `overflow:hidden` protege.
- **Regresión Hook**: cubierta por re-render de `ejemplo`/`_smoke` y comparación visual.

### Technical Risks
- **Cambio de redondeo en Hook** (p. ej. 64→63): mitigado eligiendo factores que den los valores actuales; verificación visual.
- **Aislamiento**: cambios en fit.ts (compartido) afectan Hook/Cta/Step → re-render de los tres en el gate.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | `fitDisplaySize` generalizado, Hook sin regresión | Yes | factores calibrados |
| 2 | Cta y Step usan auto-tamaño en su heading | Yes | con su propio max |
| 3 | Quote migrada a tokens/fuentes de marca, legible | Yes | cita en Inter, comilla cian |
| 4 | Gate verde + revisión visual | Yes | ejemplo + smoke + quote test |

### Decisiones tomadas autónomamente
- `fitDisplaySize(text, max)` = `round(max * factor)`; factores [≤16:1, ≤26:0.88, ≤40:0.727, ≤56:0.591, resto:0.485] (reproducen Hook).
- Quote: comilla Anton cian, cita Inter 600 (`title`/`lead`), autor `label` apagado, con auto-tamaño de la cita por longitud.
- Step usa max=heading(64); Cta usa max=title(96).
