# SPDD Analysis: Iteración 1 — Fundación del sistema de marca (tema, fuentes, logo, Frame)

## Original Business Requirement
Iteración 1 (Fundación) del plan `.context/00-plan-mejora.md` para el generador de carruseles.
Alcance ACOTADO a la base del sistema de diseño, sin crear plantillas nuevas todavía:
1. Descargar fuentes Anton, Inter (400/600/700) y JetBrains Mono a `src/fonts/` con la convención
   `Familia-Peso.ext` (el parser de `src/render/fonts.ts` separa por "-", así que "JetBrains Mono"
   debe nombrarse `JetBrainsMono-500.woff2` y la familia en theme ser "JetBrainsMono").
2. Copiar los logos `ia_es_logo_transparent.png` / `ia_es_logo_navy.png` / `ia_es_perfil.png` a una
   carpeta de assets versionada.
3. Reescribir `src/theme.ts` con los tokens de `design-brand.md` (bg #0B1020, panel #151D33,
   panel2 #1C2640, accent cian #22D3EE, violet #8B5CF6, pink #F471B5, green #34D399, text #E8ECF4,
   textMuted #94A0B8; fuentes display Anton / body Inter / mono JetBrainsMono; padding 120; escala
   tipográfica del entregable 03).
4. Extender `src/templates/types.ts` y `src/templates/Frame.tsx` para soportar logo 56px arriba-izquierda
   en todas las piezas, prop `pillar` (chip de color), props `index`/`total` (progreso) y fuente al pie.
Mantener compatibilidad con las plantillas actuales (Cover/Bullet/Quote). Gate: `npm run typecheck` y
`npm run generate carousels/ejemplo.ts`.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **theme** (`src/theme.ts`): tokens globales (colors, fontSize, fontFamily, padding). Lo consumen `Frame`, Cover, Bullet, Quote. Reescribir SIN quitar claves en uso.
- **Frame** (`src/templates/Frame.tsx`): capa base síncrona de cada slide; pinta fondo+overlay y coloca children. Punto natural para logo/chip/progreso/fuente globales.
- **BaseSlideProps / SlideSpec / CarouselSpec** (`types.ts`): contrato de props compartidas y de un carrusel. `pillar`/`index`/`total`/`source` se añaden aquí.
- **fontFaceCss** (`src/render/fonts.ts`): embebe `src/fonts/*` como `@font-face` data-URI. Convención `Familia-Peso.ext`; familia = todo antes del primer "-".
- **htmlShell** (`src/render/htmlShell.ts`): documento HTML async; ya inyecta las fuentes en `<style>`. Único lugar async con acceso a disco antes del render.
- **Renderer** (`renderSlide.ts`): `renderToStaticMarkup` (SÍNCRONO) → `setContent` → screenshot. Espera `document.fonts.ready`.

### New Concepts Required
- **brandAssetsCss / variables de marca**: CSS (custom properties) con el logo embebido como data-URI, inyectado por `htmlShell` igual que las fuentes. Permite a `Frame` referenciar el logo sin lectura de disco síncrona.
- **pillar (pilar de contenido)**: enum Herramienta|Noticia|Prompt|Curiosidad → color de chip (cian/violeta/cian/rosa). Mapea a `design-brand.md` §5.
- **assets dir** (`src/assets/`): carpeta versionada para los 3 logos, resoluble relativa al módulo (como `src/fonts/`).

### Key Business Rules
- **60-30-10 / palabra clave en cian**: el acento cian se reserva para ≤10% (gobierna theme + plantillas futuras).
- **Logo en todas las piezas**: `Frame` muestra el logo por defecto (regla DESIGN.md §4); desactivable por prop.
- **Consistencia tipográfica**: el texto se renderiza por código con fuente embebida (no en la imagen IA). Gobierna fonts + htmlShell.
- **No romper el render existente**: Cover/Bullet/Quote deben seguir compilando y renderizando (theme mantiene claves; props nuevas opcionales).

## Strategic Approach

### Solution Direction
Capa de fundación puramente aditiva: reescribir `theme.ts` ampliando (no rompiendo) el set de tokens;
añadir archivos de fuente y logos; e inyectar el logo por el mismo canal async que las fuentes
(`htmlShell` → variable CSS) para que `Frame` lo consuma de forma síncrona vía `var(--brand-logo)`.
Flujo: `htmlShell` lee logo de `src/assets/` → define `:root{--brand-logo:url(dataURI)}` → `Frame`
pinta un `<div>` con `backgroundImage:"var(--brand-logo)"` arriba-izquierda 56px.

### Key Design Decisions
- **Embeber el logo como variable CSS en htmlShell** (no como prop ni lectura en Frame): trade-off = un poco más de acoplamiento en el shell vs. mantener `Frame` síncrono y todas las piezas con logo sin tocar cada plantilla. → Recomendado: mantiene el patrón existente de fuentes y es el de mínima sorpresa.
- **theme.ts aditivo, no destructivo**: conservar `fontFamily`, `colors.{text,textMuted,accent,bg}`, `fontSize.{title,heading,body,caption}`, `padding` (en uso por Cover/Bullet/Quote/Frame) y AÑADIR `colors.{panel,panel2,violet,pink,green}`, `fonts.{display,body,mono}`, escala ampliada. → Evita romper el typecheck.
- **Familias sin guion/espacio**: nombrar `Anton-400.woff2`, `Inter-400/600/700.woff2`, `JetBrainsMono-500.woff2`; en theme `display:"Anton"`, `body:"Inter"`, `mono:"JetBrainsMono"`. Trade-off: el nombre de familia mostrado pierde el espacio, irrelevante para render. → Necesario por el parser de `fonts.ts`.
- **Fuentes estáticas woff2 (no variables)**: descargar pesos estáticos desde Google Fonts (gstatic) para respetar la convención `-Peso` y pesos predecibles. → Evita ambigüedad de fuentes variables.
- **Logos en `src/assets/`**: junto a `src/fonts/`, resoluble por `dirname(import.meta.url)`. Los 3 PNG de la raíz se mueven/copian ahí. → Carpeta de assets versionada y co-localizada con el render.
- **default fontFamily del theme = Inter**: `theme.fontFamily` pasa a `'Inter, system-ui, ...'`; titulares usan Anton vía plantillas (iteración 2). En esta iteración el cambio de default no rompe nada.

### Alternatives Considered
- **Pre-resolver el logo a data-URI en el CLI y pasarlo como prop** (como `resolveBackground`): rechazado — obliga a tocar cli + cada plantilla y filtra un detalle de assets al contrato de slides.
- **Leer el logo dentro de Frame**: imposible — `Frame` corre bajo `renderToStaticMarkup` síncrono, sin I/O async.

## Risk & Gap Analysis

### Requirement Ambiguities
- **Tamaño/legibilidad del logo a 56px**: el wordmark "ia.es / IA EN ESPAÑOL" a 56px de alto puede quedar ilegible. Decisión autónoma: 56px es la ALTURA del bloque de logo; se usa `ia_es_logo_transparent.png` (texto claro sobre navy) con ancho automático. Revisable visualmente en el gate de render.
- **Qué variante de logo por defecto**: se usa la transparente (funciona sobre navy y sobre fondos IA). navy/perfil quedan disponibles como assets.

### Edge Cases
- **Carpeta `src/fonts/` hoy vacía** → `fontFaceCss()` ya devuelve "" y cae al fallback; tras añadir fuentes, embebe. Sin riesgo.
- **Fondo IA claro detrás del logo**: el logo transparente es de texto claro; sobre un fondo IA claro podría perder contraste. Mitigación: el overlay de fondo + reservar fondos claros para iteración posterior. Fuera de alcance ahora.
- **Slides sin pilar / sin index**: props opcionales; si faltan, no se pinta chip ni progreso (Cover/Bullet/Quote actuales no los pasan → siguen igual).

### Technical Risks
- **Descarga de fuentes (red)**: gstatic puede fallar en el entorno. Mitigación: el sistema funciona con fallback (Impact/system-ui/mono) y `fonts.ts` no rompe si faltan; documentar y reintentar. El gate de typecheck no depende de las fuentes.
- **Peso del HTML por data-URIs**: fuentes + logo embebidos agrandan el HTML; aceptable (ya ocurre con fuentes y fondos). Sin impacto en el PNG final.
- **Romper Cover/Bullet/Quote**: mitigado manteniendo claves de theme y haciendo props nuevas opcionales; el gate `generate carousels/ejemplo.ts` lo verifica.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Fuentes Anton/Inter/JetBrainsMono en `src/fonts/` con convención correcta | Yes | Riesgo de red en descarga; fallback cubierto |
| 2 | Logos en carpeta de assets versionada (`src/assets/`) | Yes | — |
| 3 | `theme.ts` reescrito con tokens de marca, sin romper claves en uso | Yes | Aditivo, verificado por typecheck |
| 4 | `Frame`/`types` con logo 56px, chip de pilar, progreso, fuente al pie | Yes | Logo vía variable CSS de `htmlShell` |
| 5 | Compatibilidad Cover/Bullet/Quote + gate verde | Yes | `typecheck` + `generate ejemplo.ts` |

### Decisiones tomadas autónomamente
- Logo embebido como variable CSS en `htmlShell` (no prop, no I/O en Frame).
- Assets en `src/assets/`; variante por defecto = `ia_es_logo_transparent.png`.
- theme aditivo conservando todas las claves actuales.
- Fuentes estáticas woff2 desde Google Fonts; `mono` family = "JetBrainsMono".
- 56px = altura del logo, ancho automático.
