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

A cada fondo `ai` se le **anexa automáticamente el estilo visual de la marca**
(navy + cyan rim light, editorial), para que todos los fondos generados sean
consistentes. Para desactivarlo en un fondo concreto: `{ ai: "...", brandStyle: false }`.

### Plantillas

Plantillas de marca (sistema visual **ia.es**, ver más abajo), una por rol de slide:

- **Hook** — portada stop-scroll: `eyebrow`, `title`, `highlight`, `subtitle`, `swipe`
- **Lead** — promesa en 1 frase: `kicker`, `text`, `highlight`
- **Step** — paso del desarrollo: `step`, `heading`, `highlight`, `body`, `bullets[]`
- **Prompt** — prompt copiable (mono): `heading`, `prompt`, `note`
- **MythReality** — mito vs realidad: `myth`, `reality`, `mythLabel`, `realityLabel`
- **Cta** — funnel al newsletter: `title`, `highlight`, `reason`, `handle`, `cta`

`highlight` resalta esa palabra del titular en cian (la "palabra clave" de la marca).
Plantillas originales **Cover** / **Bullet** / **Quote** siguen disponibles.

Props comunes a todas (en `src/templates/types.ts`): `background`, `fontFamily`,
`color`, `accent`, y los elementos de marca que pinta `Frame`: `pillar` (chip de
color), `index`/`total` (progreso `NN/MM`), `source` (fuente al pie), `showLogo`.

### Marca (sistema visual ia.es)

Definido en `src/theme.ts` y `.context/design-brand.md`:

- **Color**: fondo navy `#0B1020`, acento cian `#22D3EE` (regla 60-30-10: la palabra
  clave del titular siempre en cian). Chips por pilar: violeta (Noticia), rosa (Curiosidad).
- **Tipografía**: Anton (titulares MAYÚS), Inter (cuerpo), JetBrains Mono (prompts).
  Archivos en `src/fonts/`; logos en `src/assets/`.
- **Pilares** (`pillar`): `herramienta` · `noticia` · `prompt` · `curiosidad`.

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

## Indicador de viralidad

Mide si un carrusel tiene las palancas que generan **guardados/compartidos** antes de
publicarlo (proxy basado en `.context/04-quality-gate-viral.md`), y calibra contra métricas
reales después.

```bash
npm run score carousels/mi-carrusel.ts     # score 0-100 + desglose + qué mejorar
npm run generate carousels/mi-carrusel.ts  # muestra el score antes de renderizar
#   SCORE_STRICT=1 npm run generate ...     # bloquea el render si está bajo el umbral (75)
```

Bucle de aprendizaje (post-publicación): registra las métricas reales de Instagram y
compara predicho vs real para ir calibrando el indicador.

```bash
npm run record carousels/mi-carrusel.ts -- --saves=120 --shares=40 --reach=5000
npm run calibrate    # tabla predicho vs saves/1k vs shares/1k + correlación
```

Notas: el score está calibrado para carruseles tipo "how-to/herramienta"; los de
mito/curiosidad puntúan más bajo en *Accionable* por naturaleza (igual pasan el umbral).
Las penalizaciones de marca son **banderas para revisar**, no veredictos (pueden dar
falsos positivos, ej. una frase de miedo usada para *desmentirla*).

## Remix de Instagram

Le pasas el **link de un reel, post o carrusel** de Instagram y genera **2 variaciones**
del contenido (en español neutro o chileno), como archivos `.ts` en `carousels/` listos
para `generate`/`reel`. Analiza el original (hook, estructura, pilar, copy, estilo visual)
con un modelo multimodal de OpenAI y mapea todo a las plantillas de marca ia.es.

```bash
export OPENAI_API_KEY=sk-...
npm run remix "https://www.instagram.com/p/XXXXXXXXX/"
# → carousels/<slug>-v1.ts  y  carousels/<slug>-v2.ts  (+ score de viralidad de cada una)

# Flujo end-to-end de un solo comando (emite + renderiza):
npm run remix "<url>" -- --render          # + PNGs 4:5 de cada variación
npm run remix "<url>" -- --render --reel    # + PNGs y Reel 9:16 de cada variación
```

Opciones:

```bash
npm run remix "<url>" -- --es=cl                 # copy en español chileno (default: neutro)
npm run remix "<url>" -- --out=carousels/remix   # carpeta de salida de los .ts
npm run remix "<url>" -- --render --reel         # genera PNGs y Reel automáticamente
npm run remix "<url>" -- --frames=6              # frames a muestrear de un reel (default 5)
npm run remix "<url>" -- --min-score=80          # objetivo del loop de calidad (default 75)
npm run remix "<url>" -- --max-tries=4           # intentos de mejora por variación (default 3)
npm run remix "<url>" -- --no-improve            # desactiva el loop (más rápido/barato)
# Cookies para vencer el login wall (vía yt-dlp):
npm run remix "<url>" -- --cookies=cookies.txt           # archivo Netscape cookies.txt
npm run remix "<url>" -- --cookies-from-browser=chrome   # toma cookies del navegador
# Modo manual (último recurso si todo lo demás falla):
npm run remix -- --caption="el texto del post" --image=slide1.png --image=slide2.png
```

- **Ingesta robusta (3 niveles)**: usa **yt-dlp** si está instalado (lo más confiable;
  descarga el carrusel completo y el video del reel, y con cookies vence el login wall) →
  si no, **scraping público** de `og:meta`/JSON embebido → si no, **modo manual**
  (`--caption` / múltiples `--image`). Nunca se cae.
- **Análisis slide por slide**: captura TODAS las imágenes de un carrusel y, para reels,
  extrae varios frames del video con **ffmpeg**. Sin ffmpeg/video, cae al thumbnail.
- **Binarios opcionales**: `yt-dlp` (`pip install -U yt-dlp`) y `ffmpeg` se detectan en
  runtime; sin ellos, el remix sigue funcionando con menos alcance. Las cookies también
  se pueden pasar por env: `REMIX_COOKIES` / `REMIX_COOKIES_FROM_BROWSER`.
- **Imágenes similares**: cada variación trae prompts `ai` que reproducen el tema/composición
  del original re-skineados al look navy + cian de la marca (se renderizan con `generate`/`reel`).
- **Loop de calidad**: cada variación se puntúa con el indicador de viralidad y, si está
  bajo el umbral (75), se **re-genera con el feedback del score** hasta pasarlo o agotar los
  intentos (`--max-tries`, default 3); se emite siempre el mejor resultado. Ajusta el objetivo
  con `--min-score` o desactívalo con `--no-improve`.
- **Idioma**: el copy SIEMPRE sale en español, sin importar el idioma del original.
- El resultado es **texto editable**: revisa y ajusta el `.ts` antes de publicar; luego
  `npm run generate carousels/<archivo>.ts` (PNGs 4:5) o `npm run reel carousels/<archivo>.ts` (Reel 9:16).

Iteración 1 trabaja sobre el thumbnail principal + caption; capturar todas las slides de un
carrusel y transcribir el audio de un reel llegan en iteraciones siguientes.

## Tests

```bash
npm run test       # smoke tests offline de las funciones puras del pipeline
npm run typecheck  # comprobación de tipos
```

`npm run test` corre un runner mínimo (tsx + `node:assert`, sin dependencias) que valida
parsing de ingesta, catálogo de plantillas, validación de variaciones y scoring en memoria,
sin tocar red, OpenAI ni binarios externos. Junto a `npm run typecheck` es el gate de calidad.

## Reels (video 9:16)

Convierte cualquier carrusel en un Reel vertical (1080×1920) listo para Instagram,
reutilizando las mismas plantillas. Requiere **ffmpeg** en el PATH.

```bash
npm run reel carousels/mi-carrusel.ts
# → output/mi-carrusel/reel.mp4
```

- Render nativo 9:16 con **zona segura** inferior (la UI de IG no tapa el texto).
- **Duración por slide según su texto** (más texto = más tiempo de lectura), con hold en hook y CTA.
- **Zoom sutil alternado** (Ken Burns) + **crossfades**, y una **barra de progreso cian** de marca.
- Sin "DESLIZA →" (es video) y **sin audio** por defecto: súbelo a IG y añade un audio en tendencia ahí (más alcance).

Opciones:
```bash
npm run reel carousels/x.ts -- --seconds=2.5     # duración uniforme (reel más ágil)
npm run reel carousels/x.ts -- --fade=0.5        # transición más larga
npm run reel carousels/x.ts -- --audio=pista.mp3 # muxea tu audio (TikTok/Shorts/posteo nativo)
npm run reel carousels/x.ts -- --frames-only     # solo los PNG 9:16, sin video
```

## Roadmap

- **Plantillas-Reel dedicadas**: hoy el Reel reusa las plantillas del carrusel; a futuro,
  variantes pensadas para vertical (más aire, texto más grande).
