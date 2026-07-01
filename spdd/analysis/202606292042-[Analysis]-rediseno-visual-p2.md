# SPDD Analysis: Rediseño visual de plantillas — P2 profundidad editorial (Iteración 2/3)

## Original Business Requirement

> REDISEÑO VISUAL del sistema de plantillas de la marca ia.es — ITERACIÓN 2 de 3 (P2: profundidad editorial y premium). Sobre lo ya hecho en P1 (superficie de marca con gradiente+glow+grano en Frame, scrim direccional, type-as-hero con piso fitDisplaySize, slab cian como firma del highlight en Hook/Cta/Step). Objetivo P2:
> 1) NÚMERO/ÍNDICE COMO ELEMENTO GRÁFICO: en Step (prop `step`, ej "01") y en MythReality (mythLabel "Nº1"), pintar el número en Anton GIGANTE (≈260-340px) como marca de agua/fantasma detrás del contenido (cian a baja opacidad ~0.10-0.14, o como contorno), dando escala y ritmo editorial. Debe quedar detrás del texto, sin restar legibilidad, y respetar la zona segura en Reel.
> 2) PROFUNDIDAD PREMIUM: añadir señales de "dark UI premium" reutilizables — viñeta sutil global, hairlines (líneas finas a 1px de baja opacidad como divisores/acentos editoriales), y tratamiento de PANELES con superficie (panel/panel2 ya existen como tokens) + borde hairline + leve sombra/realce para los bloques de MythReality (mito/realidad) y Prompt (bloque de código), que hoy se ven planos. Que el panel de "realidad" siga destacando en verde y el de "mito" apagado.
> 3) REFUERZO EDITORIAL DE LEAD (promesa en 1 frase): hoy Lead es Inter 600 plano con un hairline. Reforzarlo: hairline cian más intencional, mejor jerarquía (kicker en cian, frase grande con la palabra clave resaltada con el tratamiento de marca underline/slab), aire editorial. NO añadir fuentes nuevas (la marca fija Anton/Inter/JetBrainsMono; nada de Playfair).
> Archivos: src/theme.ts (tokens: colors.panel #151D33 / panel2 #1C2640 / green #34D399 / accent / textMuted; surface ya añadido en P1; fontSize.kicker 40), src/templates/Step.tsx, src/templates/MythReality.tsx (Panel interno), src/templates/Prompt.tsx (bloque mono), src/templates/Lead.tsx, src/templates/Frame.tsx (viñeta global opcional ya parcialmente vía scrim; se puede sumar una viñeta sutil siempre presente), y posibles helpers nuevos en theme o un módulo de estilos. NO romper tipos (CarouselSpec/BaseSlideProps/Background), generate/reel/remix siguen funcionando, gate = npm run typecheck + npm run test verdes. Fidelidad de marca: navy+cian (+ verde solo para "realidad"), sin morado neón, 60-30-10, el número fantasma cuenta como textura no como el 10% de acento.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **theme tokens** (`src/theme.ts`): `colors.panel #151D33`, `panel2 #1C2640`, `green #34D399`, `accent`, `textMuted`; `surface` (P1); `fontSize.kicker 40`. Aquí se anclan los tokens de profundidad (hairline, panelBorder, sombra).
- **Frame** (`src/templates/Frame.tsx`): superficie de marca + `scrimLayer` (P1). Punto único para una **viñeta sutil siempre presente** (capa extra), sin romper el scrim.
- **Step** (`src/templates/Step.tsx`): pinta `step` ("01") como kicker pequeño cian; contenido en columna centrada. Candidato al **número fantasma** detrás.
- **MythReality** + `Panel` interno (`src/templates/MythReality.tsx`): dos `Panel` (mito apagado, realidad verde) con `backgroundColor: panel2`, `borderRadius`, **sin borde ni profundidad** (planos). Candidatos a hairline+realce; el `mythLabel` ("Nº1") alimenta el número fantasma.
- **Prompt** (`src/templates/Prompt.tsx`): bloque mono `panel` con `borderLeft 6px cian`, sin borde completo ni profundidad. Candidato a hairline+realce.
- **Lead** (`src/templates/Lead.tsx`): hairline `96x4` cian, kicker cian, frase Inter 600 con `highlightText(color)`. Refuerzo editorial (hairline intencional + highlight con tratamiento de marca).
- **highlightText(treatment)** (`src/templates/highlight.tsx`, P1): ya soporta `slab|underline|color`. Lead puede usar `underline`/`slab`.
- **FORMATS / REEL_SAFE_BOTTOM** (`Frame`/`types`): el número fantasma y la viñeta deben respetar la zona segura del Reel.

### New Concepts Required

- **GhostNumber**: número grande Anton (≈260-340px) posicionado en absoluto DETRÁS del contenido (cian a opacidad ~0.10-0.14), como textura/escala editorial. Reutilizable por Step y MythReality. Nuevo (helper/subcomponente, p. ej. en un módulo de estilos o inline en cada plantilla).
- **Tokens de profundidad premium**: `theme.surface.hairline` (línea 1px de baja opacidad), `panelBorder`, `panelShadow` (sombra/realce sutil), `vignette`. Nuevos, en `theme.surface`.
- **Panel con profundidad**: tratamiento reutilizable (borde hairline + sombra/inset + superficie) para MythReality y Prompt.
- **Viñeta global sutil**: capa siempre presente en Frame que oscurece levemente los bordes (premium dark UI).

### Key Business Rules

- **El número fantasma es TEXTURA, no acento**: cian a muy baja opacidad detrás del texto; no cuenta para la regla 60-30-10 del 10% cian.
- **Legibilidad primero**: el ghost number queda detrás del contenido (z-index), sin reducir el contraste del texto principal.
- **Zona segura Reel**: ghost number y viñeta no deben caer en/empujar el contenido fuera del `REEL_SAFE_BOTTOM`.
- **Jerarquía de MythReality**: "realidad" en verde destaca, "mito" apagado; la profundidad refuerza sin invertir esa jerarquía.
- **Fidelidad de marca**: navy+cian (+ verde solo realidad), sin morado neón; profundidad con grises/hairlines, no colores nuevos.
- **Backward-compatible** + gate `typecheck`+`test` verdes; generate/reel/remix intactos.

## Strategic Approach

### Solution Direction

Todo sobre tokens + plantillas existentes (sin tocar tipos), construyendo encima de P1:

1. **Tokens de profundidad (`theme.ts`)**: extender `theme.surface` con `hairline` (p. ej. `rgba(255,255,255,0.08)`), `panelBorder` (`rgba(255,255,255,0.06)`), `panelShadow` (sombra suave + highlight superior tipo "inset 0 1px rgba(255,255,255,0.05)"), y `vignette` (radial oscuro de bordes). Cian glow ya existe.

2. **GhostNumber (Step + MythReality)**:
   - Subcomponente/helper que renderiza un `<span>` absoluto, Anton, `fontSize` grande (≈300px), `color` cian con `opacity` ~0.12 (o `color: transparent` + `WebkitTextStroke` para contorno), `zIndex` bajo dentro de la capa de contenido, posicionado (p. ej. arriba-derecha o centrado-detrás), `pointerEvents:none`, recortado por `overflow:hidden` del Frame.
   - Step: deriva el número de `step`; MythReality: del `mythLabel` (extraer dígitos, ej "Nº1" → "1"; "01").
   - Posición pensada para no chocar con la zona segura del Reel (parte superior/centro).

3. **Paneles con profundidad (MythReality.Panel + Prompt)**:
   - `Panel` (MythReality): añadir `border: 1px solid panelBorder`, `boxShadow: panelShadow`, y un acento lateral hairline; "realidad" mantiene verde (borde/acento verde tenue), "mito" mantiene apagado.
   - Prompt: el bloque mono gana `border` hairline completo (además del `borderLeft` cian) + `boxShadow` sutil → se ve como un "code block" real.

4. **Viñeta global (Frame)**: añadir una capa `position:absolute inset:0 pointerEvents:none` con `radial-gradient` oscuro de bordes (muy sutil), SIEMPRE presente (independiente del scrim), para dar profundidad de "dark UI". Debe ir detrás del contenido y por encima del fondo.

5. **Lead editorial**: hairline cian más intencional (p. ej. una línea + label), kicker cian (ya está), frase con `highlightText(..., "underline")` o `"slab"` (tratamiento de marca), y más aire (tamaño/lineHeight). Subir contraste jerárquico.

### Key Design Decisions

- **GhostNumber como capa de textura detrás del contenido** (vs. número como contenido principal): → da escala editorial sin competir con el texto; opacidad baja = textura, respeta 60-30-10. Recomendado. Trade-off: requiere control de z-index/posición; mitigable.
- **Contorno (text-stroke) vs. relleno a baja opacidad**: → ambos válidos; **relleno cian a opacidad ~0.12** es más simple y robusto en Playwright; el contorno puede usarse como variante. Recomendado: relleno a baja opacidad (con stroke como opción documentada).
- **Tokens de profundidad en `theme.surface`** (vs. hex sueltos en plantillas): → fuente única, consistente, reutilizable por Panel/Prompt/Frame. Recomendado.
- **Viñeta siempre presente en Frame** (vs. solo en fondos imagen): → da profundidad uniforme a todos los slides (incluida la superficie de marca), no solo a los de imagen. Recomendado, muy sutil para no oscurecer en exceso.
- **Lead con underline (no slab) por defecto**: → en una frase de cuerpo grande, el slab puede saturar; el underline cian es más editorial. Recomendado (slab disponible).
- **No añadir fuentes**: respeta la fuente de verdad de marca (Anton/Inter/JetBrainsMono); el refuerzo editorial se logra con jerarquía/espacio/acento, no con Playfair. Decidido.

### Alternatives Considered

- **Número fantasma como imagen IA/SVG**: rechazado — Anton ya es la fuente de display; un `<span>` es más simple, nítido y consistente.
- **Sombras fuertes / neumorfismo**: rechazado — choca con el look editorial plano-pero-premium; se usan hairlines + sombra muy sutil.
- **Playfair para Lead**: rechazado — contradice la fuente de verdad de marca (3 fuentes).
- **Viñeta marcada**: rechazado — oscurece y abarata; se usa una viñeta muy sutil.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Posición del ghost number**: arriba-derecha/centro-detrás. → Decisión: anclado de modo que no invada la zona segura del Reel (mitad superior); registrar.
- **De dónde sale el dígito en MythReality**: de `mythLabel` (extraer dígitos); si no hay dígito, no se pinta ghost. Registrar.
- **Intensidad exacta (opacidad/sombra/hairline)**: valores conservadores parametrizados por token; afinables. Registrar.
- **Lead: underline vs slab**: default underline. Registrar.

### Edge Cases

- **`step`/`mythLabel` sin dígitos**: GhostNumber no se renderiza (degradación).
- **Ghost number muy largo (ej. "10")**: limitar a 1-2 caracteres; tamaño/posición tolerante.
- **Reel (9:16) zona segura**: ghost number en mitad superior; viñeta uniforme no empuja contenido. Verificar.
- **Paneles con texto largo**: borde/sombra no deben romper el layout; padding existente se mantiene.
- **Contraste del texto sobre panel con borde**: el borde es hairline (no resta contraste del texto).
- **Carruseles existentes** (`mentiras-ia` usa MythReality; `_smoke-plantillas` usa varias): deben mejorar, no romper. Verificar render.

### Technical Risks

- **z-index/stacking del ghost vs contenido**: mitigación: ghost en la capa de contenido con `zIndex:0` y el texto con `position:relative`/`zIndex:1`; Frame ya separa fondo/scrim/contenido.
- **Viñeta global que oscurezca contenido**: mitigación: radial muy sutil, bordes solamente.
- **Regresión visual**: mitigación: render real del smoke carousel + mentiras-ia, comparar; gate.
- **Determinismo**: todo CSS estático; sin random/tiempo.
- **Smoke tests**: no cubren visual; lo nuevo es mayormente presentacional. Se puede testear el helper de extracción de dígitos del ghost number (puro).

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Número fantasma gigante detrás (Step + MythReality) | Yes | GhostNumber, opacidad ~0.12, z-index |
| 2 | Respetar zona segura Reel / legibilidad | Yes | posición mitad superior; ghost detrás |
| 3 | Viñeta sutil global | Yes | capa en Frame |
| 4 | Hairlines + paneles con profundidad (MythReality, Prompt) | Yes | tokens + border/shadow |
| 5 | "Realidad" verde destaca, "mito" apagado | Yes | se preserva la jerarquía |
| 6 | Refuerzo editorial de Lead (hairline, jerarquía, highlight marca) | Yes | underline + aire |
| 7 | Sin fuentes nuevas; navy+cian(+verde) | Yes | Anton/Inter/JetBrainsMono |
| 8 | No romper tipos; generate/reel/remix; gate verde | Yes | cambios presentacionales + verificación |

## Decisiones tomadas autónomamente

1. **GhostNumber como `<span>` Anton absoluto** detrás del contenido, cian a opacidad ~0.12 (variante contorno con `WebkitTextStroke` documentada), `pointerEvents:none`, recortado por `overflow:hidden`.
2. **Dígito del ghost**: Step de `step`; MythReality de los dígitos de `mythLabel`; sin dígito → no se pinta.
3. **Posición mitad superior** para no invadir la zona segura del Reel.
4. **Tokens de profundidad en `theme.surface`**: `hairline`, `panelBorder`, `panelShadow`, `vignette`.
5. **Viñeta global sutil siempre presente en Frame** (capa propia, detrás del contenido).
6. **Paneles (MythReality.Panel, Prompt) con borde hairline + sombra sutil**; realidad conserva verde, mito apagado.
7. **Lead reforzado con highlight `underline`** y mejor jerarquía/aire; sin fuentes nuevas.
8. **Theming completo por pilar, grilla y CTA invertido** quedan para P3 (no esta iteración).
