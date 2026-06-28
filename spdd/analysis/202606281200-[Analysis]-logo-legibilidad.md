# SPDD Analysis: Evolutivo 1 — Legibilidad del logo (wordmark a 56px)

## Original Business Requirement
El logo de marca que pinta `Frame` (`src/assets/ia_es_logo_transparent.png`) incluye el wordmark
"ia.es" + el subtítulo "IA EN ESPAÑOL". A 56px de alto, el subtítulo queda ilegible y ensucia la
esquina. Objetivo: usar una variante **solo-wordmark** ("ia.es", con el punto cian) legible a ese
tamaño, sin perder la consistencia. Gate: `npm run typecheck` + `npm run generate carousels/ejemplo.ts`.

## Domain Concept Identification

### Existing Concepts (from codebase)
- **brandLogoCss** (`src/render/htmlShell.ts`): lee `src/assets/ia_es_logo_transparent.png` y lo embebe como `--brand-logo`. Punto a cambiar para usar la variante wordmark.
- **Frame** (`src/templates/Frame.tsx`): pinta `--brand-logo` en un `div` de 140×56. Con un wordmark de menor relación ancho/alto, conviene revisar el `width`.
- **src/assets**: contiene las 3 variantes actuales (transparent/navy/perfil). Se añade la variante wordmark.

### New Concepts Required
- **ia_es_wordmark.png**: recorte del bloque superior (solo "ia.es") del logo transparente, generado por análisis del canal alfa (sin texto de subtítulo).

### Key Business Rules
- **Logo en todas las piezas** (design-brand.md §4): debe seguir presente, ahora legible.
- **El punto cian** del wordmark es parte de la identidad: el recorte debe conservarlo.
- **Consistencia tipográfica/visual**: usar el activo de marca, no recrear el wordmark con texto.

## Strategic Approach

### Solution Direction
Generar una variante `ia_es_wordmark.png` recortando el bloque superior del logo transparente mediante
PIL: detectar las filas con contenido (alfa > umbral), separar el bloque "ia.es" del bloque subtítulo por
el hueco vertical entre ambos, recortar el bloque superior con un margen y hacer trim horizontal. Apuntar
`brandLogoCss` a esa variante y ajustar el `width` del logo en `Frame` a la nueva relación de aspecto.

### Key Design Decisions
- **Recorte por alfa con PIL** (no coordenadas a ojo): trade-off = un script de generación vs. robustez. → Recomendado: encuentra el bloque exacto sin adivinar píxeles; reproducible.
- **Nueva variante como asset versionado** (`ia_es_wordmark.png`), conservando las 3 originales: → no destruye activos; `htmlShell` elige cuál embeber.
- **Ajustar `width` del logo en Frame** según el aspecto del wordmark recortado (alto fijo 56, ancho proporcional): → evita deformación/espacio sobrante. Se calcula del PNG generado.
- **`backgroundSize:"contain"` + `backgroundPosition:"left center"`** ya garantizan que no se deforme aunque el width sea aproximado. → margen de seguridad.

### Alternatives Considered
- **Subir el logo completo a ~80px**: rechazado — agranda el bloque y el subtítulo sigue compitiendo; la esquina pierde aire.
- **Recrear "ia.es" con texto + punto cian**: rechazado — difícil clonar la tipografía/kerning exactos; mejor usar el activo real.
- **Recorte a ojo con sips**: rechazado — frágil ante variaciones; PIL por alfa es exacto.

## Risk & Gap Analysis

### Requirement Ambiguities
- **Cuánto margen dejar alrededor del wordmark**: decisión autónoma — ~6% del alto del bloque como padding, para que respire sin parecer recortado.
- **Relación de aspecto resultante**: se mide del PNG generado y se fija el `width` en Frame (alto 56).

### Edge Cases
- **Logo con antialias muy tenue**: usar umbral de alfa (p. ej. >16) para no incluir píxeles casi-transparentes en el bbox.
- **Si el script no encontrara dos bloques** (un solo bloque): caer a un trim simple del contenido completo (no rompe; solo no separa subtítulo). Registrar.
- **Falta del asset wordmark en runtime**: `brandLogoCss` ya degrada a `--brand-logo:none` si no existe.

### Technical Risks
- **PIL no determinista entre versiones**: el recorte es geométrico simple (bbox por alfa), estable. Bajo riesgo.
- **Cambio de aspecto rompe el encuadre**: mitigado por `contain` + medición real del width. Verificable en el gate visual.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Variante `ia_es_wordmark.png` solo-wordmark, con punto cian | Yes | recorte por alfa (PIL) |
| 2 | `htmlShell` usa la variante wordmark | Yes | cambia el nombre de archivo |
| 3 | `Frame` muestra el logo legible a 56px sin deformar | Yes | ajustar width al aspecto |
| 4 | Gate verde + revisión visual | Yes | typecheck + generate ejemplo |

### Decisiones tomadas autónomamente
- Generar `ia_es_wordmark.png` por recorte de alfa (bloque superior) con PIL; padding ~6%.
- Conservar las 3 variantes originales; añadir la nueva.
- Ajustar `width` del logo en Frame al aspecto medido (alto 56).
- Umbral de alfa >16 para el bbox.
