# Reels con video generado como contenido (serie «lo probé por ti»)

Fecha: 2026-10-20. Estado: borrador para revisión.

## Intención y por qué

Quedan 596 créditos en Higgsfield (plan Plus) que se renuevan el 2026-10-29 y,
según entendemos, no se acumulan. El objetivo que fijó Felipe es **alcance**,
no gastar por gastar.

Los datos de la cuenta (@ia.punto.es, 39 seguidores, 88 % del alcance viene de
no seguidores) dicen dos cosas:

- Poner un clip de Kling **detrás del título** del Hook no mueve nada: los 5
  reels de la semana 2026-10-12 con `hookVideo` retuvieron 11–33 % a los 3 s;
  los reels sin clip del mismo estilo, 22–40 %.
- Los dos reels con más alcance de toda la cuenta hablan de **la IA fabricando
  medios**: «video IA con 1 frase» (88 de alcance en 24 h) y «narra sin tu voz»
  (63). El resto va de 10 a 57.

Apuesta (supuesto a verificar): el tema «mira lo que la IA fabrica» viaja mejor
con gente que no nos conoce. Entonces los créditos van a **ser el contenido**:
reels donde el video generado se ve a pantalla completa desde el cuadro 0, con
la voz de Kokoro contando qué se pidió y qué salió, y un entregable concreto al
final (el prompt, el nombre del modelo, el costo en créditos).

## Metas

1. Publicar **3 reels extra** antes del 2026-10-29, sin tocar ninguna pieza
   del calendario ya planificada.
2. Que el primer cuadro de cada reel **pare el pulgar**: video generado a
   pantalla completa con movimiento desde el cuadro 0 y un titular de ≤ 7
   palabras con número o tensión. Nada de logo en el cuadro 0.
3. Usar entre 300 y 450 créditos en los clips de esas piezas (variantes
   incluidas) y dejar un criterio claro para el resto.
4. Que el motor pueda repetir esto en noviembre sin trabajo manual: una slide
   nueva (`Clip`) y el mismo flujo que ya aplica `hookVideo`.

## No metas y anti-metas

- No reemplazar reels del calendario (decisión de Felipe).
- No poner más `hookVideo` en los reels del calendario: los datos dicen que es
  neutro y mezclaría variables.
- No inventar formatos nuevos: los reels siguen la plantilla de la cuenta
  (narración Kokoro em_alex, subtítulos estilo cine, Cta de guardar, ≤ 20 s).
- Anti-meta: que el reel sea un «showcase» sin entregable. Cada uno adjunta el
  artefacto (prompt exacto, modelo y créditos) para que el guardado tenga
  motivo (regla del entregable de reels-hooks-ia).
- Anti-meta: personas con rasgos asiáticos o genéricas en los clips. Siempre
  chilenas o latinoamericanas, en lugares reconocibles de Chile
  ([[video-ia-personas-chile]]).
- Anti-meta: pantallas con texto inventado dentro del clip generado. El texto
  lo pone el motor.

## Las 3 piezas

Las tres van en la serie `lo-probe-por-ti`, arquetipo `demo`, pilar
`herramienta`, ritmo `gancho`, ≤ 20 s, señal `guardados`. Salen a las 19:00
como segunda pieza del día en la semana 2026-10-19:

| Día | Id | Promesa del hook (borrador, ≤ 7 palabras) | Clips |
|---|---|---|---|
| jue 2026-10-22 | `jue-pm-reel-tu-producto-en-anuncio` | «Una foto de tu producto, 1 anuncio» | 1 imagen Nano Banana del producto + 2 clips Kling (producto girando / producto en uso) |
| vie 2026-10-23 | `vie-pm-reel-kling-vs-seedance` | «Mismo prompt, 2 videos: ¿cuál gana?» | 2 clips Kling 3.0 + 2 clips Seedance 2.0, mismo prompt |
| sáb 2026-10-24 | `sab-pm-reel-tu-idea-en-10-segundos` | «Tu idea en video con 1 frase» | 2 clips Seedance 2.0 de 10 s |

Estructura tipo de cada reel (6 slides, ~18 s):

1. `Clip` (hook, escena 0): video a pantalla completa, titular arriba.
   Narración: la promesa en ≤ 6 palabras.
2. `Step` 1: qué se le dio (la foto, la frase).
3. `Clip`: el segundo video o la segunda variante.
4. `Step` 2: el prompt exacto, entre comillas (entregable).
5. `Stat` o `Lead`: modelo + créditos + tiempo («Kling 3.0, 9 créditos, 2 min»).
6. `Cta`: «Guárdalo para tu próximo video», handle, fuente (Higgsfield).

El guion fino de cada pieza lo escribe el constructor con la skill
`reels-hooks-ia` (hook de 3 capas, gatillo de guardado = prompt copiable,
gatillo de compartido = «mándaselo a quien vende por Instagram»), y pasa el
lector frío y el validador como cualquier pieza.

## Decisiones tomadas

### Slide nueva `Clip` (solo reels)

- Props: `title` (≤ 7 palabras, obligatorio en escena 0, opcional en otras),
  `highlight?`, `label?` (≤ 4 palabras, esquina superior: «Kling 3.0 · 9
  créditos»), `clip` (ver abajo), `narracion` como toda slide de reel.
- El motor la renderiza como **fondo negro con el texto encima** (titular en
  el tercio superior, label arriba a la izquierda, subtítulo de narración abajo
  como siempre). El video no entra al render de Playwright.
- Tras el render, el Mac **mezcla el clip a pantalla completa** en el rango de
  tiempo de esa escena con el mismo método de `scripts/reel-hook-video.sh`
  (escala/recorte a 1080×1920, oscurecido, blend `lighten` sobre el fondo
  negro, desvanecido al final). El script gana dos parámetros: segundo de
  inicio y duración; el fondo del reel es negro en esa escena, así que el texto
  blanco y el lima quedan encima igual que en el hook.
- Brillo del clip en `Clip`: 0,7 (no 0,45 como en `hookVideo`): aquí el video
  es el contenido y tiene que verse; el titular lleva sombra fuerte para seguir
  legible. Valor inicial, se ajusta a ojo en la primera pieza.
- El render calcula en memoria, por escena `Clip`, `inicio` y `fin` en
  segundos (de `ReelTiming`, descontando las transiciones) y mezcla en la
  misma corrida. La duración de la escena `Clip` se calcula como cualquier otra
  por su texto, con un piso de 3,0 s (la narración la alarga igual que a las
  demás); si el clip es más corto que la escena, se congela el último cuadro.
- Reglas del validador y del manual: `Clip` solo en reels; si la escena 0 es
  `Clip`, se exime la obligación de `Hook` con `resultado` y `logoEnCuadro0`
  debe ser `false`; máximo 3 `Clip` por reel; `clipsMaxSemana` en
  `config.json` (3 esta semana).

### De dónde salen los clips

- La slide lleva `archivo: "<nombre>.mp4"` como prop plana (el validador y el
  motor solo aceptan props de texto). Prompt, modelo y créditos de cada clip
  quedan en un `prompts.json` junto al archivo, en la caché, para el registro.
- Los archivos viven en el Mac que renderiza, en
  `~/.cache/carrusel/clips/<semana>/<id>/<archivo>`, fuera de git (la base es
  una bóveda de Obsidian que se sube sola cada pocos minutos; no queremos
  30 MB de video ahí). El render falla con mensaje claro si falta un archivo.
- Los clips se generan **en esta sesión, antes del 2026-10-24**, con el MCP de
  Higgsfield: 2 a 3 variantes por slot, se eligen con Felipe mirándolas, y las
  elegidas se copian a la caché. Modelos: Kling 3.0 pro 9:16 sin sonido
  (9 créditos / 5 s), Seedance 2.0 (18 créditos / 5 s), Nano Banana Pro para
  la imagen del producto (2 créditos). Presupuesto: ≤ 350 créditos para las
  3 piezas.
- Con lo que sobre (≈ 250): si al 2026-10-26 las dos primeras piezas superan
  en alcance a 72 h a la mediana de los reels de la semana, se genera un
  **banco** de 6–8 clips para las piezas de noviembre de la misma serie (los
  3 formatos repetidos con otros productos/ideas), guardado en la caché con su
  prompt. Si no superan, los créditos se dejan vencer: no vale la pena
  guardar clips de un formato que no funcionó. Esta decisión la toma Felipe
  con el dato en la mano.

### Calendario

- `config.json → mix`: se agregan 3 entradas `{ dia, formato: "reel",
  arquetipo: "demo", hora: "19:00" }` para jue (4), vie (5) y sáb (6);
  `separacionMinHoras` baja de 20 a 4 (precedente del sprint de 2 reels/día;
  el validador acepta ambos).
- Las 3 piezas se agregan a mano a `2026-10-19/plan.json` con sus borradores;
  `estado.json` y `render.json` no se tocan (el Mac renderiza lo `planificado`).
  El carrusel del viernes sigue a las 13:00.
- **El sábado 2026-10-24 por la noche se restauran** `mix` y
  `separacionMinHoras` (git log del archivo) para que el planificador del
  domingo 2026-10-25 no llene huecos de la tarde. Queda en el registro de
  cambios de `plan.json → motivo`.
- `experimentos.md`: nota bajo la semana 2026-10-19 diciendo que las 3 piezas
  `Clip` son una serie aparte y no entran en el experimento `hook`; se
  comparan por alcance y retención a 3 s contra los reels de la semana.

### Dónde corre y cómo se aplica

- Render normal en el Mac (launchd, Carrusel-render). Al terminar el reel, el
  propio render aplica los clips (no hace falta otra tarea programada: los
  archivos ya están en la caché), con QA y subida como hoy hace `aplicarHook`.
  Si un clip falta o la mezcla falla, la pieza se marca fallida y no se
  publica a medias (a diferencia de `hookVideo`, aquí sin clip no hay reel).
- `hookVideo` sigue existiendo y no cambia.
- **Clip ausente es error de entorno, no de contenido** (decisión tras la
  revisión del constructor): la pieza sigue `planificado`, el render avisa
  por Telegram y la reintenta a la hora siguiente. Una mezcla que falla el QA
  sí es error de contenido (`fallido`). Así se puede publicar el plan antes de
  tener todos los clips sin perder piezas.
- **Portada**: `cover.jpg` (miniatura del reel en el perfil) se extrae del
  cuadro 0 **después** de la mezcla, para que la miniatura muestre el video y
  no un fondo negro con texto. El QA de cuadro 0 corre sobre el archivo
  mezclado.

### Score léxico con `Clip` (decisión tras la revisión del constructor)

`scoreReel` en `src/score/virality.ts` hoy exige una slide `Hook` (25 puntos)
y una `Screen` (20); un reel `Clip → Step → Clip → Step → Stat → Cta` tiene
techo 65 y quedaría `fallido` antes de renderizar. Se modifica la rúbrica, no
se exime la pieza:

- Una `Clip` en escena 0 cuenta como portada: número o tensión en el título
  (como en `Hook`), `highlight` definido, título ≤ 7 palabras, `label` con el
  nombre del modelo. Los puntos de `resultado`/`app`/`modo` se reparten entre
  esos criterios.
- Cualquier `Clip` cuenta como «pantalla» (la IA se ve haciéndolo), con los
  mismos puntos que `Screen` cuando trae `label` y alguna slide lleva `source`.
- Con tests nuevos en el test del scorer; la calibración
  (`_metricas/calibracion`) no se toca.

### Orden de despliegue

1. Motor en `main` y `git pull` + `npm install` en Carrusel-render; validador
   instalado en la base con `scripts/kb-calendario-install.sh`. Hasta aquí
   ningún borrador `Clip` existe en la base (si no, `parseBorrador` lo marca
   `fallido`).
2. Generación de clips con Felipe, pieza por pieza (jueves primero). Los
   elegidos se copian a `~/.cache/carrusel/clips/<semana>/<id>/`.
3. Cada pieza se agrega a `plan.json` **cuando sus clips ya están en la
   caché**; `mix` y `separacionMinHoras` se cambian con la primera. Si una
   pieza entra antes que su clip, no se pierde (punto anterior), solo avisa.

## Restricciones

- Fecha dura: créditos vencen el 2026-10-29. La primera pieza sale el jueves
  22 a las 19:00; el motor tiene que estar en main y en Carrusel-render el
  jueves antes de las 09:00 (hora de render).
- La rúbrica de reels narrados (`scoreReel`, PR fnvasque/Carrusel#45) ya
  está en `main`. Este trabajo va en **una rama nueva desde `main`**.
- El render del Mac corre por launchd **cada hora** y renderiza todas las
  piezas `planificado` del clon de la base; Obsidian sube `plan.json` a los
  pocos minutos de editarlo. El orden de despliegue tiene que respetar eso
  (ver «Orden de despliegue»).
- El tope de 20 s con narración real de Kokoro: apuntar a ≤ 19 s en el
  validador ([[linea-trabajo-con-ia-2026-10-18]]).
- Validador: 6–8 slides, score léxico ≥ 75 (número en el título, verbos de
  acción en los Step, `source` en props, Cta de guardar con handle).

## Qué se le deja al constructor

- Diseño visual exacto de `Clip` (tamaño del titular, sombra, posición del
  label) dentro del estilo de la cuenta (lima, Anton/Inter).
- Cómo calcular `inicio`/`duracion` por escena a partir de `ReelTiming`
  (solapes de transición incluidos) y dónde escribir `clips.json`.
- Generalizar `reel-hook-video.sh` o hacer un script hermano; tests de
  `timing` y del validador (`test/smoke.ts`, tests de `validar.mjs`).
- Los guiones de las 3 piezas y los prompts de los clips (en inglés, 40–800
  caracteres, una toma continua, acción en la mitad inferior cuando hay
  titular encima, personas chilenas).
- El orden de trabajo: primero el motor (jueves 09:00 es el límite), después
  generación de clips con Felipe eligiendo, después borradores y validación.

## Cómo sabremos si funcionó

A 72 h de cada pieza: alcance y retención a 3 s frente a los otros reels de la
semana 2026-10-19 (mediana de alcance hoy ≈ 48). Guardados y envíos se miran
pero con conteos de un dígito no deciden. Evaluación el 2026-10-27 para decidir
el banco de clips, y el 2026-11-02 junto con el resto de la fase.
