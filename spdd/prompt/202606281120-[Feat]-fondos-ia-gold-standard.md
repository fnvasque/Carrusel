# Fondos IA con estilo de marca + carrusel gold-standard + README

## Requirements
- Aplicar el look de marca a TODO fondo generado por IA, automáticamente y con opt-out.
- Mantener la caché de imágenes correcta tras anexar el sufijo.
- Entregar un carrusel de referencia (gold-standard) que demuestre el sistema completo.
- Actualizar la documentación para reflejar plantillas, tokens, pilares y fondos IA.

## Entities
```mermaid
classDiagram
direction TB
class Background {
  <<union>>
  color|gradient|image|ai
}
class AiBackground {
  +ai: string
  +overlay?: number
  +brandStyle?: boolean
}
class resolveBackground {
  +applies BRAND_IMAGE_STYLE to ai prompts
}
class CarouselSpec {
  +name
  +slides[]
}
AiBackground --> Background : variante
resolveBackground --> AiBackground : consume
CarouselSpec --> "templates" : usa Hook/Lead/Step/Cta...
```

## Approach
1. Estilo de marca en fondos IA:
   - Añadir `brandStyle?: boolean` a la variante `{ ai }` de `Background` en `types.ts`.
   - En `background.ts`: definir `BRAND_IMAGE_STYLE` (texto de design-brand.md §6, sin flags MJ) y `applyBrandStyle(prompt, enabled)`; al resolver `{ ai }`, pasar `generateBackground(applyBrandStyle(bg.ai, bg.brandStyle))`.
2. Gold-standard:
   - Reescribir `carousels/ejemplo.ts` como pilar Noticia (Hook → Lead → Step×3 → Cta) con copy real del entregable 02; fondos navy por defecto + un gradiente; un slide con fondo `{ ai }` comentado y documentado.
3. Documentación:
   - Actualizar `README.md`: nuevas plantillas (Hook/Step/Prompt/Cta/Lead/MythReality), tokens de marca, pilares y chips, y el sufijo automático de fondos IA (+ cómo desactivarlo).

## Structure
### Relaciones
1. `resolveBackground` depende de `BRAND_IMAGE_STYLE`/`applyBrandStyle` y de `generateBackground`.
2. `ejemplo.ts` depende de `src/templates/index.ts` (plantillas nuevas).
### Capas
1. Contrato: `types.ts` (Background + brandStyle).
2. Resolución: `background.ts` (política de marca).
3. Cliente API: `openaiImage.ts` (sin cambios; recibe el prompt ya enriquecido).
4. Contenido: `carousels/ejemplo.ts`. 5. Docs: `README.md`.

## Operations

### Update Type - src/templates/types.ts
1. En la variante `{ ai: string; overlay?: number }` añadir `brandStyle?: boolean`.
2. JSDoc: "Por defecto se anexa el estilo visual de marca; `brandStyle:false` lo desactiva."

### Update Resolver - src/render/background.ts
1. Definir `const BRAND_IMAGE_STYLE = "editorial tech photography, deep navy #0B1020 background, cinematic cyan rim light with subtle violet glow, high contrast, minimalist composition, generous negative space for text, shallow depth of field, photoreal, no text, no watermark"`.
2. `function applyBrandStyle(prompt: string, enabled?: boolean): string` → si `enabled === false` devuelve `prompt`; si no, `` `${prompt}, ${BRAND_IMAGE_STYLE}` ``.
3. En el branch `"ai" in bg`: `const image = await generateBackground(applyBrandStyle(bg.ai, bg.brandStyle));`.
4. Constraint: no cambiar la firma pública de `resolveBackground`.

### Rewrite Content - carousels/ejemplo.ts
1. Pilar Noticia, 6 slides: Hook (highlight en cian) → Lead (promesa) → Step 01/02/03 (con index/total y source) → Cta (newsletter, handle ia.es).
2. Copy real del entregable 02; fondos navy por defecto + 1 gradiente; comentar un slide con fondo `{ ai }` mostrando que el sufijo de marca se aplica solo.
3. Constraint: renderizable sin `OPENAI_API_KEY`.

### Update Docs - README.md
1. Sección Plantillas: añadir Hook/Step/Prompt/Cta/Lead/MythReality con sus props clave.
2. Sección de marca: tokens (navy/cian), pilares y chips, fuentes Anton/Inter/JetBrainsMono.
3. Sección Fondos: documentar el sufijo automático `[ESTILO MARCA]` y `brandStyle:false`.

### Verify
1. `npm run typecheck`. 2. `npm run generate carousels/ejemplo.ts` → PNGs sin error; inspección visual del gold-standard.

## Norms
1. La política de marca (sufijo) vive en la capa de resolución, no en el cliente de API.
2. Cambios de contrato aditivos y opcionales; sin romper carruseles existentes.
3. Copy del gold-standard respeta las reglas de microcopy (entregable 02): sin hype/jerga/clickbait.
4. README en español, consistente con el estilo actual del archivo.

## Safeguards
1. Funcional: fondos `{ ai }` reciben el sufijo salvo `brandStyle:false`.
2. Caché: el hash incluye el prompt con sufijo → sin colisiones con prompts sin marca.
3. Compatibilidad: `typecheck` verde; carruseles previos (`_smoke-plantillas`) siguen renderizando.
4. Sin red en el gate: `ejemplo.ts` renderiza sin API key (fondos navy/gradiente).
5. Cliente API intacto: `generateBackground` no cambia su firma ni su manejo de errores.
6. Docs veraces: los comandos citados en el README funcionan tal cual.
7. Alcance: cierre del plan; sin Reels ni nuevas plantillas fuera de lo listado.
