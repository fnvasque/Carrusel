# SPDD Analysis: Rediseño visual de plantillas — P1 stop-scroll (Iteración 1/3)

## Original Business Requirement

> REDISEÑO VISUAL del sistema de plantillas de carruseles/Reels de la marca ia.es — ITERACIÓN 1 de 3 (P1, máximo impacto stop-scroll). El usuario calificó el diseño actual de "malo, poco llamativo, poco stop-scroll"; ui-ux-pro-max y product-marketing coincidieron en que el cuello de botella es la ejecución visual de las plantillas (fondos de stock genéricos, jerarquía tipográfica tibia, acento cian tímido, sin textura/profundidad). Objetivo de esta iteración (P1):
> 1) FONDOS GRÁFICOS DE MARCA + SCRIM DIRECCIONAL: reemplazar el estilo de imagen IA fotográfico ("editorial tech photography → laptops genéricas") por uno ABSTRACTO/GRÁFICO de marca (gradiente navy→near-black, glow cian suave, grano sutil, bokeh, SIN objetos/dispositivos/texto, espacio negativo para el texto). Y reemplazar el `overlay` plano por un SCRIM DIRECCIONAL (gradiente de abajo hacia arriba) que garantice contraste ≥4.5:1 para el texto anclado abajo sin apagar la imagen. Idealmente, hacer que la mayoría de los slides usen un fondo gráfico CSS de marca por defecto (gradiente+glow+grano) y reservar {ai} solo para portada/CTA.
> 2) TIPOGRAFÍA TYPE-AS-HERO: el titular debe dominar (llenar ~55-65% del alto). Anton con lineHeight ~0.92 y letterSpacing negativo; que fitDisplaySize NO baje de ~84px (si no cabe, se acorta el copy, no se encoge a ilegible). Subir el ratio H1:cuerpo.
> 3) ACENTO CIAN CONTUNDENTE (firma de marca): la palabra `highlight` ya no solo en color cian, sino sobre un SLAB/marcador cian (fondo cian, texto navy) o subrayado grueso cian (~8-10px). Es el elemento que detiene el scroll y hace reconocible a la marca sin leer el logo.
> Archivos involucrados (sistema actual): src/theme.ts (tokens: colors navy #0B1020 / accent cian #22D3EE / panel #151D33 / panel2 #1C2640 / textMuted; fontSize display 128/title 96/heading 64/...; padding 120; fonts Anton/Inter/JetBrainsMono), src/render/background.ts (BRAND_IMAGE_STYLE, resolveBackground, overlay), src/render/htmlShell.ts (CSS global, fondo/overlay), src/templates/Frame.tsx (logo, chip pilar, progreso, fuente), src/templates/Hook.tsx (titular anclado abajo, fitDisplaySize, eyebrow, subtitle, swipe), src/templates/highlight.tsx (resaltado de la palabra clave), src/templates/fit.ts (fitDisplaySize). NO romper el contrato de tipos (CarouselSpec/BaseSlideProps/Background), generate/reel/remix deben seguir funcionando, y el gate del repo es `npm run typecheck` + `npm run test` verdes. Respetar la fuente de verdad de marca: navy+cian, Anton/Inter/JetBrainsMono, NADA de morado neón cripto, regla 60-30-10.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **theme tokens** (`src/theme.ts`): única fuente de tokens (colores, `fontSize`, `padding`, `fonts`). Type-as-hero y el slab se anclan aquí.
- **Background type** (`src/templates/types.ts`): `{color}|{gradient}|{image}|{ai}` + `overlay?`. Contrato que NO se rompe; las mejoras se montan encima.
- **Frame** (`src/templates/Frame.tsx`): pinta `backgroundStyle()` (color/gradient/image), `overlayLayer()` (negro plano `rgba(0,0,0,overlay)`), y el default `backgroundColor: theme.colors.bg` (navy plano). Punto único para inyectar **superficie de marca por defecto** y **scrim direccional**.
- **highlightText(text, highlight, color)** (`src/templates/highlight.tsx`): hoy solo pinta la palabra en `color`. La usan Hook, Lead, Step, Cta. Es el lugar del **slab cian**.
- **fitDisplaySize(text, max)** (`src/templates/fit.ts`): factor 1→0.485 (≈62px para >56 chars). Necesita **piso** y mayor dominancia.
- **Hook** (`src/templates/Hook.tsx`): titular `lineHeight 1.0`, `letterSpacing -0.01em`, eyebrow/subtitle/swipe. Caso de referencia del type-as-hero.
- **BRAND_IMAGE_STYLE / resolveBackground** (`src/render/background.ts`): el sufijo "editorial tech photography" que produce stock; resuelve `{ai}` → `{image: dataUri}` (cacheado por hash).
- **htmlShell** (`src/render/htmlShell.ts`): CSS global + embebido de fuentes/logo. Lugar natural para una **textura de grano** y utilidades CSS reutilizables.
- **pillarColor** (`src/theme.ts`): color por pilar (cian/violeta/rosa) — se respeta; el theming completo por pilar es P3 (no esta iteración).

### New Concepts Required

- **Superficie de marca (brand surface)**: fondo gráfico por defecto cuando no hay `background` explícito = gradiente navy→near-black + glow cian radial + grano sutil. Reemplaza el navy plano. Nuevo, en `Frame`/`theme`/`htmlShell`.
- **Scrim direccional**: capa de gradiente de abajo→arriba (en vez del negro plano) que asegura contraste del texto anclado abajo sobre fondos `{image}`/`{ai}`. Reemplaza/extiende `overlayLayer`.
- **Tratamiento de highlight (slab / underline / color)**: el resalte de la palabra clave como **firma de marca** — slab cian (fondo cian, texto navy) para titulares; subrayado grueso cian como alternativa. Extiende `highlightText`.
- **Estilo de imagen IA abstracto**: nuevo `BRAND_IMAGE_STYLE` gráfico/abstracto (sin objetos), para portada/CTA.
- **Type-as-hero tokens**: escala display más dominante, `lineHeight` ~0.92, tracking negativo, y piso en `fitDisplaySize`.

### Key Business Rules

- **Contraste ≥4.5:1** para el texto sobre cualquier fondo (lo garantiza el scrim direccional + la superficie de marca).
- **Fidelidad de marca**: navy+cian, Anton/Inter/JetBrainsMono, regla 60-30-10, **sin morado neón cripto**. El slab usa cian (el 10%): contundente pero no omnipresente (1-2 palabras).
- **Backward-compatible**: `CarouselSpec`/`BaseSlideProps`/`Background` no cambian de forma incompatible; los carruseles existentes (`mentiras-ia`, `estudiar-3-ias`, smoke) siguen renderizando — idealmente mejor, nunca peor ni roto.
- **Determinismo del render**: la textura de grano debe ser determinista (Playwright) — SVG `feTurbulence` con `seed` fijo o data URI estático.
- **Gate**: `npm run typecheck` + `npm run test` verdes; `generate`/`reel`/`remix` funcionan.

## Strategic Approach

### Solution Direction

Tres frentes, todos sobre el sistema existente (tokens + Frame + helpers), sin tocar el contrato de tipos:

1. **Fondo (superficie + scrim) — `Frame.tsx` + `theme.ts` + `htmlShell.ts` + `background.ts`**:
   - Definir tokens de marca para la superficie por defecto (gradiente navy→#070A12, glow cian radial superior/lateral, grano). Cuando un slide NO trae `background`, `Frame` pinta esta **superficie de marca** en vez del navy plano.
   - Reemplazar `overlayLayer` (negro plano) por un **scrim direccional**: para fondos `{image}`/`{ai}`, gradiente `linear-gradient(180deg, transparent, rgba(7,10,18,~0.9) 100%)` anclado abajo (+ una viñeta sutil), parametrizable por `overlay` (que pasa a controlar la intensidad del scrim, no un negro uniforme). Mantener compatibilidad: si `overlay` viene definido, el scrim respeta esa intensidad.
   - Cambiar `BRAND_IMAGE_STYLE` a abstracto/gráfico (gradiente, glow, grano, bokeh, sin objetos/dispositivos/texto, espacio negativo).
   - Grano global reutilizable como utilidad CSS en `htmlShell` (clase/var), para superficie y scrim.

2. **Type-as-hero — `theme.ts` + `fit.ts` + `Hook.tsx`** (y, donde aplique sin romper, los titulares de Step/Cta):
   - Ajustar tokens: `lineHeight` de display ~0.92 y tracking negativo (token nuevo, p. ej. `theme.tracking.display`).
   - `fitDisplaySize`: piso ~84px (no bajar de ahí); la dominancia del titular se logra subiendo el `max` efectivo y reduciendo menos agresivo.
   - Hook: aplicar lineHeight/tracking nuevos; subtitle más contenido para subir el ratio H1:cuerpo.

3. **Slab cian — `highlight.tsx`** (y sus llamadores):
   - Extender `highlightText` para soportar tratamiento: `slab` (fondo cian, texto navy, padding, box-decoration-break para multilínea) | `underline` (borde inferior grueso cian) | `color` (actual). Default por contexto: titulares → `slab`; mantener compat con la firma actual.

### Key Design Decisions

- **Superficie de marca por defecto en `Frame`** (vs. exigir background en cada slide): → elimina el navy plano "barato" en TODOS los slides sin cambiar los `CarouselSpec`; el grano/glow suben el valor percibido globalmente. Recomendado. Trade-off: cambia el look de carruseles existentes (mejora), aceptable.
- **Scrim direccional reusando `overlay`** (vs. nuevo campo en `Background`): → no rompe el tipo `Background`; `overlay` pasa de "opacidad de negro plano" a "intensidad del scrim direccional". Recomendado. Trade-off: leve cambio semántico de `overlay`, documentado; visualmente mejor en todos los casos.
- **`highlightText` con parámetro de tratamiento opcional + default compatible** (vs. cambiar la firma a la fuerza): → los 4 llamadores siguen compilando; se opta por `slab` en titulares explícitamente. Recomendado.
- **Grano por SVG `feTurbulence` data URI determinista** (vs. PNG de ruido en assets): → sin archivo binario nuevo, determinista, escalable. Recomendado.
- **Reservar `{ai}` para portada/CTA**: el motor (remix) ya decide fondos; aquí solo se cambia el ESTILO del prompt y se mejora el default. La política "ai solo en portada/CTA" se sugiere al generador, pero el cambio duro de esta iteración es el **estilo abstracto** + **superficie por defecto** (no forzar que el remix deje de pedir ai en slides intermedios — eso es ajuste de copy/motor, no de plantillas). Documentar como decisión.

### Alternatives Considered

- **Reescribir las plantillas desde cero**: rechazado — alto riesgo de romper generate/reel/remix y el contrato; mejor evolucionar tokens + Frame + helpers.
- **Grano/scrim como imagen pre-renderizada en `assets/`**: rechazado — binario nuevo y menos flexible que CSS/SVG inline.
- **Forzar `slab` global en todo highlight (incluido cuerpo)**: rechazado — el slab en texto de cuerpo satura; se limita a titulares (firma), cuerpo puede usar underline/color.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Semántica de `overlay`**: pasa a controlar intensidad del scrim direccional. Registrar; documentar en el tipo.
- **Qué titulares usan slab**: Hook (título), Cta (título), Step (heading) → slab; Lead → underline/color. Registrar.
- **Piso exacto de fitDisplaySize**: 84px; titulares muy largos podrían desbordar (clip por overflow:hidden). Registrar.
- **"ai solo en portada/CTA"**: se cambia el estilo del prompt y el default; no se fuerza al motor a no pedir ai en intermedios en esta iteración. Registrar.

### Edge Cases

- **Titular larguísimo con piso 84px**: puede desbordar el alto; `Frame` tiene `overflow:hidden` (clip), y el remix produce titulares cortos. Mitigación: anclar abajo + clip; el copy corto es la norma.
- **Slab multilínea**: la palabra resaltada puede partir en 2 líneas → usar `box-decoration-break: clone` y padding para que el slab se vea bien en ambas líneas.
- **Fondo `{color}` claro + texto**: el scrim direccional asume fondos oscuros de marca; con `{color}` claro el contraste depende del color (caso raro en la marca). Mitigación: la superficie/colores de marca son oscuros; documentar.
- **Carruseles existentes con `overlay: 0.5`** (mentiras-ia): ahora será scrim direccional 0.5 → mejor legibilidad. Verificar que rendericen.
- **Reel (9:16) con zona segura inferior**: el scrim anclado abajo no debe chocar con `REEL_SAFE_BOTTOM`; el texto ya respeta esa zona. Verificar.

### Technical Risks

- **Romper compilación por firma de `highlightText`**: mitigación: parámetro opcional con default; los 4 llamadores intactos.
- **Grano no determinista / pesado**: mitigación: `feTurbulence` con `seed` fijo, opacidad baja; sin impacto de performance perceptible en Playwright.
- **Regresión visual en generate/reel**: mitigación: render real del smoke carousel + un carrusel existente, comparación antes/después; gate `typecheck`+`test`.
- **Contraste insuficiente pese al scrim** (fondos IA muy claros): mitigación: el nuevo estilo IA es oscuro por diseño; el scrim garantiza la base inferior.
- **Smoke tests**: no cubren render visual; las funciones puras nuevas (p. ej. piso de `fitDisplaySize`, selección de tratamiento) se pueden testear.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Estilo de imagen IA abstracto/gráfico (no fotográfico) | Yes | `BRAND_IMAGE_STYLE` |
| 2 | Scrim direccional (≥4.5:1) en vez de overlay plano | Yes | `overlayLayer`→scrim; `overlay` controla intensidad |
| 3 | Superficie de marca por defecto (gradiente+glow+grano) | Yes | `Frame` default + `htmlShell` grano |
| 4 | Type-as-hero: lineHeight ~0.92, tracking negativo, dominancia | Yes | `theme` + `Hook` |
| 5 | fitDisplaySize con piso ~84px | Yes | `fit.ts` |
| 6 | Slab/subrayado cian como firma del highlight | Yes | `highlightText` + titulares |
| 7 | No romper tipos; generate/reel/remix ok; gate verde | Yes | cambios backward-compatible + verificación |
| 8 | Fidelidad de marca (navy+cian, sin morado neón) | Yes | tokens existentes; slab usa cian |

## Decisiones tomadas autónomamente

1. **Superficie de marca por defecto en `Frame`** (gradiente+glow+grano) en lugar del navy plano, para subir el valor percibido en todos los slides sin tocar los `CarouselSpec`.
2. **Scrim direccional reusando el campo `overlay`** (cambia de "negro plano" a "intensidad de scrim de abajo→arriba"), sin alterar el tipo `Background`.
3. **`highlightText` con tratamiento opcional** (`slab`|`underline`|`color`), default compatible; **slab cian en titulares** (Hook/Cta/Step), underline/color en cuerpo/Lead.
4. **`fitDisplaySize` con piso 84px** y display más dominante (lineHeight ~0.92, tracking negativo vía token nuevo).
5. **Nuevo `BRAND_IMAGE_STYLE` abstracto/gráfico** (sin objetos/dispositivos/texto), pensado para portada/CTA.
6. **Grano por SVG `feTurbulence` determinista** (sin binarios nuevos).
7. **"ai solo en portada/CTA"** se aborda cambiando el estilo del prompt + mejorando el default; no se fuerza al motor a no pedir ai en intermedios en esta iteración (queda para ajuste de copy/motor).
8. La diferenciación COMPLETA por pilar y la grilla/CTA invertido son P3 (no esta iteración); aquí solo se respeta `pillarColor` existente.
