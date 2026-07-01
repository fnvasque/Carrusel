# SPDD Analysis: Rebrand — Remix demostrativo (Iteración 3/3)

## Original Business Requirement
> ITERACIÓN 3 de 3 del rebrand: ajustar el REMIX (analyze/generateVariations) para que el CONTENIDO deje de sentirse genérico y encaje con la nueva identidad clara: copy concreto/accionable (pasos reales, ejemplos, prompts copiables), palabra clave con marcador cian/rosa, y DEJAR DE pedir fondos IA abstractos (usar la superficie de marca clara por defecto). Actualizar las reglas de marca embebidas (BRAND_RULES) y el estilo de imagen IA (BRAND_IMAGE_STYLE) a la identidad clara. Regenerar el post de NotebookLM en el estilo nuevo para validar. Gate = npm run typecheck + npm run test verdes; generate/reel/remix funcionan; tipos intactos.

## Domain Concept Identification
### Existing Concepts
- **BRAND_RULES** (`src/ai/analyze.ts`): texto embebido que guía `generateVariations`/`improveVariation`. Hoy describe la marca oscura (navy/cian/Anton, "keyword siempre cian", fondos ai navy). Debe reescribirse a la identidad clara (marcador cian/rosa, copy concreto, fondos = superficie de marca, NO ai abstracto).
- **BRAND_IMAGE_STYLE** (`src/render/background.ts`): sufijo de estilo para `gpt-image-1`. A versión clara (por si se usa ai).
- **generateVariations / improveVariation / analyzePost**: consumen BRAND_RULES; firmas intactas.
- **Plantillas (iter-2)**: ya pintan el look claro/serif/marcador; el remix solo debe alimentar copy y NO forzar fondos oscuros.
- **emit.validateDraft**: inserta Cta por defecto con handle "ia.punto.es" (ya correcto).
- **Loop de calidad (scoreCarousel)**: sigue puntuando; el copy concreto sube "Accionable".

### New Concepts Required
- Ninguno estructural. Cambios de CONTENIDO de prompts (BRAND_RULES) + estilo de imagen.

### Key Business Rules
- Copy concreto/accionable (pasos, ejemplos, prompts copiables); nada de relleno genérico.
- Marcador cian (primario) / rosa (secundario); sin "siempre cian" rígido.
- Fondos: superficie de marca clara por defecto; NO ai abstracto/objetos; a lo sumo gradient claro en portada/CTA.
- Handle ia.punto.es.
- Gate verde; tipos/firmas intactos.

## Strategic Approach
### Solution Direction
1. Reescribir `BRAND_RULES` a la identidad clara + énfasis en copy concreto/demostrativo + regla de NO usar background.ai (default superficie de marca). (HECHO en esta iteración.)
2. Actualizar `BRAND_IMAGE_STYLE` a claro. (HECHO.)
3. Regenerar el post de NotebookLM (modo manual con el caption real) y renderizar para validar que: (a) el copy es más concreto, (b) los slides usan la superficie clara, (c) se ve como los mockups c3.
4. (Opcional) Actualizar la fuente de verdad de marca (memoria/.context) a la nueva identidad — al cierre del loop.

### Key Design Decisions
- **Cambiar solo prompts/estilo (no estructura)**: → bajo riesgo, máximo efecto en "se siente genérico". Recomendado.
- **Default sin background** (superficie de marca): → coherencia visual + menos costo + menos "stock". Recomendado.
- **Validación viva con OPENAI_API_KEY**: regenerar NotebookLM. Recomendado.

### Alternatives Considered
- Insertar screenshots reales automáticos del post original: potente pero requiere pipeline de captura por slide (fuera de alcance; el primitivo Annotated queda listo para un futuro). Rechazado para esta iteración.

## Risk & Gap Analysis
### Requirement Ambiguities
- ¿Forzar Annotated en el remix? No (requiere screenshots reales). Queda el primitivo disponible. Registrar.
### Edge Cases
- El modelo igual pide background.ai pese a la regla → validateDraft/emit lo permiten pero el estilo es claro; aceptable. 
- Copy en inglés si el post es inglés → la regla de idioma (es) se mantiene.
### Technical Risks
- Cambios de texto en BRAND_RULES no afectan tipos/tests. Verificar gate.
- Validación viva depende de la API key (la provee el usuario).
### Acceptance Criteria Coverage
| AC | Desc | Addressable |
|----|------|----|
| 1 | BRAND_RULES a identidad clara + copy concreto + no-ai | Yes |
| 2 | BRAND_IMAGE_STYLE claro | Yes |
| 3 | Regenerar NotebookLM y validar visual | Yes (live) |
| 4 | Gate verde; tipos intactos | Yes |

## Decisiones tomadas autónomamente
1. Solo cambios de contenido de prompts + estilo de imagen (sin estructura).
2. Default sin background (superficie de marca clara); evitar ai abstracto.
3. Screenshots reales automáticos = futuro (Annotated queda listo); no en esta iteración.
4. Validación viva regenerando el post de NotebookLM con la key del usuario.
5. Actualizar la memoria de marca al cierre del loop.
