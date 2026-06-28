# SPDD Analysis: Iteración 2 — Plantillas de marca (Hook, Step, Prompt, Cta, Lead, MythReality)

## Original Business Requirement
Iteración 2 del plan `.context/00-plan-mejora.md`. Crear las 6 plantillas de slide que materializan
los roles definidos en `.context/01-social-anatomia.md` y el sistema visual de `.context/design-brand.md`,
usando la fundación de la iteración 1 (tema navy+cian, fuentes Anton/Inter/JetBrainsMono, `Frame` con
logo/chip/progreso/fuente). Plantillas: `Hook` (portada stop-scroll, titular Anton dominante con 1-2
palabras en cian, "DESLIZA →" solo aquí), `Step` (paso numerado con progreso), `Prompt` (bloque de
prompt copiable en mono, pilar Prompt), `Cta` (funnel al newsletter), `Lead` (promesa en 1 frase),
`MythReality` (dos bloques EL MITO / LA REALIDAD). Exportarlas en `src/templates/index.ts`. Gate:
`npm run typecheck` + `npm run generate`.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **Frame** (`src/templates/Frame.tsx`): capa base; ya pinta logo/chip de pilar/progreso/fuente. Las plantillas envuelven su contenido en `<Frame {...base}>` y heredan esos elementos de marca.
- **theme + pillarColor** (`src/theme.ts`): tokens y escala (`display/title/heading/kicker/code/lead/body/label`), `fonts.{display,body,mono}`.
- **BaseSlideProps / Pillar** (`types.ts`): contrato compartido (background, pillar, index, total, source, showLogo, accent, color, fontFamily).
- **Cover/Bullet/Quote**: plantillas actuales; sirven de referencia de estilo. Se conservan (compatibilidad), las nuevas conviven con ellas.
- **index.ts**: barrel de exports; añadir las 6 nuevas plantillas y sus *Props.

### New Concepts Required
- **Hook/Step/Prompt/Cta/Lead/MythReality**: componentes React (`ComponentType<P>`), cada uno con su interfaz `*Props extends BaseSlideProps`.
- **Resaltado en cian**: mecanismo para pintar 1-2 palabras del titular en `accent` (prop `highlight?: string` que parte el título).
- **Swipe hint**: indicador "DESLIZA →" exclusivo de `Hook` (prop `swipe?: boolean`, default true).

### Key Business Rules
- **Titular en Anton MAYÚSCULAS**; cuerpo en Inter; prompt en JetBrainsMono (design-brand.md §3).
- **Palabra clave del titular SIEMPRE en cian** (60-30-10); el resto del acento es ≤10%.
- **"DESLIZA →" solo en la portada** (Hook), nunca en otros slides (§4).
- **Cta = funnel al newsletter** (objetivo de negocio), no "sígueme".
- **1 idea por slide**; densidad de texto decreciente.

## Strategic Approach

### Solution Direction
Seis componentes presentacionales puros, cada uno envolviendo `<Frame {...base}>` y componiendo texto con
los tokens del tema. Sin estado, sin I/O. Reutilizan los elementos de marca de `Frame` (logo/chip/progreso)
pasándole las props base; cada plantilla solo dibuja su contenido central. El resaltado en cian se resuelve
partiendo el string del titular por la subcadena `highlight`.

### Key Design Decisions
- **Plantillas como funciones puras que envuelven Frame** (patrón existente Cover/Bullet/Quote). → Mínima sorpresa, máxima reutilización del logo/chip ya implementados.
- **Resaltado cian vía `highlight?: string`** (parte el título y envuelve la coincidencia en `<span color=accent>`): trade-off = no soporta múltiples resaltados arbitrarios vs. simplicidad. → Suficiente para "1-2 palabras"; si no hay coincidencia, render plano.
- **Anton siempre uppercase**: aplicar `textTransform:"uppercase"` en plantillas de titular (Hook/Step/Cta/MythReality headings). → Anton es display y se diseñó para mayúsculas.
- **Prompt usa `panel` + mono**: el texto copiable va en bloque `theme.colors.panel` con `fonts.mono`, con label "COPIA ESTE PROMPT" en cian. → Comunica "código" y es muy guardable.
- **MythReality con dos paneles** (panel2 + acento): mito en `textMuted`/tachado sutil, realidad en `green`/`accent`. → Contraste sobrio, sin alarmismo.
- **Cta con pastilla cian "📩 link en bio"** (decorativa) + `@handle`. → Refuerza el funnel sin parecer interactivo.

### Alternatives Considered
- **Markup enriquecido en el título (ReactNode)**: rechazado — complica el contrato del carrusel (los carruseles se escriben como datos simples); `highlight` string es más declarativo.
- **Una sola plantilla parametrizada por "rol"**: rechazado — los layouts difieren bastante (portada vs. prompt vs. dos-paneles); componentes separados son más claros y testeables.

## Risk & Gap Analysis

### Requirement Ambiguities
- **Qué palabra resaltar**: lo decide el autor del carrusel vía `highlight`. Si se omite, el titular va sin cian (válido, pero el autor pierde el énfasis de marca). Decisión: documentarlo en JSDoc.
- **Texto del chip de pilar**: hoy `Frame` pinta el valor crudo del pilar ("noticia"). Aceptable; capitalización fina queda como mejora.

### Edge Cases
- **`highlight` no encontrado en el título** → render del título completo sin resaltado (sin crash).
- **Step sin `body` ni `bullets`** → solo número + heading (válido).
- **Cta sin `handle`** → omite la línea de handle.
- **Títulos muy largos en Anton 128px** → pueden desbordar; mitigación: el autor controla longitud (≤9 palabras, regla de copy). `overflow:hidden` del Frame recorta sin romper layout.

### Technical Risks
- **Desborde vertical** en slides con mucho texto: el lienzo es fijo 1080×1350; el contenido podría recortarse. Mitigación: tamaños desde la escala del tema + reglas de copy (largos máximos del entregable 02). Verificable en el gate de render.
- **Romper compatibilidad**: las nuevas plantillas son aditivas; Cover/Bullet/Quote y el `ejemplo.ts` actual no se tocan en esta iteración. Gate lo confirma.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | 6 plantillas creadas con sus *Props extends BaseSlideProps | Yes | — |
| 2 | Titulares Anton MAYÚS, cuerpo Inter, prompt mono | Yes | tokens de tema |
| 3 | Resaltado de palabra clave en cian | Yes | vía `highlight` |
| 4 | "DESLIZA →" solo en Hook | Yes | prop `swipe` |
| 5 | Cta = funnel al newsletter | Yes | pastilla + handle |
| 6 | Exportadas en index.ts; gate verde | Yes | typecheck + render de prueba |

### Decisiones tomadas autónomamente
- Resaltado cian con prop `highlight?: string` (parte el título).
- "DESLIZA →" como prop `swipe?: boolean` (default true) exclusivo de Hook.
- Plantillas separadas (no una sola parametrizada).
- Para el gate de render, crear un carrusel de prueba temporal `carousels/_smoke-plantillas.ts` que ejercite las 6 plantillas (no es el gold-standard; ese es iteración 3) y no se commitea si se prefiere — pero se deja como ejemplo vivo opcional.
