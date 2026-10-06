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
(casi negro `#06060A` con luz de acento lima `#C6FF3D`, editorial), para que todos los fondos generados sean
consistentes. Para desactivarlo en un fondo concreto: `{ ai: "...", brandStyle: false }`.

### Plantillas

Plantillas de marca (sistema visual **ia.es**, ver más abajo), una por rol de slide:

- **Hook** — portada stop-scroll: `eyebrow`, `title`, `highlight`, `subtitle`, `swipe`
- **Lead** — promesa en 1 frase: `kicker`, `text`, `highlight`
- **Step** — paso del desarrollo: `step`, `heading`, `highlight`, `body`, `bullets[]`
- **Prompt** — prompt copiable (mono): `heading`, `prompt`, `note`
- **MythReality** — mito vs realidad: `myth`, `reality`, `mythLabel`, `realityLabel`
- **Stat** — dato grande con contexto: `value`, `label`, `context` (el número cuenta desde 0 en el reel)
- **Cta** — funnel al newsletter: `title`, `highlight`, `reason`, `handle`, `cta`

`highlight` resalta esa palabra del titular en lima (la "palabra clave" de la marca).
Plantillas originales **Cover** / **Bullet** / **Quote** siguen disponibles.

Props comunes a todas (en `src/templates/types.ts`): `background`, `fontFamily`,
`color`, `accent`, y los elementos de marca que pinta `Frame`: `pillar` (chip de
color), `index`/`total` (progreso `NN/MM`), `source` (fuente al pie), `showLogo`.

### Marca (sistema visual ia.es)

Definido en `src/theme.ts` y `.context/design-brand.md`:

- **Look lima**: fondo casi negro `#06060A`, acento **lima `#C6FF3D`**, violeta `#7C5CFF` y rosa
  `#FF3D7F`; texto `#F4F4F6` y apagado `#8A8A99`; tarjetas `#13131A` con línea `#23232E`.
  Encima va una **grilla lima** al 7 % (líneas de 2 px, celda de 120 px) y una viñeta radial.
  Regla 60-30-10: la palabra clave del titular siempre en lima. Chips por pilar: herramienta y
  prompt en lima, noticia en violeta, curiosidad en rosa. En el reel la grilla deriva despacio.
- **Tipografía**: Anton (titulares MAYÚS), Inter (cuerpo), JetBrains Mono (prompts).
  Archivos en `src/fonts/`; logos en `src/assets/`.
- **Pilares** (`pillar`; el color del chip sale del pilar): `herramienta` · `noticia` · `prompt` · `curiosidad`.

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

**Bucle cerrado**: a partir de **3 carruseles registrados**, `record`/`calibrate` aprenden un
mapeo del score predicho a tus tasas reales (saves/1k, shares/1k) y lo guardan en
`metrics/calibration.json`. Desde entonces, cada reporte de score (`score`, `generate`, `remix`)
muestra una **proyección** "≈ X saves/1k · Y shares/1k según tus datos", así el número del
indicador se traduce a resultados reales esperados (marcada como *preliminar* con pocos datos).

Notas: el score está calibrado para carruseles tipo "how-to/herramienta"; los de
mito/curiosidad puntúan más bajo en *Accionable* por naturaleza (igual pasan el umbral).
Las penalizaciones de marca son **banderas para revisar**, no veredictos (pueden dar
falsos positivos, ej. una frase de miedo usada para *desmentirla*).

## Remix de Instagram

Le pasas el **link de un reel, post o carrusel** de Instagram y genera **2 variaciones**
del contenido (en español neutro o chileno), como archivos `.ts` en `carousels/` listos
para `generate`/`reel`. Analiza el original (hook, estructura, pilar, copy, estilo visual)
con un modelo multimodal de OpenAI y mapea todo a las plantillas de marca ia.es.

El post se lee con la **API oficial de Meta** (Instagram Graph API vía Facebook Login,
Business Discovery), **solo lectura** y sin usar tu sesión de Instagram: automatizar con la
identidad de tu cuenta personal es lo que hace que Instagram la marque. Ver
`spdd/analysis/202609271400-[Analysis]-migracion-api-meta.md`.

```bash
npm run meta:check     # verifica la conexión: cuenta, vencimiento y permisos del token
npm run remix "https://www.instagram.com/p/XXXXXXXXX/" -- --user=cuenta
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
npm run remix "<url>" -- --user=natgeo         # cuenta dueña del post (si el link no trae el @usuario)
npm run remix "<url>" -- --max-pages=20          # páginas de 50 posts a recorrer buscándolo (default 10)
npm run remix "<url>" -- --scrape                # respaldo con yt-dlp y el HTML público (NO recomendado)
# Modo manual (último recurso si todo lo demás falla):
npm run remix -- --caption="el texto del post" --image=slide1.png --image=slide2.png
```

- **Ingesta**: **API de Meta** (Business Discovery) → *solo con `--scrape`*: yt-dlp y el HTML
  público → **modo manual** (`--caption` / múltiples `--image`). Nunca se cae: si un nivel falla,
  explica por qué y pasa al siguiente.
- **Business Discovery** lee posts públicos de cuentas **Business o Creator** (no personales).
  La API no busca por URL: recorre el feed de la cuenta (páginas de 50, tope `--max-pages`)
  hasta dar con el shortcode del link. El @usuario sale del link (`instagram.com/cuenta/p/…`)
  o de `--user=cuenta` (acepta `@`). Los reels sin `media_url` (p. ej. audio con copyright)
  usan su portada.
- **`--scrape`** reactiva yt-dlp y el scraping del HTML público **sin tu sesión**. Va contra los
  Términos de Instagram: está apagado por defecto y avisa al usarse.
- **Análisis slide por slide**: captura TODAS las imágenes de un carrusel y, para reels,
  extrae varios frames del video con **ffmpeg**. Sin ffmpeg/video, cae al thumbnail.
- **Binarios opcionales**: `ffmpeg` (frames de reels) y `yt-dlp` (solo para `--scrape`) se
  detectan en runtime; sin ellos, el remix sigue funcionando con menos alcance.
- **Imágenes similares**: cada variación trae prompts `ai` que reproducen el tema/composición
  del original re-skineados al look lima de la marca (se renderizan con `generate`/`reel`).
- **Loop de calidad**: cada variación se puntúa con el indicador de viralidad y, si está
  bajo el umbral (75), se **re-genera con el feedback del score** hasta pasarlo o agotar los
  intentos (`--max-tries`, default 3); se emite siempre el mejor resultado. Ajusta el objetivo
  con `--min-score` o desactívalo con `--no-improve`.
- **Idioma**: el copy SIEMPRE sale en español, sin importar el idioma del original.
- El resultado es **texto editable**: revisa y ajusta el `.ts` antes de publicar; luego
  `npm run generate carousels/<archivo>.ts` (PNGs 4:5) o `npm run reel carousels/<archivo>.ts` (Reel 9:16).

### Configuración de Meta (una vez)

1. Tu cuenta de Instagram debe ser **profesional (Business o Creator)** y estar vinculada a una
   **Página de Facebook**.
2. En developers.facebook.com, crea una app tipo **Negocio** (queda en modo desarrollo; no
   necesita App Review mientras solo la uses tú) y agrega el producto *Instagram*.
3. En el **Explorador de la API Graph**, genera un token de usuario con los permisos de solo
   lectura `instagram_basic`, `instagram_manage_insights`, `pages_show_list`,
   `pages_read_engagement` y `business_management`, y extiéndelo a **long-lived** (~60 días)
   en el **Depurador de tokens**.
4. Completa el `.env` (está en `.gitignore`; nunca lo subas):

```bash
META_ACCESS_TOKEN=...          # token long-lived (se renueva cada ~60 días)
META_IG_USER_ID=1784...        # id de tu cuenta de Instagram (GET /me/accounts → instagram_business_account)
META_APP_ID=...
META_APP_SECRET=...            # Configuración de la app → Básica → Clave secreta (32 caracteres)
META_GRAPH_VERSION=v26.0
```

5. `npm run meta:check` muestra tu @usuario, cuándo vence el token y si falta algún permiso
   (sale con error si algo falla). Cada request va firmado con `appsecret_proof` cuando hay
   `META_APP_SECRET`, y avisa si el uso de la cuota de la API pasa del 80%.

## Base de conocimiento (kb)

Sistema aparte del generador: guarda posts, reels y carruseles de Instagram que te interesan
como **fichas ordenadas por tema** en `knowledge/`, un vault de **Obsidian**. Analiza las
imágenes, el caption y el audio de los reels. Plan completo en
`spdd/analysis/202609261400-[Analysis]-kb-instagram-telegram.md`.

Lee los posts con la **API oficial de Meta** (Business Discovery, igual que el remix: ver
"Configuración de Meta"), sin tu sesión de Instagram ni scraping. Por eso:

- Necesita saber **de qué cuenta es el post**. Si no se indica (`--user=cuenta`, el @ en el link o
  en el mensaje), se **descubre sola**: @menciones del caption y cuentas que ya guardaste
  (verificadas con Business Discovery), y si no, los **hashtags del caption** con Hashtag Search
  (posts de las últimas 24 h y destacados; trae el video aunque no se sepa la cuenta). Hashtag
  Search permite 30 hashtags distintos por semana: se usan como máximo 3 por post y se lleva la
  cuenta. Solo si nada funciona, el bot pregunta el @.
- Solo lee cuentas **Business o Creator** públicas.
- Algunos reels vienen sin video (p. ej. audio con copyright): se analiza su portada y no hay transcripción.

```bash
npm run kb:add "https://www.instagram.com/reel/XXXX/" -- --user=cuenta --nota="por qué me interesa"
npm run kb:add "<url>" -- --image=captura.png   # suma capturas al post
npm run kb:add -- --image=captura1.png --image=captura2.png  # solo capturas, sin link
npm run kb:ask "¿qué herramientas guardé para editar video?"   # pregunta a tu base
npm run kb:undo                        # deshace el último guardado
npm run kb:undo "<url o shortcode>"    # deshace el último guardado de ese post
npm run kb:reindex                     # reconstruye el índice desde el Markdown
npm run kb:temas [-- --ya]             # resume los temas atrasados (--ya: sin esperar las 24 h)
npm run kb:costos                      # cuánto se ha gastado en la API (hoy, 7 y 30 días, por post)
```

- **Fichas** (`knowledge/fuentes/`): resumen, ideas clave, herramientas, pasos, recursos, lo
  caption, transcripción y el **texto literal
  de cada imagen** (slides del carrusel o un cuadro cada ~3 s del reel, hasta 12).
- **Imágenes**: la miniatura (`_adjuntos/<id>.jpg`) va a git; la galería completa
  (`_adjuntos/slides/<id>/`) se ve en la ficha pero queda **fuera de git** (repo liviano).
- **Temas** (`knowledge/temas/`): los crea el bot solo y reutiliza los existentes. Si propone uno
  nuevo, se compara por significado con los existentes: parecido ≥ 0,80 se une; en la zona
  dudosa (0,55–0,80) decide un modelo barato. Cada página sintetiza todas sus fuentes.
  Al guardar solo se actualiza la lista de fuentes del tema; el **resumen se rehace a lo más una
  vez cada 24 h por tema** (el bot lo revisa cada hora; en la terminal, `kb:temas`), porque
  resumir un tema grande cuesta más que analizar varios posts. `KB_TOPIC_SYNTH_HOURS=0` vuelve a
  resumir en cada guardado.
- **Modelos**: la ficha y los resúmenes de tema usan `KB_MODEL` (default `gpt-4o-2024-11-20`). Un
  nombre con `/` (p. ej. `deepseek/deepseek-v4.1-flash`) va por OpenRouter (`OPENROUTER_API_KEY`) y,
  si falla o tarda más de 90 s, se repite con `KB_FALLBACK_MODEL`. Para comparar modelos con posts
  reales (costo, tiempo, fallos): `npx tsx scripts/kb-comparar-modelos.ts "<url>@<cuenta>" ...`.
- **Costos**: cada llamada a la API queda registrada (tokens y USD) en el índice; `kb:costos` o
  `/costos` en Telegram muestran el gasto, y el mensaje de cada guardado dice cuánto costó. Los
  cuadros de los reels se analizan en baja resolución (`KB_FRAME_DETAIL=high` para volver).
- **Consultas** (`kb:ask`): búsqueda híbrida (palabras sin tildes + significado) sobre un índice
  SQLite en `knowledge/.index/` (derivado, fuera de git; `kb:reindex` lo reconstruye). Entiende
  fechas ("esta semana", "últimos 10 días") y responde **solo con tu base, citando fichas**.
- **Nombres bien escritos**: la transcripción usa el caption como pista y los nombres mal
  transcritos (p. ej. "Cloud" por "Claude") se corrigen en toda la ficha.
- **Tus notas se respetan**: el bot solo escribe entre `<!-- kb:auto:start -->` y
  `<!-- kb:auto:end -->`. `## Mis notas` y las propiedades que agregues en Obsidian no se tocan.
- **Compartir el mismo post otra vez** actualiza su ficha (se identifica por el shortcode).
- **Cada guardado es un commit** con solo sus archivos (desactivable con `KB_GIT=0`;
  `KB_GIT_PUSH=1` hace push de respaldo). `kb:undo` lo revierte con `git revert`.

### Bot de Telegram

```bash
npm run kb:bot
```

Necesita `TELEGRAM_BOT_TOKEN` (de @BotFather) y `TELEGRAM_ALLOWED_CHAT_IDS` (tu chat; el bot
ignora a cualquier otro) en `.env`. Usa long polling: no necesita URL pública.

**Con el computador apagado**: el bot puede correr en un servidor gratuito (Oracle Cloud Always Free,
Docker), con la base en un repo git privado que Obsidian sincroniza. Guía en `deploy/README.md`.

- **Guardar**: en Instagram → Compartir → el bot. Como el link compartido no trae la cuenta, el bot
  pregunta el **@usuario** (con botones de las cuentas que ya guardaste), o mándalo junto al link:
  «@cuenta https://…». El resto del texto que acompañe al link se guarda como nota.
  Un mensaje de progreso se va editando y al final llega la ficha resumida con
  **↩️ Deshacer** (git revert) y **🏷 Cambiar tema** (temas más usados u "✏️ Otro").
- **Capturas**: fotos sueltas o en álbum se suman al último link (30 min); sin link, son una ficha nueva.
- **Preguntar**: cualquier texto que no sea link se responde con `kb:ask` (citas con link al post).
- **Comandos**: `/temas`, `/tema <nombre>`, `/ultimos`, `/costos`, `/ayuda`.
- Cola persistente en el índice: un guardado a la vez y, si el bot se reinicia, retoma lo pendiente.

### DMs a @ia.punto.es

Compartir un post o reel **por DM a la cuenta de Instagram** (Compartir → Enviar) también lo
guarda, y la cuenta te responde por DM con la ficha resumida. Lo recibe el mismo `npm run kb:bot`
a través de un webhook de Meta y un túnel HTTPS (ngrok), en el Mac o en el servidor (`deploy/README.md`).

- Un **reel** trae su video y caption dentro del DM (cuadros + transcripción), sin pedir el @usuario.
- Un **post** trae su imagen. Un **link** escrito a mano necesita el @: «@cuenta https://…».
- Un **texto** sin link es una pregunta: responde con tu base, como `kb:ask`.
- Deshacer y cambiar tema siguen en Telegram o la terminal.

Configuración (una vez):

1. En la app de Instagram de @ia.punto.es: *Configuración → Mensajes y respuestas → Herramientas
   conectadas → Permitir acceso a mensajes*.
2. En tu app de Meta → *Roles de la app → Instagram Testers*: agrega la cuenta desde la que vas a
   enviar los DMs y acepta la invitación en Instagram (*Configuración → Apps y sitios web*).
3. Regenera el token en el Explorador de la API Graph agregando `instagram_manage_messages` y
   `pages_manage_metadata`, extiéndelo a long-lived y actualiza `META_ACCESS_TOKEN`.
4. En `.env`: `META_WEBHOOK_VERIFY_TOKEN` (un texto al azar que eliges tú). Corre `npm run kb:bot` y
   un túnel al puerto 8787, p. ej. `ngrok http --url=<tu-dominio-estático>.ngrok-free.app 8787`.
5. En tu app de Meta → *Webhooks* → objeto **Instagram** → URL `https://<tu-dominio>/webhook`, el
   mismo token de verificación, y suscribe el campo **`messages`**.
6. Suscribe la Página a la app (Explorador, con el token de la Página):
   `POST /{page-id}/subscribed_apps?subscribed_fields=messages`.
7. Mándale un DM a @ia.punto.es: el bot registra tu **IGSID**; agrégalo a `INBOX_ALLOWED_SENDERS`
   y reinicia. Solo los remitentes de esa lista pueden guardar.

`npm run meta:check` revisa también los permisos de mensajes cuando el webhook está configurado.
`npm run kb:bot -- --debug-payload` guarda los webhooks crudos en `.cache/kb/inbox-raw/` para depurar.

Configuración en Mac:

```bash
brew install ffmpeg
cp .env.example .env    # OPENAI_API_KEY, variables META_* y del bot de Telegram
npm run meta:check      # verifica la conexión con la API de Meta
```

En Obsidian: *Open folder as vault* → `knowledge/`.

## Calendario y métricas

Sistema encima del generador: cada domingo un agente planifica la semana, el Mac renderiza las
piezas, el servidor las **publica solo** en @ia.punto.es y el bot mide cómo les fue y se lo cuenta
al planificador de la semana siguiente. Diseño completo en
`docs/superpowers/specs/2026-10-06-calendario-metricas-feedback-design.md`.

Mix fijo de la semana: **lun** reel tutorial · **mar** carrusel lista/guía · **mié** reel compartible
· **jue** reel demo · **vie** carrusel opinión/mito · **sáb** reel atemporal · **dom** descanso
(2 carruseles + 4 reels). Zona del calendario: `America/Santiago`; la hora por defecto es 14:00
(lun-sáb) hasta tener 100 seguidores. Audiencia: español neutro.

### Qué corre dónde

| Máquina | Qué hace | Cuándo | Qué escribe en `ia-es-kb` |
|---|---|---|---|
| **Nube** (tarea programada de claude.ai) | Planifica la semana, escribe los borradores y los valida (`validar.mjs`, lector frío) | Domingo 06:00 Chile | `_calendario/<semana>/plan.json` y borradores, `experimentos.md`, `aprendizajes.md` |
| **Mac** (launchd) | `npm run calendario:render`: renderiza con Chromium/ffmpeg, pasa el QA, sube los medios con `rsync` y verifica la URL pública | Cada hora mientras esté encendido | `_calendario/<semana>/render.json` |
| **Servidor** (Docker, el bot `kb`) | Sirve los medios, publica a la hora, publica la story 60 min después, toma instantáneas y manda resúmenes | 24/7 (scheduler cada minuto) | `_metricas/**`, `_calendario/registro.jsonl`, `_calendario/<semana>/estado.json` |

Cada archivo tiene **un solo escritor**, así nunca chocan dos `git pull --rebase`. Tú solo editas
`_calendario/config.json`. El estado de una pieza (`planificado` → `renderizado` → `programado` →
`publicado`, o `saltado` / `fallido`) sale de combinar los tres archivos.

### Puesta en marcha (una vez)

**1. Servidor y Mac.** Servidor: volumen de medios, token público y modo. El detalle (variables,
token de System User con `instagram_content_publish`) está en `deploy/README.md`, sección
"Calendario automático". Resumen:

```bash
scripts/deploy-to-server.sh ubuntu@<ip> --update
```

Después, en el Mac, con `SERVER_HOST`, `SERVER_MEDIA_DIR`, `MEDIA_PUBLIC_BASE` y `MEDIA_PUBLIC_TOKEN`
ya en `.env` (ver `.env.example`), instala el agente de launchd y prueba la subida:

```bash
scripts/calendario-install-mac.sh
```

Para ver qué haría sin tocar nada: `scripts/calendario-install-mac.sh --dry-run`. El script prueba
ssh con clave, sube un JPEG de prueba, pide su URL pública (espera 200 e `image/jpeg`) y lo borra.
Deja el render corriendo cada hora (log en `output/calendario/render.log`). El render trabaja sobre
**su propio clon** de `ia-es-kb` (`CALENDARIO_KB_DIR`, por defecto `~/.cache/carrusel/kb-calendario`,
clonado de `KB_REPO` o del `origin` de `knowledge/`), nunca sobre tu bóveda de Obsidian.

**2. Plantilla del planificador en la base.** Copia el manual, el validador y el `config.json` a
`ia-es-kb`:

```bash
scripts/kb-calendario-install.sh
```

Luego edita `_calendario/config.json` en la base: horas por defecto, `hashtagsBase` y, **sin falta**,
`audios` (ver más abajo). El script no pisa tu `config.json` si ya existe: te muestra la diferencia.

**3. Tarea programada en claude.ai.** Domingo 06:00 (America/Santiago), repo `ia-es-kb`, prompt:
`Sigue _calendario/INSTRUCCIONES.md al pie de la letra`.

**4. Primer domingo, a mano.** Con las piezas ya planificadas, renderiza tú mismo para ver el proceso:

```bash
npm run calendario:render
```

(`npm run calendario:render -- --dry-run` muestra lo pendiente sin renderizar.) Cuando el servidor las
reciba, el bot te manda el preview de cada pieza; prueba una sola con `/publicar <id>` y revisa en
Instagram.

**5. Deja correr la primera semana completa con launchd.**

Variables de entorno: `.env.example` (sección "Calendario automático"). `MEDIA_PUBLIC_TOKEN` y
`MEDIA_PUBLIC_BASE` deben ser **iguales** en el Mac y el servidor. `CALENDARIO_MODO` va solo en el
servidor: `auto` publica; `aviso` hace todo menos los POST a Meta (para depurar); sin la variable
el scheduler no arranca. `npm run meta:check` verifica el token y, con `CALENDARIO_MODO` definido, también exige el permiso
`instagram_content_publish`.

### Qué hace el bot en Telegram

| Comando | Qué hace |
|---|---|
| `/calendario` | Esta semana y la siguiente, con el estado de cada pieza |
| `/pausar` | Freno: no se publica nada más hasta `/reanudar` |
| `/reanudar` | Quita la pausa |
| `/publicar <id>` | Fuerza una pieza programada ahora (para probar). Solo la semana en curso. Responde de inmediato y te avisa el resultado cuando termina |
| `/saltar <id>` | Descarta una pieza (esta semana o la siguiente); el botón **Saltar** del preview hace lo mismo |
| `/metricas` | Últimos 7 días: mejor y peor pieza, seguidores ganados, hora con más audiencia |
| `/metricas <id\|url>` | Todas las instantáneas de un post |

Los comandos del calendario (y su ayuda en `/ayuda`) solo aparecen si `CALENDARIO_MODO` está definido;
`/metricas` está siempre. Una pieza forzada con `/publicar` que falla queda `fallido` o `saltado` y **no**
vuelve a su hora del plan. Los previews con la portada los sube el bot como archivo local, así que
la URL con `MEDIA_PUBLIC_TOKEN` nunca sale a Telegram.

En la terminal, el espejo de `/metricas`: `npm run insights` (también `-- --desde=AAAA-MM-DD`,
`-- --post=<id|url|piezaId>` y `-- --ahora` para tomar instantáneas en el acto).

### Operación del día a día

- **Pausar**: `/pausar` (y `/reanudar`). Si una pieza ya tenía su contenedor creado, ese contenedor
  se pierde (Meta lo expira) y la pieza no se publica tarde.
- **Saltar una pieza**: botón **Saltar** en su preview (vale hasta la hora de publicación) o `/saltar <id>`.
- **Borrar un post ya publicado**: **desde la app de Instagram**. La API de Meta no borra posts; el
  sistema no lo intenta.
- **El Mac no se prendió**: una pieza sin render a su hora se marca `saltado` con motivo y avisa; **nunca
  se publica tarde**. Para evitarlo, el bot avisa «prende el Mac» el domingo a las 18:00 (hora de Chile)
  si hay piezas sin render, y otra vez 12 h antes de la primera pieza que siga sin render. Al volver a encender el Mac, launchd corre el render solo, pero las piezas cuya
  hora ya pasó no se recuperan. Para no llegar a eso, prende el Mac entre el domingo y el lunes.
- **Pieza que falla**: si no pasa la puerta (QA, score menor a 75, borrador inválido) queda `fallido`
  con el motivo y se deja el hueco vacío. Si falla el entorno del Mac (Chromium, ffmpeg, disco, red,
  `rsync`), **no** se marca fallida: avisa por Telegram y la pieza sigue `planificado`, así la corrida
  de la hora siguiente reintenta sin volver a renderizar.

### Reglas del sistema que conviene saber

- **QA de luminancia**: el cuadro 0 de un reel/story no puede ser casi negro. Pasa si la luminancia
  media es mayor a 3 % y al menos 0,5 % de los píxeles es claro. El fondo de marca `#06060A` ronda el
  2,4 %, así que "mayor a 12 %" de la spec original no se puede exigir; un MP4 negro sigue fallando.
- **URL caída**: si ngrok cae a la hora de publicar, el reintento llega hasta 30 minutos después de la
  hora. Pasado eso, `fallido`. Un post puede salir hasta 30 min tarde por esa causa, nunca más.
- **Fondos con IA**: máximo 3 por semana, solo en Hook o Cta. El Mac quita los que sobran o están en otra
  plantilla (usa el fondo por defecto y avisa); no marca la pieza como fallida.
- **`render.json`**: lo escribe solo el Mac. Si lo editas a mano, tu cambio se respeta y el del Mac se
  vuelve a aplicar encima.
- **`SERVER_MEDIA_DIR` sin espacios**: solo letras, números y `_ . / -`. Es una ruta del servidor
  (`carrusel/media`, relativa a su home), no `/data/media`.
- **Audios**: `config.audios` arranca vacío. Pon tus pistas en `promo/audio/` (o en
  `CALENDARIO_AUDIO_DIR`) y escribe sus nombres de archivo en `audios` de `_calendario/config.json`. Mientras
  esté vacío el validador rechaza **todos los reels** y el mensaje de error nombra `config.audios`.
- **Horas de la audiencia**: `online_followers` solo existe desde 100 seguidores. Meta no dice en qué zona
  entrega las horas; se leen como `America/Los_Angeles` (por defecto; se cambia con la clave opcional
  `zonaOnlineFollowers` de `_calendario/config.json`, p. ej. `{ "valor": "America/Santiago" }`). **Al cruzar los 100 seguidores, compara las horas con tu app de Instagram**; si salen
  corridas 4-5 h, corrige `zonaOnlineFollowers`.
- **Comparar piezas**: siempre con la instantánea de 7 días (también hay 24 h, 72 h, 14 d, 21 d y 28 d).
  Con alcance menor a 50 se comparan conteos absolutos; desde 50, tasas.

### Bucle de feedback

El bot escribe `_metricas/bucle.json` con pesos por tema y arquetipo (solo con 3 o más piezas medidas),
ganadores (20 % superior), derivados pendientes y un diagnóstico mensual. El planificador lo **lee** y
decide; no cambia solo los pesos de `virality.ts`, el mix, la zona ni los parámetros de la puerta: si
propone un cambio, lo anota en `aprendizajes.md` y lo aplicas tú en `config.json`. Cada semana declara
**un** experimento (tema, arquetipo, hora, duración o tipo de hook) que se evalúa a las 4 semanas.

## Tests

```bash
npm run test       # smoke tests offline de las funciones puras del pipeline
npm run typecheck  # comprobación de tipos
```

`npm run test` corre un runner mínimo (tsx + `node:assert`, sin dependencias) que valida
parsing de ingesta, catálogo de plantillas, validación de variaciones y scoring en memoria,
sin tocar red, OpenAI ni binarios externos. Junto a `npm run typecheck` es el gate de calidad.

## Reels animados (video 9:16)

Convierte cualquier carrusel en un Reel vertical (1080×1920, 30 fps) **animado** con GSAP:
los títulos entran palabra por palabra, la palabra clave se resalta, los bullets aparecen escalonados
y las escenas se cruzan con un empuje vertical. Una barra de progreso lima crece en el borde
superior durante todo el reel y el primer cuadro (miniatura) ya muestra el hook entrando.
Reutiliza las mismas plantillas del carrusel.

```bash
npm run reel carousels/mi-carrusel.ts
# → output/mi-carrusel/reel.mp4 (1080×1920, 30 fps, sin audio)
```

Requisitos: **ffmpeg** en el PATH (`brew install ffmpeg`). No es necesario para `--frames-only`.

### Ritmo (`pace`)

Cada carrusel puede fijar `pace` en su spec (`pace: "ensenar"` o `pace: "rapido"`);
`--pace=` lo sobrescribe. Por defecto es **`ensenar`**.

| | `ensenar` (por defecto) | `rapido` (ritmo original) |
|---|---|---|
| Duración de escena | `clamp(2.4 + caracteres/16, 3.5, 8)` s, +1.0 s en la primera y la última; la escena 0 (hook) con tope de 5 s | `clamp(1.8 + caracteres/26, 2.4, 4.8)` s, +0.7 s en la primera y la última |
| Escena con bullets | al menos `1.0 + 1.8 × (bullets − 1) + 2.5` s | según el texto |
| Transición | 0.5 s | 0.35 s |
| Presupuesto de entradas | `min(0.45 × dur, 2.4)` s | `min(0.4 × dur, 1.6)` s |
| Entradas | 1.3× más lentas (salvo la escena 0) | como están |
| Bullets (`stagger`) | de a uno cada 1.8 s, sin comprimir, con 2.5 s de lectura tras el último (si la escena no alcanza, p. ej. con `--seconds` corto, el intervalo se acorta hasta 0.6 s); cada ✓ con su bullet | cada 0.12 s |

Los caracteres que cuentan son el texto que hay que leer: título, subtítulo, eyebrow, kicker,
heading, body, bullets, texto, cita, mito/realidad, razón y nota, el dato de Stat (valor,
etiqueta y contexto) y el prompt copiable de Prompt.

En ambos ritmos el hook (escena 0) es igual de rápido: titular completo y legible en el
cuadro 0, palabra clave en acento antes de 0.6 s. Un reel típico de 7-9 slides dura
~45-75 s en `ensenar`. `--seconds` y `--fade` siguen sobrescribiendo la duración de las
escenas y la transición.

### Flags

| Flag | Efecto |
|------|--------|
| `--pace=ensenar\|rapido` | Ritmo del reel (sobrescribe el `pace` del carrusel); un valor inválido falla con un mensaje claro |
| `--seconds=N` | Duración uniforme de todas las escenas (s); por defecto según el texto y el ritmo |
| `--fade=N` | Duración de la transición entre escenas (s); por defecto 0.5 s (`ensenar`) o 0.35 s (`rapido`) |
| `--frames-only` | Solo exporta un PNG por escena en `output/<name>/reel/`, sin componer el video |
| `--audio=ruta` | Muxea un archivo de audio (mp3, aac, etc.): se recorta a la duración del video con fade-out de 0.6 s; un audio más corto no acorta el video |

```bash
npm run reel carousels/x.ts -- --pace=rapido     # ritmo ágil original
npm run reel carousels/x.ts -- --seconds=2.5     # reel más ágil, duración fija
npm run reel carousels/x.ts -- --fade=0.5        # transición más larga entre escenas
npm run reel carousels/x.ts -- --audio=pista.mp3 # añade tu audio al video (TikTok/Shorts)
npm run reel carousels/x.ts -- --frames-only     # solo los 9:16 PNG, sin video
```

### Pruebas

```bash
npm run test:reel  # valida timing, markup y captura (requiere Chromium + ffmpeg)
```

Ejecuta dos suites:
1. **Timing y runtime**: segundos por escena, inicios con transición, duración total, cuadros a 30 fps.
2. **Captura**: Chromium + Playwright capturan cada cuadro y lo envían por stdin a ffmpeg.

### Marcas de animación (`data-anim`)

Para quienes escriben plantillas nuevas, aquí están los atributos que controlan qué y cómo se anima:

| `data-anim` | Efecto | Uso |
|---|---|---|
| `bg` | Zoom lento del fondo durante la escena | `Frame` (fondo) |
| `words` | El título entra palabra por palabra, subiendo (si dividirlo cambiara el corte de líneas, entra entero como `rise`) | Títulos de Hook, Lead, Step, Cta |
| `pop` | La palabra clave crece levemente y pasa al color de acento al terminar el título | Palabra `highlight` |
| `rise` | Sube y aparece | Subtítulos, body, etiquetas |
| `stagger` | Los hijos aparecen de a uno, de abajo hacia arriba (cada 1.8 s en `ensenar`) | Lista de bullets |
| `type` | Efecto máquina de escribir, con tope de duración | Texto de Prompt |
| `strike` | Tacha el texto de izquierda a derecha, una barra por línea | Mito en MythReality |
| `count` | El número cuenta desde 0 (respeta prefijos/sufijos; si no es numérico, entra como `rise`); la barra `[data-meter]` se llena en sincronía | Valor de Stat |
| `check` | El ✓ crece de 0 a 1 cuando entra su bullet | Checklist de Step |
| `caret` | El cursor parpadea (0.5 s) tras terminar de escribir | Prompt |

Reglas:
- Las marcas son inertes sin el runtime: si renderizas estático (p.ej. `npm run generate`),
  el markup de `data-anim` se ignora.
- Orden dentro de una escena: los elementos animados entran en orden de documento; cada uno
  empieza cuando el anterior está en mitad de su animación.
- El logo, chip de pilar, indicador `NN/MM` y fuente al pie no se animan (la barra de progreso
  del reel es un elemento aparte, solo del video).

## Roadmap

- **Plantillas-Reel dedicadas**: hoy el Reel reusa las plantillas del carrusel; a futuro,
  variantes pensadas para vertical (más aire, texto más grande).
