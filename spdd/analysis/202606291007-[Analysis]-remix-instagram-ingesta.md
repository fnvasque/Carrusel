# SPDD Analysis: Remix de Instagram — ingesta + análisis + 2 variaciones (Iteración 1/3)

## Original Business Requirement

> Funcionalidad "remix de Instagram": el usuario entrega un link de un reel, post o carrusel de Instagram. El sistema lo analiza en detalle (hook, estructura narrativa, pilares de marca, formato, copy, estilo visual) y genera automáticamente 2 variaciones del mismo contenido, siempre en español neutro o español chileno, como CarouselSpec listos para renderizar con la maquinaria existente (plantillas de marca ia.es, fondos IA similares, score de viralidad). Cuando exista generación de video, también produce el Reel. Esta es la fuente principal de uso del producto, así que debe ser robusta.
>
> ITERACIÓN 1 de 3: foco en el backbone — ingesta del link de IG (caption + media/thumbnail vía endpoints públicos/oEmbed o input manual cuando no se pueda fetchear), análisis estructurado del contenido, y generación de 2 variaciones como archivos CarouselSpec en español neutro/chileno reutilizando plantillas y fondos IA existentes.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **CarouselSpec** (`src/templates/types.ts`): la unidad de salida del producto — `{ name, defaults, slides[] }`. Toda la maquinaria (render, reel, score) consume esto. Las 2 variaciones DEBEN materializarse como `CarouselSpec` (idealmente archivos `.ts` en `carousels/`, igual que `mentiras-ia.ts`).
- **SlideSpec / Plantillas de marca** (`src/templates/index.ts`): `Hook`, `Lead`, `Step`, `Prompt`, `MythReality`, `Cta` (+ `Cover`/`Bullet`/`Quote` legacy). Cada rol de slide tiene props tipadas. El análisis de IG debe **mapearse** a esta gramática de plantillas, no inventar layout.
- **Pillar** (`herramienta` | `noticia` | `prompt` | `curiosidad`): clasificación de contenido de la marca que fija color de chip. El analizador debe clasificar el post en uno de estos pilares.
- **Background `{ ai }`** (`src/templates/types.ts`, `src/ai/openaiImage.ts`): prompt de imagen para `gpt-image-1`, cacheado por hash, con estilo de marca anexado automáticamente. "Imágenes similares" = derivar prompts `ai` que reproduzcan el estilo visual del original dentro del look navy+cian de la marca.
- **Virality score** (`src/score/virality.ts`): gate pre-publicación (umbral 75). Las variaciones generadas deben poder pasar por `scoreCarousel` y, deseablemente, superar el umbral.
- **Format** (`post` 4:5 / `reel` 9:16) y pipeline de Reel (`src/reel/`): ya existe generación de video. El requerimiento dice "cuando exista la funcionalidad de video" — pero **ya existe** (`npm run reel`); por tanto el remix puede encadenar reel sin esperar nada nuevo (se trata en iteraciones posteriores).
- **OpenAI client** (`src/ai/openaiImage.ts`): hoy SOLO expone `images.generate`. No hay capacidad de chat/visión. Reusa `OPENAI_API_KEY` y patrón de caché por hash.

### New Concepts Required

- **InstagramSource / Ingesta**: representación normalizada de un post de IG = `{ url, tipo (reel|post|carrusel), caption, hashtags, mediaUrls[] o rutas locales, thumbnail }`. Nuevo. Se obtiene de la URL vía fetch público (og:meta / JSON-LD) o de input manual cuando IG bloquea.
- **PostAnalysis**: salida estructurada del análisis del contenido = `{ hook, estructuraNarrativa[], pilar, formato, copyPorSlide[], estiloVisual, idiomaDetectado, tono, ganchosViralidad }`. Nuevo. Producido por un modelo de visión+texto a partir de la InstagramSource.
- **VisionClient / análisis con modelo**: nueva capacidad en `src/ai/` que llama a un modelo multimodal (chat completions con imagen) para producir el `PostAnalysis` y, después, los borradores de variación. Distinto de `openaiImage.ts` (que solo hace imágenes).
- **VariationDraft → CarouselSpec emitido**: el resultado del remix = 2 `CarouselSpec` en español neutro/chileno, serializados como archivos `.ts` en `carousels/` listos para `npm run generate` / `npm run reel`.
- **Comando `remix`**: nuevo entrypoint CLI (`src/remix/cli.ts` + script `npm run remix`) que orquesta ingesta → análisis → 2 variaciones → escritura de archivos.

### Key Business Rules

- **Idioma**: toda variación SIEMPRE en español neutro o español chileno, sin importar el idioma del original. Gobierna `PostAnalysis.copyPorSlide` y los archivos emitidos.
- **Fidelidad de marca**: las variaciones se expresan en la gramática de plantillas ia.es y el sistema visual navy+cian; no se copia el branding ajeno. Gobierna el mapeo `PostAnalysis → SlideSpec` y los prompts `ai`.
- **2 variaciones distintas**: deben ser dos enfoques diferenciados (p. ej. distinto ángulo de hook o distinta plantilla dominante), no dos copias casi idénticas.
- **Robustez ante bloqueo de IG**: si el fetch público falla (login wall, rate limit), el flujo NO se cae: degrada a input manual (caption pegado + ruta de imagen descargada). Gobierna la ingesta.
- **No republicar contenido ajeno tal cual**: el remix transforma (reescribe + reestructura + re-skinea), no plagia. Gobierna todo el pipeline.
- **Gate de viralidad**: las variaciones pasan por `scoreCarousel`; idealmente ≥75 (consistente con `.context/04-quality-gate-viral.md` y la memoria del proyecto sobre el filtro de calidad obligatorio).

## Strategic Approach

### Solution Direction

Pipeline en 4 etapas, nuevo módulo `src/remix/` + capacidad de visión nueva en `src/ai/`, reutilizando todo lo aguas abajo:

```
URL IG ──▶ [1 Ingesta] ──▶ InstagramSource ──▶ [2 Análisis visión+texto] ──▶ PostAnalysis
                                                                                   │
                                          ┌────────────────────────────────────────┘
                                          ▼
        archivos carousels/<slug>-v1.ts / -v2.ts  ◀── [4 Emisión .ts] ◀── [3 Generación 2 variaciones]
                                          │
                                          └──▶ (ya disponible) npm run generate / npm run reel / npm run score
```

- **Etapa 1 — Ingesta**: dado un link, detectar tipo (reel/p/tv) y fetchear el HTML público para extraer `og:title`, `og:description` (caption), `og:image` (thumbnail) y JSON-LD si está. Para carruseles, og: solo da la 1ª imagen; se acepta que iteración 1 trabaje con thumbnail principal + caption. Si el fetch es bloqueado, **degradar a input manual**: el usuario pega caption y/o pasa rutas de imágenes locales (`--caption`, `--image`). Cache por URL para no re-fetchear.
- **Etapa 2 — Análisis**: enviar thumbnail + caption a un modelo multimodal (chat completions con `image_url`/`b64`) con un prompt que devuelva `PostAnalysis` en JSON estricto (hook, estructura, pilar, formato, copy por slide, estilo visual, tono, ganchos). Cache por hash de input.
- **Etapa 3 — Generación**: con `PostAnalysis` + el sistema de marca (theme + catálogo de plantillas + reglas de `.context/04-quality-gate-viral.md`), pedir al modelo 2 `CarouselSpec` lógicos (en español neutro/chileno) como JSON: lista de slides con `template`, props textuales, `pillar`, y prompts `ai` "similares" al estilo original. Validar contra el set de plantillas conocidas.
- **Etapa 4 — Emisión**: serializar cada variación a un archivo `.ts` en `carousels/` (mismo formato idiomático que `mentiras-ia.ts`: imports desde `../src/templates/index.ts`, export default), de modo que el usuario corra la maquinaria existente sin fricción. Correr `scoreCarousel` y reportar score de cada variación.

### Key Design Decisions

- **Salida = archivos `.ts` en `carousels/`** (vs. objeto en memoria renderizado directo): → reutiliza el flujo completo existente (`generate`/`reel`/`score`), deja el resultado editable por el usuario y versionable, y respeta "todo es texto editable". Recomendado. Trade-off: serializar JSON→TS requiere un emisor cuidadoso (mapear nombre de plantilla a import), pero es determinista.
- **Nueva capacidad de visión separada de `openaiImage.ts`** (`src/ai/vision.ts` o `analyze.ts`): → mantiene responsabilidades separadas (imágenes vs. razonamiento), reusa `OPENAI_API_KEY` y el patrón de caché. Recomendado.
- **Ingesta resiliente con degradación a manual** (vs. depender de oEmbed/API oficial): → la API oficial de IG exige app token y revisión; el scraping público de og:meta es frágil pero suficiente para caption+thumbnail, y el fallback manual garantiza que la herramienta SIEMPRE produce salida (clave para ser "la fuente principal de uso"). Recomendado. Trade-off: en carruseles multi-imagen, iteración 1 solo ve el thumbnail; capturar todas las slides del original queda para iteración 2.
- **Análisis y generación como dos llamadas al modelo** (vs. una sola mega-llamada): → análisis explícito y cacheable es auditable y reutilizable entre las 2 variaciones; reduce alucinación al separar "entender" de "crear". Recomendado.
- **Validación estricta del JSON del modelo contra el catálogo de plantillas/props**: → evita emitir `.ts` que no compile. Recomendado; el typecheck (`npm run typecheck`) es el gate final.

### Alternatives Considered

- **API oficial de Instagram / oEmbed con token**: rechazada para iteración 1 — fricción de onboarding (app review, token) contradice "fuente principal de uso" inmediata; se puede sumar después como fuente preferente.
- **Renderizar la variación directo a PNG sin archivo intermedio**: rechazada — pierde editabilidad, versionado y el resto del toolchain; rompe la filosofía "por código".
- **Headless browser (Playwright, ya disponible) para scrapear el carrusel completo**: atractivo (Playwright ya es dependencia) pero IG exige login y detecta automatización; alto riesgo/mantención. Se posterga; iteración 1 usa fetch simple + manual.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Alcance de "lo analizas en detalle"**: ¿solo thumbnail+caption, o todas las slides/los frames del video? → Iteración 1: thumbnail principal + caption (decisión por mínima sorpresa y por el límite de og:meta). Multi-slide/transcripción de video → iteraciones 2-3.
- **"Español neutro o chileno"**: ¿el usuario elige por invocación o el sistema decide? → Default: neutro, con flag opcional `--es=cl` para chileno. Registrar como decisión.
- **"Imágenes similares"**: ¿similares al estilo del original o a la marca ia.es? → Regla de marca manda: similares en *composición/tema* al original pero re-skineadas al look navy+cian (brandStyle on). Registrar.
- **Dónde se escriben las variaciones**: → `carousels/<slug>-v1.ts` y `-v2.ts`, slug derivado del análisis. Registrar.

### Edge Cases

- **IG bloquea el fetch (login wall / 429)**: el flujo debe degradar a manual sin caerse.
- **Caption vacío o solo emojis/hashtags**: el análisis debe apoyarse más en la imagen y marcar baja confianza.
- **Post en idioma no español**: traducir/transcrear, no traducir literal.
- **Reel sin caption descriptivo**: la mayor parte de la info está en el video; iteración 1 solo tiene thumbnail → análisis parcial, marcado como tal.
- **Modelo devuelve JSON inválido o plantilla inexistente**: validar y reintentar/normalizar antes de emitir `.ts`; nunca emitir archivo que no compile.
- **Sin `OPENAI_API_KEY`**: el comando debe fallar con mensaje claro (igual que `openaiImage.ts`).
- **Variación con score < 75**: reportar advertencia (consistente con `cli.ts`), no bloquear por defecto.

### Technical Risks

- **Fragilidad del scraping de IG** (cambios de markup, anti-bot): impacto alto en la etapa de ingesta. Mitigación: parser tolerante de og:meta + JSON-LD, cache, y fallback manual siempre disponible.
- **Determinismo del emisor JSON→TS**: si el modelo nombra una plantilla/props inexistentes, el `.ts` no compila. Mitigación: whitelist de plantillas + esquema de props por plantilla + validación previa a escribir; typecheck como gate.
- **Costo/latencia de 2 llamadas multimodales + N imágenes**: mitigación: caché por hash en análisis y en `gpt-image-1` (ya existe); generar fondos solo al renderizar, no en el remix.
- **Calidad/idioma**: el modelo puede dejar anglicismos o romper reglas de marca (jerga/hype penalizadas por el score). Mitigación: inyectar reglas de `.context/04-quality-gate-viral.md` en el prompt y correr `scoreCarousel` como verificación.
- **Legal/ToS**: remixar contenido ajeno tiene implicancias; el sistema transforma y no republica idéntico. Fuera de alcance técnico de iteración 1, pero anotado.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Aceptar un link de reel/post/carrusel de IG | Yes | Detección de tipo por patrón de URL |
| 2 | Analizarlo en detalle (hook, estructura, pilar, formato, copy, estilo) | Partial | Iter.1 sobre thumbnail+caption; multi-slide/video en iter. 2-3 |
| 3 | Generar 2 variaciones distintas | Yes | Whitelist de plantillas + validación |
| 4 | Siempre en español neutro/chileno | Yes | Default neutro, flag `--es=cl` |
| 5 | Generar imágenes similares | Yes | Vía prompts `ai` derivados, re-skin de marca; se renderizan con la maquinaria existente |
| 6 | Producir Reel cuando exista la función de video | Yes (ya existe) | Encadenar `npm run reel` — se aborda en iteración posterior |
| 7 | Robusto (fuente principal de uso) | Partial | Fallback manual garantiza salida; robustez de scraping mejora en iter. 2 |

## Decisiones tomadas autónomamente

1. **Salida como archivos `.ts` en `carousels/`** (no render directo) para reutilizar todo el toolchain y mantener editabilidad. Naming `<slug>-v1.ts` / `-v2.ts`.
2. **Nueva capacidad de visión en `src/ai/`** separada de `openaiImage.ts`, reusando `OPENAI_API_KEY` y caché por hash.
3. **Ingesta = fetch público de og:meta/JSON-LD con fallback a input manual** (`--caption`/`--image`); sin API oficial ni headless browser en iteración 1.
4. **Idioma default = español neutro**, flag `--es=cl` para chileno.
5. **"Similares" = mismo tema/composición re-skineado al look de marca** (brandStyle on), no copia del branding ajeno.
6. **Dos llamadas al modelo** (analizar, luego generar) por auditabilidad y menor alucinación.
7. **Reel YA existe** (`npm run reel`), así que la cláusula "cuando exista video" no bloquea; el encadenado se deja para una iteración posterior por foco.
8. Iteración 1 trabaja con **thumbnail principal + caption**; captura multi-slide/transcripción de video se posterga.
