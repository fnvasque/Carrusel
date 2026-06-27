# Carrusel

Genera carruseles de Instagram **por código**, no con una GUI. Defines cada slide
en TypeScript (plantilla + textos + fuentes + colores + fondo) y la herramienta
renderiza PNGs de **1080×1350** listos para subir. Los fondos pueden generarse con
IA (OpenAI `gpt-image-1`).

Pensado para automatizarse con Claude Code: todo es texto editable, sin clicks.

## Cómo funciona

```
Plantilla JSX → HTML (con tus fuentes embebidas) → Playwright (Chromium headless) → PNG
```

La IA genera los **fondos**; el JSX controla **texto, layout, fuentes, colores y tamaños**.

## Requisitos

- Node 18+ (probado con 22)
- `npm install` (Chromium ya viene con Playwright; **no** ejecutes `playwright install` si tu entorno lo trae preinstalado)
- Para fondos con IA: `export OPENAI_API_KEY=sk-...`

## Uso

```bash
npm install
npm run generate carousels/ejemplo.ts
# → output/ejemplo/slide-01.png ... slide-NN.png
```

## Crear tu propio carrusel

Copia `carousels/ejemplo.ts`. Un carrusel es una lista de slides; cada slide elige
una plantilla y le pasa props:

```ts
import { Cover, Bullet } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

const carousel: CarouselSpec = {
  name: "mi-post",
  defaults: { accent: "#A78BFA" },         // aplicado a todos los slides
  slides: [
    { template: Cover,  props: { title: "Mi título", background: { ai: "fondo abstracto morado", overlay: 0.4 } } },
    { template: Bullet, props: { step: "01", heading: "Punto 1", body: "...", background: { color: "#0A0A0A" } } },
  ],
};
export default carousel;
```

### Fondos

| Forma | Ejemplo |
|-------|---------|
| Color sólido | `{ color: "#0A0A0A" }` |
| Degradado | `{ gradient: "linear-gradient(135deg,#7C3AED,#2563EB)" }` |
| Imagen local | `{ image: "./foto.png" }` |
| IA | `{ ai: "descripción del fondo", overlay: 0.45 }` |

`overlay` (0–1) oscurece el fondo para que el texto se lea mejor. Los fondos con
`ai` se **cachean** en `.cache/ai/` por prompt: repetir no vuelve a llamar a la API.

### Plantillas

- **Cover** — portada: `eyebrow`, `title`, `subtitle`, `titleSize`
- **Bullet** — contenido: `step`, `heading`, `body`, `bullets[]`
- **Quote** — cita: `quote`, `author`

Props comunes a todas (en `src/templates/types.ts`): `background`, `fontFamily`,
`color`, `accent`.

Para añadir una plantilla nueva, crea `src/templates/MiPlantilla.tsx`, envuelve el
contenido en `<Frame>` y expórtala en `src/templates/index.ts`.

### Fuentes

Deja archivos en `src/fonts/` con el nombre `Familia-Peso.ext`, p.ej.
`Inter-400.woff2`, `Inter-700.woff2` (formatos: woff2, woff, ttf, otf). Se embeben
automáticamente en el render, así que el resultado es idéntico en cualquier máquina.
Sin fuentes propias, se usa la pila del sistema.

## Estructura

```
src/templates/   plantillas JSX (Cover, Bullet, Quote) + Frame + tipos
src/render/      JSX → HTML → PNG (Playwright), carga de fuentes, fondos
src/ai/          cliente gpt-image-1 con caché
src/theme.ts     colores y tamaños por defecto
carousels/       un archivo por carrusel
output/          PNGs generados (gitignored)
```

## Roadmap

- **Reels (video)**: pendiente. Se hará con [Remotion](https://www.remotion.dev/)
  (React → video). Requiere ffmpeg.
