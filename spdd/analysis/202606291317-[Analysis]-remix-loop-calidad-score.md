# SPDD Analysis: Remix de IG — loop de calidad ≥ umbral (Tanda 2 · Iteración 1/3)

## Original Business Requirement

> Loop de calidad ≥75: re-prompt iterativo con las sugerencias del scoreCarousel hasta que cada variación pase el umbral (garantiza el gate de saves/shares). Parte del "remix de Instagram"; debe integrarse al flujo `npm run remix` antes de emitir/renderizar, reutilizando `scoreCarousel`/`THRESHOLD` y el modelo de `analyze.ts`. typecheck verde como gate; sin romper generate/reel/remix.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **scoreCarousel / THRESHOLD / ViralityResult** (`src/score/virality.ts`): el gate de viralidad (umbral 75) con `suggestions[]` por dimensión. Es la señal que guía el re-prompt. Reutilizable tal cual.
- **VariationDraft / LogicalSlide / TemplateName** (`src/remix/types.ts`): la unidad que produce el modelo y que se valida/emite. El loop opera sobre `VariationDraft` en memoria.
- **generateVariations(analysis, opts)** (`src/ai/analyze.ts`): genera N drafts. El loop necesita un compañero que MEJORE un draft dado con feedback del score.
- **validateDraft(draft)** (`src/remix/emit.ts`): normaliza/garantiza Hook+Cta+props+index/total; debe correr ANTES de puntuar para que el score sea fiel a lo que se emitirá.
- **scoreCarousel espera un `CarouselSpec`** con `slides[].template` = componente React y `props`. Hoy el cli puntúa importando el `.ts` ya emitido; para iterar en memoria hace falta convertir un `VariationDraft` → `CarouselSpec` sin escribir a disco.
- **TEMPLATE_CATALOG / isTemplateName** (`src/remix/templates-catalog.ts`): whitelist de plantillas; base para el mapa nombre→componente.
- **Plantillas** (`src/templates/index.ts`): los componentes (`Hook`, `Lead`, …) que `draftToSpec` necesita referenciar.
- **CLI remix** (`src/remix/cli.ts`): hoy emite y LUEGO puntúa importando el archivo. Debe puntuar/iterar ANTES de emitir, y emitir el mejor resultado.

### New Concepts Required

- **draftToSpec(draft) → CarouselSpec** (nuevo, `src/remix/registry.ts`): mapea `VariationDraft` validado a un `CarouselSpec` en memoria (nombre de plantilla → componente) para puntuarlo sin escribir archivo.
- **scoreDraft(draft) → ViralityResult** (nuevo): `scoreCarousel(draftToSpec(validateDraft(draft)))`.
- **improveVariation(analysis, draft, suggestions, opts) → VariationDraft** (nuevo, en `analyze.ts`): re-prompt al modelo con el draft actual + las sugerencias del score + reglas de marca, pidiendo corregir esas debilidades específicas y devolver un draft mejorado.
- **Loop de calidad** (orquestación en `cli.ts`): por cada variación, iterar validate→score; si `< minScore` y quedan intentos, `improveVariation`; quedarse con el mejor draft; emitir ese.

### Key Business Rules

- **Objetivo de calidad = THRESHOLD (75)** por defecto, configurable (`--min-score=N`).
- **Tope de intentos** para acotar coste/latencia (`--max-tries=N`, default 3). Si no se alcanza, emitir el mejor y advertir (no bloquear, consistente con `cli.ts`/`generate`).
- **Puntuar lo que se emitirá**: validar antes de puntuar; el score in-memory debe coincidir con el del `.ts` final.
- **Feedback dirigido**: el re-prompt usa las `suggestions` concretas del score (hook sin número/enemigo/bucle, falta reframe/CTA de guardar, etc.), no un "mejóralo" genérico.
- **No romper aguas abajo**: emit/render/reel intactos; el loop es una etapa previa.

## Strategic Approach

### Solution Direction

Insertar un loop de mejora ENTRE generación y emisión:

```
generateVariations → [por variación]:
   draft = validateDraft(draft)
   for intento in 1..maxTries:
       r = scoreDraft(draft)
       if r.total >= minScore: break
       draft = validateDraft( await improveVariation(analysis, draft, r.suggestions, opts) )
   quedarse con el draft de mayor score visto
   emitCarouselFile(mejor) (+ render/reel si flags)
```

- **`src/remix/registry.ts`**: `TEMPLATE_COMPONENTS: Record<TemplateName, ComponentType>` (import desde `templates/index.ts`); `draftToSpec(draft): CarouselSpec` que arma slides `{ template: componente, props: { ...logicalProps, pillar } }` y `defaults.pillar`. Solo para puntuar (el background no afecta el score).
- **`scoreDraft(draft)`**: valida y puntúa en memoria.
- **`improveVariation` en `analyze.ts`**: misma estructura que `generateVariations` (catálogo + reglas de marca + idioma), pero recibe el draft fallido y las sugerencias, y pide UNA variación mejorada que conserve el ángulo. `response_format json_object`, normalizada con el `normalizeVariations` existente.
- **`cli.ts`**: reemplazar "emit→score" por "loop de calidad→emit del mejor". Mantener los flags y el render/reel. Nuevos flags `--min-score=N`, `--max-tries=N`, `--no-improve`.

### Key Design Decisions

- **Puntuar en memoria con `draftToSpec`** (vs. emitir y re-importar en cada intento): → evita escribir/borrar archivos por intento y acelera el loop; el score es idéntico porque usa el mismo `scoreCarousel`. Recomendado. Trade-off: mantener un mapa nombre→componente (pequeño, ya acotado por el catálogo).
- **Quedarse con el mejor draft visto** (vs. el último): → un intento de mejora podría empeorar; guardar el máximo protege la calidad. Recomendado.
- **Feedback dirigido con `suggestions`** (vs. re-generar a ciegas): → el score ya dice exactamente qué falta; inyectarlo sube la tasa de éxito por intento. Recomendado.
- **Tope de intentos + no bloquear** (vs. loop infinito / hard-fail): → acota coste y respeta el patrón actual (advertir, no abortar). Recomendado.
- **Loop activado por defecto, desactivable** (`--no-improve`): → la calidad es el objetivo declarado del producto; permitir apagarlo para pruebas rápidas/sin coste. Recomendado.

### Alternatives Considered

- **Subir el `count` y elegir la mejor de muchas** (sin re-prompt dirigido): descartado como única estrategia — más caro y sin corregir debilidades concretas; el re-prompt dirigido es más eficiente (se puede combinar a futuro).
- **Endurecer `generateVariations` para que salga ≥75 a la primera**: insuficiente — el modelo no siempre acierta; el loop con feedback es el mecanismo de garantía.
- **Mover el score dentro de `emit`**: rompe la separación (emit serializa; score evalúa); mejor un `scoreDraft` aparte.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Umbral configurable**: default = `THRESHOLD` (75); `--min-score` lo sobreescribe. Registrar.
- **Intentos máximos**: default 3; `--max-tries`. Registrar.
- **Qué pasa si nunca alcanza el umbral**: emitir el mejor draft visto + warning; no abortar. Registrar.
- **¿Aplica a ambas variaciones?**: sí, a cada una por separado. Registrar.

### Edge Cases

- **improveVariation devuelve algo peor o inválido**: validar siempre; comparar score; conservar el mejor. Si devuelve vacío, mantener el draft previo.
- **Sin OPENAI_API_KEY**: `generateVariations` ya falla antes; el loop solo corre si hubo generación. `improveVariation` usa el mismo cliente (misma precondición).
- **Modelo entra en bucle de cambios cosméticos sin subir score**: el tope de intentos corta; se emite el mejor.
- **draftToSpec con plantilla fuera del catálogo**: `validateDraft` ya filtra; `draftToSpec` solo ve plantillas válidas.
- **Score ya ≥ umbral al primer intento**: 0 llamadas extra (break inmediato).
- **`--no-improve`**: comportamiento = tanda anterior (emitir y puntuar, sin iterar).

### Technical Risks

- **Coste/latencia** (hasta `maxTries` llamadas por variación): mitigación: break temprano, tope bajo (3), feedback dirigido (sube éxito por intento), `--no-improve`.
- **Mapa nombre→componente desincronizado** con `index.ts`: mitigación: derivarlo del mismo set del catálogo; typecheck obliga a que los componentes existan.
- **Score in-memory ≠ score del .ts emitido**: mitigación: ambos usan `scoreCarousel` sobre el mismo draft validado → idénticos.
- **Regresión del flujo**: mitigación: el render/reel y emit no cambian; verificar con el smoke carousel y el path manual.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Puntuar cada variación con scoreCarousel | Yes | `scoreDraft` in-memory |
| 2 | Re-prompt iterativo con las sugerencias del score | Yes | `improveVariation` con `suggestions` |
| 3 | Iterar hasta pasar el umbral (o tope de intentos) | Yes | Loop con break; `--max-tries` |
| 4 | Umbral/objetivo configurable | Yes | `--min-score`, default THRESHOLD |
| 5 | Emitir el mejor resultado, no bloquear si no llega | Yes | Conservar máximo + warning |
| 6 | Desactivable | Yes | `--no-improve` |
| 7 | typecheck verde; generate/reel/remix intactos | Yes | Cambios acotados a remix/analyze + registry |

## Decisiones tomadas autónomamente

1. **`draftToSpec` en `src/remix/registry.ts`** con mapa nombre→componente, para puntuar en memoria sin escribir archivos.
2. **`scoreDraft` = scoreCarousel(draftToSpec(validateDraft(draft)))**.
3. **`improveVariation` en `analyze.ts`**, re-prompt dirigido con las `suggestions` del score, conservando el ángulo; normalizado con el helper existente.
4. **Loop por variación**: validate→score→improve, hasta `--min-score` (default 75) o `--max-tries` (default 3); se emite el **mejor** draft visto.
5. **`--no-improve`** desactiva el loop (comportamiento previo).
6. **No bloquear** si no alcanza el umbral: emitir el mejor + warning (consistente con `generate`).
7. **Background irrelevante para el score**: `draftToSpec` no resuelve fondos `ai` (solo para puntuar).
