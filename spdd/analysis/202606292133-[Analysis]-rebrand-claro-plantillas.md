# SPDD Analysis: Rebrand ia.es claro — Reescritura de plantillas (Iteración 2/3)

## Original Business Requirement

> REBRAND ia.es claro/editorial — ITERACIÓN 2 de 3: REESCRIBIR LAS 6 PLANTILLAS al nuevo look (sobre la fundación de iter-1: tema claro, serif PlayfairDisplay disponible, marcador cian/rosa en highlight, Frame con superficie clara + scrim invertido). Objetivo:
> 1) Reescribir Hook, Lead, Step, Prompt, MythReality, Cta para usar la TIPOGRAFÍA SERIF (theme.fonts.serif = PlayfairDisplay) en titulares en MAYÚSCULA/minúscula (NO uppercase, NO Anton), Inter para cuerpo/labels/eyebrow, y la PALABRA CLAVE con marcador (highlightText treatment "slab" = highlighter) alternando cian (primario) y rosa (secundario). Mantener las props/firmas de cada plantilla y el contrato (CarouselSpec/BaseSlideProps) intactos.
> 2) Quitar el textTransform:uppercase de los titulares; quitar letterSpacing negativo agresivo (serif quiere tracking ~normal); ajustar tamaños/lineHeight para serif (fitDisplaySize sigue, pero el look es serif mixed-case). El GhostNumber (número fantasma) se mantiene pero en serif y tinte de pilar, tenue sobre claro.
> 3) PRIMITIVO DE ANOTACIÓN/SCREENSHOT: crear un componente reutilizable (p.ej. src/templates/Annotated.tsx) que renderice una "tarjeta" clara (panel blanco con borde hairline + sombra) con un CÍRCULO/realce dibujado a mano (SVG, rosa o cian) encima, para el contenido demostrativo (mock de UI). Útil para Step/Prompt. (El uso real de screenshots del remix llega en iter-3; aquí dejamos el primitivo y, si aplica, una variante de Step que lo use.)
> 4) CTA de cierre distinto y on-brand claro: barra cian+rosa, pastilla grande oscura (tinta) con texto claro o pastilla cian, handle PROMINENTE = @ia.punto.es (corregir el handle), wordmark ia.es.
> 5) LOGO/WORDMARK sobre claro: el asset actual (ia_es_wordmark.png) es claro y no se ve sobre crema; resolverlo (usar un wordmark de TEXTO "ia.es" en tinta dibujado por Frame, o el asset oscuro si existe). Que el wordmark se vea sobre fondo claro.
> 6) El chip de pilar y el progreso ya existen; ajustarlos para que se lean sobre claro (chip con texto claro sobre color de pilar está ok; progreso en tinta/pilar).
> Archivos: src/templates/Hook.tsx, Lead.tsx, Step.tsx, Prompt.tsx, MythReality.tsx, Cta.tsx, Frame.tsx (wordmark de texto), nuevo src/templates/Annotated.tsx, y posiblemente theme (tamaños). Referencia: mockups en output/mockups/ (c3-*). NO romper tipos; generate/reel/remix funcionan; gate = npm run typecheck + npm run test verdes. Verificar con render real del smoke carousel (todas las plantillas) que se vea como los mockups c3.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **theme.fonts.serif = "PlayfairDisplay"** + tema claro (iter-1): base para los titulares editoriales.
- **highlightText(text, highlight, color, treatment)** con `slab`=marcador / `underline` (iter-1): el mecanismo de palabra clave; las plantillas pasarán cian o rosa.
- **Hook/Lead/Step/Prompt/MythReality/Cta**: hoy usan `theme.fonts.display` (Anton) + `textTransform:uppercase` + tracking negativo. Se reescriben a serif mixed-case. Props/firmas intactas.
- **fitDisplaySize / MIN_DISPLAY**: sigue dando el tamaño del titular; el look pasa a serif (sin uppercase).
- **GhostNumber({value,color})**: número fantasma; se mantiene, en serif y tinte de pilar tenue.
- **Frame**: pinta wordmark vía `--brand-logo` (imagen clara → invisible sobre crema), chip de pilar, progreso, source, scrim claro (iter-1). El wordmark pasa a TEXTO en tinta.
- **MythReality.Panel / Prompt panel**: tarjetas; se aclaran (panel blanco, borde hairline, sombra suave) — ya tokenizado en iter-1 (surface.panelBorder/panelShadow claros).
- **Cta**: pastilla + handle (hoy "@{handle}", handle pasado por prop). El handle por defecto a usar = ia.punto.es; se hace prominente.

### New Concepts Required
- **Annotated (src/templates/Annotated.tsx)**: primitivo reutilizable = tarjeta clara (panel blanco + borde hairline + sombra) con un CÍRCULO/realce a mano (SVG cian/rosa) superpuesto, para contenido demostrativo (mock de UI). Usado opcionalmente por Step/Prompt.
- **Wordmark de texto** en Frame: "ia.es" en tinta (con el "." en cian) dibujado con texto, visible sobre claro.
- **Convención de acento alterno**: cian primario / rosa secundario por slide (p. ej. el highlight del Hook cian, ciertos pasos rosa) — regla de estilo, no de tipo.

### Key Business Rules
- **Serif mixed-case** en titulares (no uppercase, no Anton); Inter para cuerpo/labels.
- **Palabra clave con marcador** cian o rosa (ambos válidos; cian primario).
- **Handle correcto = @ia.punto.es**; wordmark = ia.es visible sobre claro.
- **Props/firmas/tipos intactos**: solo cambia el render de cada plantilla.
- **Contraste**: tinta sobre claro; texto tinta sobre marcador legible.
- **Gate**: typecheck + test verdes; generate/reel/remix; render del smoke se ve como los mockups c3.

## Strategic Approach

### Solution Direction
Reescribir el JSX de las 6 plantillas para el look editorial claro, reusando los tokens/mecanismos de iter-1:
1. **Titulares**: `fontFamily: theme.fonts.serif`, `fontWeight: 800`, SIN `textTransform`, `letterSpacing` normal o levemente negativo (-0.01em), `lineHeight ~1.0`. Tamaño desde `fitDisplaySize`.
2. **Cuerpo/labels/eyebrow**: Inter (como hoy), colores tinta/muted; eyebrow en cian o pilar.
3. **Palabra clave**: `highlightText(..., cyan|pink, "slab")` (marcador) o `"underline"` para frases largas (Lead).
4. **GhostNumber**: `fontFamily serif`, color de pilar, opacidad tenue (ya recibe color).
5. **Annotated** (nuevo): tarjeta + círculo SVG a mano; Step puede aceptar (sin romper props) mostrar un bloque demostrativo cuando haya `body` tipo ejemplo — o se deja como primitivo disponible para iter-3 (remix). Mínimo: crear el componente y exportarlo; integrarlo en Step de forma backward-compatible (no romper StepProps).
6. **Cta**: barra cian+rosa arriba, titular serif con marcador, pastilla grande (tinta con texto claro), handle prominente con `@` (default ia.punto.es si no se pasa), wordmark.
7. **Frame wordmark de texto**: reemplazar el div de imagen `--brand-logo` por un texto "ia.es" (Inter 800, tinta, con "." cian). 

### Key Design Decisions
- **Serif vía `theme.fonts.serif` en cada plantilla** (vs. cambiar `theme.fonts.display`): → mantiene `display` (Anton) disponible por compat, pero las plantillas usan `serif`. Recomendado.
- **Wordmark de TEXTO en Frame** (vs. nuevo asset oscuro): → sin depender de un PNG nuevo; texto nítido y editable; "ia.es" con "." cian como guiño. Recomendado.
- **Annotated como primitivo + integración mínima en Step** (vs. rediseñar el flujo de contenido ahora): → deja la pieza lista para iter-3 (remix con screenshots) sin romper props. Recomendado.
- **Acento alterno cian/rosa por convención** (no por tipo): → flexibilidad; las plantillas eligen color según rol/pilar. Recomendado.
- **Mantener fitDisplaySize**: → el dimensionado sigue; solo cambia familia/uppercase. Recomendado.

### Alternatives Considered
- **Cambiar `theme.fonts.display` a serif globalmente**: rechazado — `display` semánticamente es Anton; mejor usar `serif` explícito y dejar display por compat.
- **Asset PNG de wordmark oscuro**: rechazado — texto es más simple/nítido/editable.
- **Rediseñar el pipeline de contenido demostrativo ahora**: rechazado — es iter-3 (remix); aquí solo el primitivo.

## Risk & Gap Analysis

### Requirement Ambiguities
- **Qué slides usan rosa vs cian**: convención — Hook/CTA cian; pasos alternan; MythReality "realidad" verde se mantiene, acento rosa para mito. Registrar.
- **Annotated: integrarlo en Step ya o dejarlo como primitivo**: crear + integración opcional mínima (no romper props). Registrar.
- **Default handle**: si Cta no recibe `handle`, usar "ia.punto.es". Registrar.

### Edge Cases
- **Titulares largos en serif**: fitDisplaySize + lineHeight; verificar que no desborden (clip del Frame).
- **Marcador rosa con poco contraste de tinta**: tinta #0B1020 sobre rosa #F471B5 es legible; verificar.
- **Reel 9:16**: el CTA de cierre y annotations no deben invadir la zona segura inferior.
- **GhostNumber serif**: número grande serif puede verse distinto a Anton; opacidad tenue.
- **Carruseles existentes (mentiras-ia con ai)**: render con key; smoke sin ai. Verificar smoke.

### Technical Risks
- **Romper props/tipos**: mantener firmas; Annotated nuevo con props propias; integración en Step opcional. 
- **Wordmark de texto vs `--brand-logo`**: dejar de usar la var no rompe (htmlShell sigue definiéndola; Frame deja de referenciarla). 
- **Render en blanco**: ya claro desde iter-1; verificar legibilidad serif.
- **Gate**: typecheck + test; smoke render visual (no automatizable, revisión manual).

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | 6 plantillas en serif mixed-case + marcador cian/rosa | Yes | reescritura JSX |
| 2 | Sin uppercase / tracking serif; GhostNumber serif+pilar | Yes | quitar textTransform |
| 3 | Primitivo Annotated (tarjeta + círculo a mano) | Yes | nuevo componente |
| 4 | CTA de cierre claro + handle @ia.punto.es prominente | Yes | barra cian+rosa + pastilla |
| 5 | Wordmark visible sobre claro (texto ia.es tinta) | Yes | Frame texto |
| 6 | Chip/progreso legibles sobre claro | Yes | ajuste menor |
| 7 | Tipos/contrato intactos; gate verde; se ve como c3 | Yes | render smoke |

## Decisiones tomadas autónomamente
1. Titulares con `theme.fonts.serif` (Playfair) mixed-case, sin uppercase, weight 800, lineHeight ~1.0; `display` (Anton) queda por compat sin uso.
2. **Wordmark de TEXTO "ia.es"** en Frame (tinta, "." cian), reemplaza la imagen clara invisible.
3. **Annotated.tsx** nuevo (tarjeta clara + círculo SVG a mano cian/rosa); integración mínima/opcional en Step sin romper props (uso pleno en iter-3).
4. Acentos por convención: cian primario (Hook/CTA), rosa secundario (alternar en pasos/mito); "realidad" sigue verde.
5. Cta: barra cian+rosa + pastilla grande (tinta/claro) + handle prominente; **default handle = ia.punto.es**.
6. Mantener fitDisplaySize/MIN_DISPLAY; GhostNumber en serif con color de pilar tenue.
7. El uso de screenshots reales del remix es iter-3; aquí solo el primitivo Annotated.
