# SPDD Analysis: Rediseño visual de plantillas — P3 sistema y consistencia (Iteración 3/3)

## Original Business Requirement

> REDISEÑO VISUAL del sistema de plantillas de la marca ia.es — ITERACIÓN 3 de 3 (P3: sistema y consistencia). Sobre P1 (superficie de marca+scrim+type-as-hero+slab cian) y P2 (ghost number, viñeta, hairlines, paneles con profundidad, Lead editorial). Objetivo P3:
> 1) THEMING REAL POR PILAR: hoy el pilar (herramienta/prompt=cian, noticia=violeta, curiosidad=rosa, vía pillarColor) solo cambia el color del chip. Quiero que el pilar dé AMBIENTE distinto a cada slide diferenciándolo en el feed, PERO respetando la fuente de verdad de marca: "la palabra clave del titular SIEMPRE en cian" — por lo tanto el SLAB/HIGHLIGHT del titular NO cambia de color (sigue cian). La diferenciación por pilar debe venir de elementos SECUNDARIOS: el tinte del glow de la superficie de marca (Frame.brandSurfaceStyle hoy usa surface.glow cian fijo), el color del ghost number (hoy fijo cian), el chip (ya), el progreso NN/MM y posibles hairlines/acentos secundarios, usando pillarColor (violeta noticia, rosa curiosidad, cian herramienta/prompt). El keyword del titular queda cian siempre. Hay que THREADear el pilar al Frame (que ya recibe `pillar`) y al GhostNumber.
> 2) GRILLA Y ESPACIADO CONSISTENTE: hoy los gaps/margins están sueltos (32, 36, 20, 28, 40...). Definir una escala de espaciado (8-pt: ej 8/16/24/40/64/96/120) como token en theme (theme.space) y aplicarla de forma consistente en Frame (padding ya=120) y en los gaps de las plantillas, para un ritmo visual coherente.
> 3) CTA DE CIERRE DISTINTO: el slide Cta debe SENTIRSE como el final del carrusel. Hoy es igual a los demás. Hacerlo distinto y más contundente (p. ej. una banda/realce cian prominente, pastilla de CTA mucho más grande/visible, handle prominente), SIN romper la regla 60-30-10 (no inundar todo de cian; un cierre fuerte pero on-brand).
> Archivos: src/theme.ts (pillarColor ya existe; añadir theme.space; surface.glow), src/templates/Frame.tsx (brandSurfaceStyle usa glow fijo → tintar por pilar; pasar pilar a la superficie y permitir glow por pilar), src/templates/GhostNumber.tsx (recibir color del pilar), src/templates/Cta.tsx (cierre distinto), y aplicar theme.space en las plantillas (Hook/Lead/Step/Prompt/MythReality/Cta) donde haya gaps mágicos. NO romper tipos (CarouselSpec/BaseSlideProps/Background) ni props; generate/reel/remix siguen funcionando; gate = npm run typecheck + npm run test verdes. Fidelidad de marca: navy + keyword SIEMPRE cian; violeta/rosa solo como ambiente secundario por pilar; sin morado neón cripto (el violeta de marca es #8B5CF6, úsese sutil); 60-30-10.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **pillarColor(pillar)** (`src/theme.ts`): herramienta/prompt→cian, noticia→violeta `#8B5CF6`, curiosidad→rosa `#F471B5`. Hoy solo lo usa el chip de `Frame`. Es la base del ambiente por pilar.
- **Frame** (`src/templates/Frame.tsx`): ya recibe `pillar`; pinta chip con `pillarColor`, `brandSurfaceStyle()` (glow cian fijo de `surface.glow`), scrim, viñeta. Punto donde el pilar debe tintar el glow.
- **surface.glow** (`src/theme.ts`, P1): glow cian fijo `rgba(34,211,238,0.16)`. Debe poder derivarse por pilar.
- **GhostNumber** (`src/templates/GhostNumber.tsx`, P2): número fantasma en `theme.colors.accent` (cian fijo). Debe recibir el color del pilar.
- **highlightText slab cian** (`src/templates/highlight.tsx`, P1): el keyword del titular SIEMPRE cian — NO se toca (regla de marca).
- **Cta** (`src/templates/Cta.tsx`): pastilla cian (`padding 20x36`, radius 999), `reason`, `handle` en textMuted. Hoy no se distingue del resto.
- **Gaps "mágicos"** en plantillas: Hook gap 28, Lead 40/20, Step 32, Prompt 32, MythReality 32/20, Cta 36. Candidatos a tokenizar con `theme.space`.
- **theme.padding=120**: margen del Frame; encaja como token superior de la escala 8-pt.

### New Concepts Required

- **theme.space (escala 8-pt)**: tokens `{ xs:8, sm:16, md:24, lg:40, xl:64, xxl:96 }` (+ `padding 120` ya existe como margen). Fuente única del ritmo de espaciado.
- **pillarGlow(pillar)**: helper que deriva el color del glow de superficie desde `pillarColor` a baja opacidad (~0.16), para tintar `brandSurfaceStyle` por pilar.
- **brandSurfaceStyle(pillar)**: la superficie acepta el pilar y usa `pillarGlow`.
- **GhostNumber color por pilar**: prop `color` (default cian) que las plantillas pasan según el pilar.
- **Cta "modo cierre"**: tratamiento visual distintivo del slide final (realce/banda cian, pastilla grande, handle prominente) on-brand (60-30-10).

### Key Business Rules

- **Keyword SIEMPRE cian**: el slab/highlight del titular no cambia con el pilar (fuente de verdad de marca). El pilar solo cambia AMBIENTE secundario.
- **Pilar = ambiente secundario**: glow de superficie, ghost number, chip, progreso, hairlines. Violeta/rosa sutiles; nada de morado neón cripto.
- **60-30-10**: el cierre Cta puede reforzar cian pero sin inundar (cian sigue siendo acento, no fondo dominante).
- **Consistencia de espaciado**: gaps/márgenes desde `theme.space`; ritmo coherente.
- **Backward-compatible**: tipos/props sin cambios; carruseles existentes mejoran, no rompen.
- **Gate**: `typecheck` + `test` verdes; generate/reel/remix funcionan.

## Strategic Approach

### Solution Direction

Sobre tokens + Frame + plantillas (sin tocar tipos), cerrando el sistema:

1. **Theming por pilar (Frame + GhostNumber + theme)**:
   - `pillarGlow(pillar)`: deriva rgba (~0.16) desde el hex de `pillarColor` (helper en `theme.ts`, p. ej. mapa pilar→rgba o conversión hex→rgba).
   - `brandSurfaceStyle(pillar?)`: usa `pillarGlow(pillar)` en vez del cian fijo; default (sin pilar) sigue cian.
   - `Frame`: pasar `pillar` a `brandSurfaceStyle`; el chip y el progreso ya/también usan `pillarColor` (progreso puede pasar de `textMuted` a un guiño del pilar, sutil).
   - `GhostNumber`: prop `color` (default `theme.colors.accent`); Step y MythReality pasan `pillarColor(pillar)` (necesitan conocer el pilar — está en `base`/props).
   - Keyword cian intacto.

2. **Escala de espaciado (theme.space + plantillas)**:
   - Definir `theme.space = { xs:8, sm:16, md:24, lg:40, xl:64, xxl:96 } as const`.
   - Reemplazar gaps mágicos por tokens cercanos (32→md/lg según rol; 36→lg; 20→sm/md; 28→md). Aplicar en los `gap` de los contenedores de cada plantilla y donde haya paddings sueltos relevantes. Mantener `theme.padding` (120) como margen del lienzo.

3. **Cta modo cierre (Cta.tsx)**:
   - Tratamiento distintivo: un realce/acento cian prominente (p. ej. una banda/hairline cian gruesa arriba o un marco), pastilla de CTA más grande y dominante, `handle` prominente (color texto + peso), y jerarquía de cierre (título + razón + pastilla + handle con más aire). Cian reforzado pero acotado (no fondo completo).

### Key Design Decisions

- **Pilar tinta SECUNDARIOS, no el keyword** (vs. cambiar el highlight por pilar): → respeta la regla de marca "keyword siempre cian"; la diferenciación viene de glow/ghost/chip. Recomendado. Trade-off: diferenciación más sutil, pero correcta de marca.
- **`pillarGlow` por mapa pilar→rgba** (vs. conversión hex→rgba en runtime): → un mapa explícito es simple, legible y evita parseo; cian/violeta/rosa a ~0.16. Recomendado.
- **Progreso/acentos secundarios con guiño de pilar** (sutil): → refuerza el ambiente sin saturar. Recomendado, conservador.
- **`theme.space` 8-pt + reemplazo conservador**: → ritmo coherente; mapear a valores cercanos para minimizar regresiones de layout. Recomendado. Trade-off: algunos gaps cambian levemente (intencional).
- **Cta con realce cian acotado (no fondo cian completo)**: → cierre contundente sin romper 60-30-10. Recomendado. Alternativa "fondo 100% cian" rechazada (rompe ratio y legibilidad del cuerpo).
- **GhostNumber recibe color** (vs. leer pilar internamente): → componente presentacional puro, el pilar lo resuelve la plantilla. Recomendado.

### Alternatives Considered

- **Cambiar el slab del keyword por color de pilar**: rechazado — viola "keyword siempre cian".
- **Fondo Cta 100% cian**: rechazado — rompe 60-30-10 y la legibilidad; se usa realce acotado.
- **Motivos gráficos por pilar (íconos)**: fuera de alcance P3 (evita complejidad); el ambiente por color es suficiente. Anotado como evolutivo.
- **Refactor total de spacing**: rechazado — se tokeniza y se reemplazan los gaps obvios, sin reescribir layouts.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Intensidad del tinte por pilar**: ~0.16 alpha del glow; afinable. Registrar.
- **¿El progreso NN/MM cambia de color por pilar?**: guiño sutil (sí, tenue) o se deja textMuted; decisión: tenue hacia pilar, conservador. Registrar.
- **Mapeo exacto de gaps→space**: por rol; 32→md(24)/lg(40) según contexto. Registrar valores en el canvas.
- **Forma del realce de cierre del Cta**: banda/hairline cian superior + pastilla grande; registrar.

### Edge Cases

- **Pilar undefined**: `pillarGlow(undefined)`/`pillarColor(undefined)` → cian (default actual). Sin regresión.
- **GhostNumber con color de pilar sobre fondo**: mantener opacidad baja para no competir; violeta/rosa a 0.12 siguen siendo textura.
- **Cambio de gaps rompe un layout ajustado** (p. ej. titular que ahora desborda): verificar render; mantener valores cercanos.
- **Cta en Reel (zona segura)**: el realce de cierre no debe caer en `REEL_SAFE_BOTTOM`.
- **Carruseles existentes** (mentiras-ia pilar curiosidad=rosa; estudiar-3-ias; smoke noticia): el ambiente cambia (mejora); verificar que no rompa.
- **Contraste del violeta/rosa**: solo ambiente (glow/ghost), no texto de cuerpo → contraste del texto intacto.

### Technical Risks

- **Regresión de layout por spacing**: mitigación: mapeo conservador + render real de smoke/varias plantillas.
- **Glow de pilar demasiado fuerte/temático**: mitigación: alpha baja; violeta de marca #8B5CF6 (no neón).
- **Threading de pilar a GhostNumber**: las plantillas deben tener el pilar disponible (está en props/base) — verificar que Step/MythReality lo reciben (vía `...base`/props) y lo pasan.
- **Determinismo**: CSS estático; sin random/tiempo.
- **Smoke tests**: lo nuevo es presentacional + un helper puro (`pillarGlow`/space) testeable.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Theming por pilar en glow de superficie | Yes | `pillarGlow` + `brandSurfaceStyle(pillar)` |
| 2 | Ghost number tintado por pilar | Yes | prop `color` |
| 3 | Keyword del titular SIEMPRE cian (no cambia) | Yes | slab intacto |
| 4 | Chip/progreso/acentos secundarios por pilar | Yes | pillarColor (chip ya; progreso guiño) |
| 5 | theme.space 8-pt aplicado a gaps | Yes | tokens + reemplazo conservador |
| 6 | Cta de cierre distinto y contundente (on-brand) | Yes | realce cian acotado + pastilla grande |
| 7 | Sin morado neón; violeta/rosa sutiles; 60-30-10 | Yes | alpha baja; cian sigue acento |
| 8 | No romper tipos/props; generate/reel/remix; gate verde | Yes | cambios presentacionales + verificación |

## Decisiones tomadas autónomamente

1. **`pillarGlow(pillar)` por mapa explícito** pilar→rgba (~0.16): cian/violeta/rosa; default cian.
2. **`brandSurfaceStyle(pillar?)`** usa `pillarGlow`; `Frame` le pasa su `pillar`.
3. **GhostNumber recibe `color`** (default cian); Step/MythReality pasan `pillarColor(pillar)`.
4. **Keyword del titular SIEMPRE cian** (slab intacto) — el pilar no lo toca.
5. **Progreso NN/MM con guiño tenue al color del pilar** (sutil); chip ya usa pillarColor.
6. **`theme.space = {xs:8,sm:16,md:24,lg:40,xl:64,xxl:96}`**; reemplazo conservador de gaps mágicos en las 6 plantillas (mapeo por rol, valores cercanos).
7. **Cta "modo cierre"**: realce cian acotado (banda/hairline superior) + pastilla grande + handle prominente; sin fondo cian completo (respeta 60-30-10).
8. **Motivos gráficos por pilar (íconos)** quedan como evolutivo, fuera de P3.
