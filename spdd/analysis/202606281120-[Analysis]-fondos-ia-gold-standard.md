# SPDD Analysis: Iteración 3 — Fondos IA con estilo de marca + carrusel gold-standard + README

## Original Business Requirement
Iteración 3 (cierre) del plan `.context/00-plan-mejora.md`:
1. Anexar automáticamente el sufijo `[ESTILO MARCA]` (design-brand.md §6) a los prompts de fondo `{ ai }`
   antes de llamar a gpt-image-1, con opción de desactivarlo.
2. Reescribir `carousels/ejemplo.ts` como un carrusel gold-standard real (pilar Noticia) usando las
   plantillas nuevas (Hook/Lead/Step/Cta...) y el copy del entregable 02, renderizable sin API key.
3. Actualizar `README.md` con las plantillas nuevas, tokens de marca, pilares y el estilo de fondos IA.
Gate: `npm run typecheck` + `npm run generate carousels/ejemplo.ts`.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **Background** (`src/templates/types.ts`): unión con la variante `{ ai: string; overlay?: number }`. Punto donde añadir `brandStyle?: boolean`.
- **resolveBackground** (`src/render/background.ts`): resuelve `{ ai }` llamando a `generateBackground(bg.ai)`. Único lugar por donde pasa todo prompt de IA → aquí se anexa el sufijo.
- **generateBackground** (`src/ai/openaiImage.ts`): cliente gpt-image-1 con caché por hash de (prompt+size+quality). Anexar el sufijo ANTES de esta llamada hace que la caché distinga prompts con/sin marca (correcto).
- **CarouselSpec / templates** (`index.ts`): las 6 plantillas nuevas + Cover/Bullet/Quote. `ejemplo.ts` se reescribe consumiéndolas.
- **README.md**: documentación; estructura por secciones (cómo funciona, plantillas, fondos, estructura, roadmap).

### New Concepts Required
- **BRAND_IMAGE_STYLE**: constante con el sufijo de estilo de marca (sin flags de Midjourney, que no aplican a gpt-image-1).
- **applyBrandStyle(prompt, enabled)**: helper que concatena el sufijo salvo que `enabled === false`.
- **Gold-standard carousel**: `ejemplo.ts` como pieza de referencia viva (pilar Noticia, 6-7 slides, copy real).

### Key Business Rules
- **Consistencia visual de fondos IA**: todo fondo IA hereda el look navy + cyan rim light por defecto (design-brand.md §6).
- **Caché correcta**: el sufijo se anexa antes del hash → no colisiona con prompts sin marca.
- **Gold-standard sin API key**: el ejemplo debe renderizar en el gate sin `OPENAI_API_KEY` (fondos navy/gradiente; un fondo IA queda comentado como demostración).
- **Compatibilidad**: el cambio de `Background` es aditivo (`brandStyle?` opcional, default true).

## Strategic Approach

### Solution Direction
Interceptar el prompt en la capa de resolución (`background.ts`): cuando el fondo es `{ ai }`, anexar el
sufijo de marca salvo opt-out (`brandStyle:false`). Mantener la caché correcta anexando antes del hash.
Reescribir `ejemplo.ts` como gold-standard usando las plantillas nuevas con fondos navy por defecto (un
fondo IA comentado para demostrar el sufijo). Actualizar el README para reflejar el nuevo sistema.

### Key Design Decisions
- **Anexar el sufijo en `resolveBackground`** (no en `generateBackground`): trade-off = `generateBackground` queda como cliente "tonto" reutilizable vs. la lógica de marca vive en la capa de render. → Recomendado: separa el cliente de API de la política de marca; un único punto de paso.
- **`brandStyle?: boolean` en la variante `{ ai }`** (default true): → opt-out explícito para fondos que no quieran el look de marca, sin romper los existentes.
- **Constante + helper en `background.ts`** (o `src/ai/brandStyle.ts`): → centraliza el texto del sufijo; fácil de ajustar.
- **Gold-standard renderizable sin API**: fondos `{}`/navy y gradiente; el fondo `{ ai }` va comentado con instrucciones. → El gate no depende de la red ni de la API key.
- **Sin flags de Midjourney** (`--ar/--sref/--s`): no aplican a gpt-image-1; el aspecto lo fija el lienzo. → Evita prompt contaminado.

### Alternatives Considered
- **Sufijo dentro de `generateBackground`**: rechazado — acopla el cliente de API a la marca y complica su reutilización/*testing*.
- **Sufijo manual en cada prompt del carrusel**: rechazado — es justo el olvido que la automatización elimina (consistencia).

## Risk & Gap Analysis

### Requirement Ambiguities
- **Texto exacto del sufijo**: se toma literal de design-brand.md §6 quitando los flags MJ. Decisión registrada.
- **overlay por defecto en fondos IA**: el autor lo define por slide; el gold-standard usa overlay donde haya texto sobre imagen.

### Edge Cases
- **`{ ai }` con `brandStyle:false`** → prompt del usuario tal cual (sin sufijo).
- **Caché previa**: prompts cacheados antes de esta iteración (sin sufijo) no se reutilizan para prompts con sufijo (hash distinto) — comportamiento correcto, no bug.
- **Gold-standard sin API key**: si alguien descomenta el fondo IA sin key, `generateBackground` lanza error claro (ya existente). Documentar.

### Technical Risks
- **Cambio del contrato Background**: aditivo y opcional; `typecheck` lo verifica. Las plantillas no leen `brandStyle` (lo consume `background.ts`), sin impacto en componentes.
- **README desactualizado vs. código**: mitigación: actualizarlo en la misma iteración y verificar comandos citados.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Sufijo [ESTILO MARCA] anexado a fondos `{ai}`, con opt-out | Yes | en `resolveBackground` |
| 2 | Caché correcta (hash con sufijo) | Yes | se anexa antes del hash |
| 3 | `ejemplo.ts` gold-standard con plantillas nuevas, render sin API | Yes | fondos navy/gradiente |
| 4 | README actualizado (plantillas, tokens, pilares, fondos IA) | Yes | — |
| 5 | Gate verde | Yes | typecheck + generate ejemplo |

### Decisiones tomadas autónomamente
- Sufijo anexado en `resolveBackground`; constante+helper centralizados.
- `brandStyle?: boolean` (default true) en la variante `{ ai }`.
- Gold-standard = pilar Noticia, fondos navy/gradiente; fondo IA comentado.
- Sin flags de Midjourney en el sufijo.
