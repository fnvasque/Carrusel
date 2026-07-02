# SPDD Analysis: Reencuadre a la audiencia (Andrea) como paso del proceso de remix

## Original Business Requirement

Iteración 1/2 (dentro de /spdd-loop). Incluir en el PROCESO de generación del remix el reencuadre al ángulo de la audiencia de la marca (persona "Andrea").

Contexto (aprendido probando 2 posts reales): hoy `generateVariations` toma el análisis del post fuente y lo "transforma" mapeándolo a plantillas, pero NO reencuadra el tema al mundo de Andrea. El resultado son variaciones fieles al post original (a menudo técnico / para otro público) que el gate de VALOR (evaluador persona Andrea, `evaluate.ts`) luego rechaza por desajuste de audiencia — y en 3 intentos no se recupera porque arrancó del marco equivocado. Ejemplo real: un post de "6 Claude skills para diseño" produjo variaciones con valor 43/51 (Andrea: "no aplicable a mi rol en marketing").

Decisión del usuario (AskUserQuestion): **paso de ángulo + persona en la generación** — derivar un "ángulo para Andrea" del análisis (qué hace un/a marketer de pyme con este tema) y escribir TODAS las variaciones desde ahí. (NO se pidió lógica de "abortar si no hay ángulo".)

Alcance de esta iteración: el cambio de generación. La verificación con los 2 posts es la iteración 2.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **PostAnalysis** (`src/remix/types.ts`): salida del análisis del post (hook, narrative, copyPerSlide, pillar…). Insumo del ángulo.
- **generateVariations / improveVariation** (`src/ai/analyze.ts`): generan/corrigen variaciones con BRAND_RULES + catálogo. NO incluyen la persona ni un ángulo de audiencia.
- **ANDREA** (`src/ai/evaluate.ts:69`): persona objetivo, HOY usada solo por el evaluador de valor (`evaluateAudienceValue`). Insight central: el generador debe escribir para la MISMA persona con la que juzga el gate. Debe pasar a ser fuente única compartida.
- **Gate de valor** (`evaluate.ts`): puntúa Claridad-30s / Aplicable-hoy / Sin-hype / Relevancia / Guardar. El ángulo ataca directamente Aplicable-hoy y Relevancia.
- **Loop de calidad** (`src/remix/cli.ts`): genera → 3 gates → si falla, `improveVariation` con feedback combinado. El ángulo debe inyectarse tanto en la generación inicial como en la mejora.

### New Concepts Required
- **AudienceAngle**: el reencuadre del tema al mundo de Andrea — `{ angle, jobToBeDone, useCases[], drop[] }`. Derivado del análisis por un paso LLM previo a la generación.
- **persona compartida**: `ANDREA` como constante única (nuevo `src/ai/persona.ts`) importada por generación y evaluación.

### Key Business Rules
- Toda variación se escribe DESDE el ángulo de Andrea: reencuadra el tema a su trabajo (marketing en pyme), no traduce el post original tal cual.
- El generador y el evaluador comparten la MISMA persona (una sola fuente de verdad).
- Cada slide de desarrollo responde "¿cómo lo aplico HOY en mi trabajo?" con ejemplos/prompts en contexto de marketing de pyme.

## Strategic Approach

### Solution Direction
1. Extraer `ANDREA` a `src/ai/persona.ts` (fuente única) + definir `AudienceAngle` + un formateador puro `formatAngle(angle)` para el prompt. `evaluate.ts` importa `ANDREA` desde ahí.
2. `deriveAudienceAngle(analysis, {es})` en `analyze.ts`: paso LLM previo que produce el `AudienceAngle` (system = editor de ia.es + `ANDREA`; user = análisis → ángulo/job/casos/drop). Si el tema es técnico/para otro público, lo reencuadra a la aplicación más útil para Andrea.
3. `generateVariations(analysis, {es, count, angle})` e `improveVariation(…, {es, angle})`: inyectan `ANDREA` + `formatAngle(angle)` y el mandato de escribir desde el ángulo.
4. `remix/cli.ts`: tras `analyzePost`, `deriveAudienceAngle`, loguear el ángulo, y pasarlo a generación y mejora.

Data flow: `analyzePost → deriveAudienceAngle → generateVariations(desde el ángulo) → [3 gates] → improveVariation(desde el ángulo) → emit`.

### Key Design Decisions
- **Paso de ángulo separado (una llamada LLM) vs. solo instrucción en el prompt**: → paso separado (elegido por el usuario). Trade-off: +1 llamada por remix (barato, 1 sola vez, no por variación); beneficio: un reencuadre explícito y consistente que ancla ambas variaciones y la mejora.
- **Persona como fuente única compartida** (`persona.ts`): → generador y juez usan el MISMO texto. Trade-off: refactor menor; beneficio: elimina la deriva entre "para quién escribo" y "quién juzga".
- **`angle` opcional en las firmas**: → retrocompatible; si no se pasa (p.ej. tests, otros callers), el comportamiento es el actual.
- **NO abortar si el tema no encaja**: el usuario eligió reencuadrar siempre (no la opción de skip). El ángulo hace su mejor esfuerzo de reencuadre.

### Alternatives Considered
- **Solo inyectar la persona en los prompts (sin paso de ángulo)**: descartado por el usuario; menos consistente entre variaciones.
- **Derivar el ángulo por variación**: descartado — más caro y las 2 variaciones deben compartir el mismo reencuadre (distinto ángulo de hook, mismo público).

## Risk & Gap Analysis

### Requirement Ambiguities
- "Ángulo para Andrea": operacionalizado como `{ angle, jobToBeDone, useCases[], drop[] }`. `useCases` en contexto de marketing de pyme.

### Edge Cases
- **Tema muy técnico/ajeno** (ej. skills de diseño): el ángulo lo reencuadra a la aplicación más cercana para Andrea (ej. "cómo un/a marketer usa estas capacidades para sus piezas"); no aborta.
- **`deriveAudienceAngle` falla / API caída**: degradar a `undefined` (generación sin ángulo = comportamiento actual), sin romper el flujo.
- **Sin OPENAI_API_KEY**: el remix ya requiere key antes de este paso (analyze). Sin cambios.

### Technical Risks
- **+1 llamada LLM por remix**: costo bajo (1 vez, no por variación/intento). Aceptable.
- **Prompt más largo**: dentro de límites; el ángulo es compacto.
- **Tests sin red**: `deriveAudienceAngle`/generación son LLM; se cubre con un test PURO de `formatAngle` + que `ANDREA` es compartida. Verificación real end-to-end en la iteración 2 (con los 2 posts).

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | `ANDREA` es fuente única (persona.ts) usada por generación y evaluación | Yes | mover const, import en evaluate.ts |
| 2 | `deriveAudienceAngle(analysis)` produce el ángulo | Yes | nueva fn LLM en analyze.ts |
| 3 | `generateVariations` escribe desde el ángulo + persona | Yes | opts.angle + inyección |
| 4 | `improveVariation` mantiene el ángulo | Yes | opts.angle + inyección |
| 5 | `remix/cli.ts` deriva y pasa el ángulo (y lo loguea) | Yes | thread del angle |
| 6 | Gate verde (typecheck + test) + test puro de formatAngle | Yes | +test smoke |
| 7 | Degradable si el ángulo falla | Yes | try/catch → undefined |

## Decisiones tomadas autónomamente
- `AudienceAngle = { angle, jobToBeDone, useCases[], drop[] }`.
- `ANDREA` se mueve a `src/ai/persona.ts` (fuente única) e `evaluate.ts` la importa.
- `formatAngle` como helper puro (testeable) usado por generación y mejora.
- `angle` opcional (retrocompat); `deriveAudienceAngle` degradable a `undefined`.
- El ángulo se deriva UNA vez por remix (compartido por ambas variaciones), no por variación.
