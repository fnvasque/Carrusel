# SPDD Analysis: Rebrand ia.es claro/editorial — Fundación (Iteración 1/3)

## Original Business Requirement

> REBRAND ia.es a identidad CLARA/editorial — ITERACIÓN 1 de 3: FUNDACIÓN (tokens + fuente serif + Frame + sistema de marcador). Reemplaza la identidad oscura previa (navy #0B1020 + Anton + cian) por: fondo CLARO (crema/blanco editorial, p. ej. #FBFAF7 / #F4F1EA) con grano + grilla sutil + glow tenue; tipografía SERIF (Playfair Display) para titulares en mayúscula/minúscula (NO solo mayúsculas) + Inter para cuerpo/labels; DOS acentos de marca: cian #22D3EE (primario) + rosa #F471B5 (secundario), usados como MARCADOR (highlighter swash) y SUBRAYADO a mano sobre la palabra clave; texto principal "tinta" oscura #0B1020 sobre claro. Handle de cuenta = @ia.punto.es (wordmark/logo = ia.es). Alcance de esta iteración (fundación, sin reescribir aún cada plantilla salvo lo mínimo para compilar):
> 1) FUENTE SERIF LOCAL: descargar Playfair Display (woff2, pesos ~600/700/800 + italic 600) a src/fonts/ con el naming del repo (Familia-Peso.ext, p. ej. PlayfairDisplay-700.woff2) para que fonts.ts la embeba; añadir la familia al theme (theme.fonts.serif = "PlayfairDisplay").
> 2) TOKENS DE TEMA CLARO en src/theme.ts: colors a tema claro (bg claro, text tinta oscura, textMuted gris cálido), mantener accent cian y pink; surface (gradiente/glow/grano/grilla) adaptado a claro; conservar nombres de tokens existentes para no romper (cambiar sus VALORES a la versión clara). pillarColor/pillarGlow siguen (cian/violeta/rosa) pero el sistema usa cian+rosa como acentos primarios.
> 3) FRAME (src/templates/Frame.tsx): superficie de marca CLARA (crema + grilla + glow tenve + grano), scrim/viñeta adaptados a fondo claro (el scrim sobre imágenes claras debe garantizar contraste del texto oscuro), logo/wordmark, chip de pilar, progreso, handle.
> 4) SISTEMA DE MARCADOR (src/templates/highlight.tsx): el tratamiento "slab" pasa a ser un MARCADOR tipo highlighter (swash con gradiente, esquinas suaves) y "underline" un subrayado grueso a mano; soportar color cian o rosa. Mantener firma backward-compatible.
> 5) fonts.ts: asegurar que embeba la nueva familia serif (woff2) como las demás.
> Archivos: src/theme.ts, src/render/fonts.ts, src/render/htmlShell.ts (grano/grilla claros), src/templates/Frame.tsx, src/templates/highlight.tsx, src/fonts/ (nuevo woff2). NO romper tipos ni el contrato; generate/reel/remix deben compilar; gate = npm run typecheck + npm run test verdes. Las plantillas concretas (Hook/Step/etc.) se reescriben en la Iteración 2; en esta iteración solo deben seguir compilando/renderizando (aunque se vean a medias). Fuente de verdad nueva: claro+serif+cian/rosa, demostrativo; lo registraré en memoria al final.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **theme tokens** (`src/theme.ts`): `colors` (bg navy, text claro, textMuted, accent cian, pink, violet, green, panel/panel2), `fonts` (display Anton / body Inter / mono JetBrainsMono), `fontSize`, `padding`, `tracking`, `surface` (bgDeep/glow/hairline/panelBorder/panelShadow/vignette), `space`, `pillarColor`, `pillarGlow`. Es la fuente de todos los valores; el rebrand **reescribe sus VALORES a claro** y añade `fonts.serif`, conservando los NOMBRES de token para no romper consumidores.
- **fontFaceCss** (`src/render/fonts.ts`): auto-embebe cualquier `Familia-Peso.ext` en `src/fonts/` como `@font-face` data URI (parsea familia/peso/italic del nombre). Añadir los woff2 de Playfair "simplemente funciona"; no requiere cambios de código (salvo confirmar naming).
- **htmlShell** (`src/render/htmlShell.ts`): inyecta `fontFaceCss`, el logo wordmark (`--brand-logo` desde `ia_es_wordmark.png`), grano SVG (`--brand-grain`), y `background:#000` en body. El grano y el `#000` de fondo deben adaptarse a claro.
- **Frame** (`src/templates/Frame.tsx`): superficie de marca (hoy navy+glow+grano), scrimLayer (oscurece para texto claro), vignetteLayer (oscura), chip pilar, progreso, logo, source. Todo asume tema oscuro → adaptar a claro (texto tinta sobre claro, scrim/viñeta que protejan texto OSCURO sobre imágenes claras).
- **highlightText** (`src/templates/highlight.tsx`): tratamientos `slab` (fondo color, texto bg) | `underline` | `color`. El `slab` ya es casi un marcador; se ajusta a swash highlighter con esquinas suaves; `underline` a subrayado grueso. Firma se mantiene; se añade soporte de color cian/rosa (ya recibe `color`).
- **Plantillas** (Hook/Lead/Step/Prompt/MythReality/Cta): consumen `theme.fonts.display` (Anton), colores oscuros, etc. En esta iteración NO se reescriben; deben seguir compilando con los tokens nuevos (se verán "a medias", p. ej. Anton sobre claro) — su rediseño es Iteración 2.
- **Logo asset** (`src/assets/ia_es_wordmark.png`): wordmark "ia.es". Sobre fondo claro, un wordmark blanco no se vería; revisar (puede requerir variante oscura del logo — anotado).
- **smoke tests / GhostNumber / registry**: dependen de tokens/colores; deben seguir verdes (los tests son de funciones puras; el cambio de valores de color no los rompe salvo asserts de color — revisar `pillarGlow` test que valida rgba).

### New Concepts Required

- **Tema claro (light theme)**: nuevo conjunto de valores para `colors`/`surface` (bg crema, ink oscuro, muted cálido, grilla/grano claros, glow tenue) bajo los MISMOS nombres de token.
- **Familia serif** (`theme.fonts.serif = "PlayfairDisplay"`) + sus woff2 en `src/fonts/`.
- **Marcador highlighter** (evolución de `slab`): swash con gradiente y esquinas suaves, en cian o rosa, texto oscuro encima (no texto-bg).
- **Scrim/viñeta para fondo claro**: en imágenes, el scrim debe garantizar contraste del TEXTO OSCURO (p. ej. velo claro/blanco abajo) — invierte la lógica actual.
- **Handle token / wordmark**: `@ia.punto.es` como handle; wordmark "ia.es". (El handle se usa en plantillas Cta — Iteración 2; aquí se deja el dato/while.)

### Key Business Rules

- **Fuente de verdad NUEVA**: claro + serif + cian/rosa + demostrativo. Reemplaza navy/Anton. Se registrará en memoria/`.context` al cierre del loop.
- **Backward-compatible a nivel de tipos/contrato**: `CarouselSpec`/`BaseSlideProps`/`Background` y las firmas (`highlightText`, etc.) no cambian; solo cambian VALORES de token y estilos.
- **Contraste**: texto tinta `#0B1020` sobre claro ≥ 4.5:1; el scrim sobre imágenes asegura legibilidad del texto oscuro.
- **Dos acentos**: cian (primario), rosa (secundario); el keyword del titular usa marcador cian o rosa (ya no "siempre cian" — el usuario aprobó cian+rosa). Sin morado neón.
- **Handle**: `@ia.punto.es` (no `@ia.es`).
- **Gate**: `npm run typecheck` + `npm run test` verdes; generate/reel/remix compilan y renderizan (aunque las plantillas se vean a medias hasta Iteración 2).

## Strategic Approach

### Solution Direction

Reescribir la **capa de fundación** (tokens + fuentes + Frame + marcador + shell) a tema claro, dejando las plantillas concretas para Iteración 2:

1. **Fuente serif local**: en la fase generate, descargar los woff2 de Playfair Display (600, 700, 800, 600 italic) desde Google Fonts (fonts.gstatic.com) a `src/fonts/` con naming `PlayfairDisplay-<peso>[italic].woff2`. `fontFaceCss` los embebe automáticamente. `theme.fonts.serif = "PlayfairDisplay"`.
2. **theme.ts (valores claros)**: `colors.bg` → crema (#FBFAF7); `colors.text` → tinta (#0B1020); `colors.textMuted` → gris cálido (#5B6472); `accent` cian y `pink` se mantienen; `panel`/`panel2` → superficies claras (blanco/levemente off) para tarjetas; `surface.bgDeep`/`glow`/`hairline`/`panelBorder`/`panelShadow`/`vignette` → versión clara (grano tenue oscuro sobre claro, glow cian tenue, hairline gris, viñeta clarísima o casi nula). Añadir `fonts.serif`. `pillarGlow` mantiene cian/violeta/rosa (tinte de glow), pero a opacidad adecuada para fondo claro.
3. **htmlShell.ts**: cambiar `body background` de `#000` a claro; el grano SVG sigue (ajustar opacidad/rol para claro). `--brand-grain` y un `--brand-grid` opcional.
4. **Frame.tsx**: `brandSurfaceStyle` → crema + grilla + glow tenue + grano; `scrimLayer` → para `{image}`, velo que asegure el texto OSCURO (degradado claro desde abajo) en vez de negro; `vignetteLayer` → muy sutil o desactivada en claro. Color de texto por defecto → `colors.text` (tinta). Chip/progreso/logo siguen.
5. **highlight.tsx**: `slab` → marcador highlighter (gradiente swash, borde redondeado, texto color tinta encima, fondo cian/rosa translúcido o sólido suave); `underline` → subrayado grueso a mano. Firma intacta (recibe color → cian o rosa).
6. **Plantillas (mínimo)**: que sigan compilando con los tokens nuevos; aceptable que se vean "a medias" (Anton sobre claro) hasta Iteración 2. Si algún color de texto queda ilegible (texto claro sobre claro), ajustar solo lo mínimo para que el smoke render no quede en blanco.

### Key Design Decisions

- **Reescribir VALORES de token conservando NOMBRES** (vs. crear tokens nuevos / theme dual): → cero ruptura de consumidores; el rebrand es un cambio de valores + adiciones (`fonts.serif`). Recomendado. Trade-off: el nombre `surface.bgDeep` deja de ser "deep navy" semánticamente; aceptable, se documenta.
- **Serif local descargada (vs. @import Google Fonts en runtime)**: → render reproducible/offline como el resto de fuentes; consistente con `fonts.ts`. Recomendado. Trade-off: acción de red puntual para bajar woff2 (autorizada por el usuario).
- **Scrim invertido para claro**: → en imágenes, proteger texto oscuro con velo claro inferior; mantiene contraste. Recomendado.
- **Marcador como evolución de `slab`** (vs. tratamiento nuevo): → reusa la firma y los llamadores; el look highlighter sale del estilo. Recomendado.
- **No reescribir plantillas en Iter.1**: → mantiene el alcance acotado y el gate verde; el "a medias" es temporal. Recomendado y explícito.
- **Logo sobre claro**: el wordmark actual puede ser claro (invisible en crema). Decisión: si el wordmark no se ve, en Iteración 2 se usa variante oscura del logo o texto "ia.es" como wordmark; en Iter.1 se anota (no bloquea el gate).

### Alternatives Considered

- **Theme dual (claro/oscuro switch)**: rechazado — complejidad innecesaria; el rebrand es un cambio de identidad, no un modo.
- **Mantener Anton para titulares**: rechazado — el usuario aprobó serif (Playfair) mayúscula/minúscula; Anton todo-mayúsculas es lo viejo.
- **@import Google Fonts**: rechazado para producción (no offline/reproducible); sí se usó en los mockups.
- **Reescribir todo (tokens+plantillas) en una sola iteración**: rechazado — riesgo alto; se separa fundación (Iter.1) de plantillas (Iter.2).

## Risk & Gap Analysis

### Requirement Ambiguities

- **Crema exacto / paleta clara**: bg #FBFAF7 (o #F4F1EA con más textura). Decisión: #FBFAF7 base, grilla/grano sutiles. Registrar.
- **Marcador: translúcido vs sólido**: el referente usa sólido pastel; aquí cian/rosa de marca. Decisión: marcador sólido suave (swash) con texto tinta encima. Registrar.
- **Logo sobre claro**: ¿se ve el wordmark actual? Si es claro, queda invisible → se aborda en Iter.2 (variante oscura) o wordmark de texto. Registrar; no bloquea Iter.1.
- **pillarGlow en claro**: opacidad/uso; tinte tenue. Registrar.

### Edge Cases

- **Plantillas "a medias" en Iter.1**: Anton sobre claro, posibles colores de texto claro-sobre-claro → asegurar al menos que `colors.text` (tinta) sea el default para que el render no salga en blanco. Verificar con smoke render.
- **smoke test `pillarGlow`**: valida substrings rgba (`139,92,246` etc.) — si cambio esos valores, el test rompe. Mantener los rgba de `pillarGlow` o actualizar el test acorde. Registrar.
- **Fuente no descargada / red caída**: si falla la descarga de Playfair, el render cae a serif del sistema (font-family fallback) — degradación aceptable, pero el objetivo es tenerla local. Mitigación: verificar que los 4 woff2 quedaron en `src/fonts/`.
- **Reel zona segura**: sin cambios de layout en Iter.1.
- **Carruseles existentes** (mentiras-ia, smoke): se verán claros "a medias"; no deben romper el render.

### Technical Risks

- **Texto ilegible temporal** (claro sobre claro) en plantillas no reescritas: mitigación: default `color = colors.text` (tinta) en Frame; revisar Hook/Lead/Step que setean colores propios (textMuted, etc. — siguen legibles sobre claro).
- **Naming de la fuente** mal parseado por `fonts.ts`: `PlayfairDisplay-700.woff2` → familia "PlayfairDisplay" (correcto, split por primer "-"). Italic: `PlayfairDisplay-600italic.woff2` → italic true, weight 600. Verificar.
- **Romper `pillarGlow` test**: mantener los rgba o actualizar test. Registrar.
- **Contraste del marcador**: texto tinta sobre cian/rosa claro debe ser legible; elegir tono de marcador con contraste suficiente.
- **Gate**: typecheck (cambios de valores no afectan tipos) + test (ajustar pillarGlow test si cambia) + render no-blanco.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Fuente serif Playfair local en src/fonts + theme.fonts.serif | Yes | descarga woff2; fonts.ts auto-embebe |
| 2 | Tokens de tema claro (valores) conservando nombres | Yes | colors/surface a claro |
| 3 | Frame: superficie clara + scrim/viñeta para texto oscuro | Yes | invertir scrim/viñeta |
| 4 | Marcador highlighter cian/rosa + subrayado a mano (highlight.tsx) | Yes | evolución de slab/underline |
| 5 | htmlShell claro (body bg + grano/grilla) | Yes | quitar #000 |
| 6 | Handle @ia.punto.es (dato; se aplica en plantillas Iter.2) | Partial | se fija el dato; uso visible en Cta = Iter.2 |
| 7 | No romper tipos; generate/reel/remix compilan; gate verde | Yes | plantillas "a medias" pero renderizan |
| 8 | Plantillas concretas reescritas | No (Iter.2) | fuera de alcance de esta iteración |

## Decisiones tomadas autónomamente

1. **Reescribir VALORES de token en `theme.ts` conservando NOMBRES** (sin theme dual); añadir `fonts.serif = "PlayfairDisplay"`.
2. **Descargar Playfair Display woff2 (600/700/800/600italic) a `src/fonts/`** con naming del repo; `fonts.ts` los embebe sin cambios.
3. **Tema claro**: bg `#FBFAF7`, text `#0B1020`, muted `#5B6472`, paneles claros; surface (grano/grilla/glow/viñeta) en versión clara y tenue.
4. **Scrim/viñeta invertidos** para proteger texto OSCURO sobre imágenes claras.
5. **Marcador**: `slab`→highlighter swash (cian/rosa), `underline`→subrayado grueso; firma intacta.
6. **Plantillas NO se reescriben en Iter.1** (solo deben compilar/renderizar); su rediseño es Iter.2. Default de texto = tinta para evitar claro-sobre-claro.
7. **Logo sobre claro**: si el wordmark queda invisible, se resuelve en Iter.2 (variante oscura o wordmark de texto); no bloquea Iter.1.
8. **Mantener los rgba de `pillarGlow`** (o actualizar su smoke test) para no romper el gate.
9. **Handle `@ia.punto.es`** queda fijado como dato; su uso visible se aplica al reescribir Cta (Iter.2).
