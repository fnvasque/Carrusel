# Look "lima" + ritmo de enseñanza — diseño

Fecha: 2026-10-05 · Estado: decidido por el controlador (el usuario delegó: "ten criterio")

## Por qué

- El usuario no quiere el look navy + cian actual: los slides de desarrollo son
  texto pequeño sobre un fondo vacío, sin ningún elemento visual.
- Le gusta el estilo de `promo/reel-biblioteca` (reel de 20 s): fondo casi negro
  con grilla lima tenue y viñeta, lima `#C6FF3D` + violeta + rosa, titulares
  Anton enormes, etiquetas mono tipo `01 / COMPARTES`, tarjetas de UI
  (chat, ficha, checklist con círculos lima), números grandes.
- Patrones de los 138 adjuntos guardados en la base (`knowledge/_adjuntos`): casi
  todo post guardable tiene **un elemento visual que muestra la idea** (dato
  gigante, mockup de UI/terminal, diagrama, checklist, antes/después), un titular
  dominante con 1-2 palabras en color de acento, numeración visible (`3.`,
  `PASO #01 / 05`, `01/07`) y poco texto por slide. Coincide con
  `referencias/mostrar-no-decir.md` y `patron-de-lectura-en-f.md` (layer-cake:
  titulares que cargan la información).
- Para enseñar, el reel actual va rápido (escenas de 2.4-4.8 s).

## Sistema visual (post 1080×1350 y reel 1080×1920)

Tokens (`src/theme.ts`), tomados de `promo/reel-biblioteca/reel.html`:

| Token | Valor |
|---|---|
| bg | `#06060A` |
| grid | líneas lima 7 % de opacidad, 2 px, celda 120 px |
| viñeta | radial, transparente al 40 % → `rgba(0,0,0,.75)` |
| accent (lima) | `#C6FF3D` |
| violet | `#7C5CFF` |
| pink | `#FF3D7F` |
| text | `#F4F4F6` |
| textMuted | `#8A8A99` |
| card | `#13131A` (borde `#23232E`, radio 36-44 px) |

- Pilares → color: herramienta/prompt = lima, noticia = violeta, curiosidad = rosa.
- Tipografía: Anton (titulares, mayúsculas, más grandes que hoy), Inter
  (cuerpo ≥ 40 px en post), JetBrains Mono (etiquetas y código).
- Cabecera común (`Frame`): arriba-izquierda etiqueta mono
  `NN / PILAR` (número de slide en color del pilar, texto en `text`); arriba-derecha
  el wordmark `ia.es`. Abajo, fuente al pie en mono pequeña. Sin chip de pastilla.
- Fondo por defecto: bg + grilla + viñeta. Los fondos `ai`/`image` siguen
  funcionando (con overlay) y la grilla se pinta encima con baja opacidad.

### Plantillas

| Plantilla | Cambio |
|---|---|
| Hook | Titular Anton gigante (hasta ~150 px en post), palabra clave en lima; opcional `mark` = palabra con caja de color detrás (estilo "NINGUNO." en rosa). Eyebrow mono. "DESLIZA →" mono abajo-derecha (solo post). |
| Lead | Frase grande (Inter 600 ~58 px) con palabra clave lima, kicker mono, barra lima corta. |
| Step | Número de paso grande en lima (Anton) + heading; el cuerpo/bullets van **dentro de una tarjeta** (`card`). Los bullets son checklist con círculo lima y ✓. |
| Prompt | Ventana de terminal/chat: barra superior con 3 puntos y título mono, texto mono, cursor lima al final. |
| MythReality | Dos tarjetas: mito (texto apagado, tachado rosa en el reel; en post, línea rosa estática), realidad (borde lima, texto blanco). |
| Cta | Titular gigante con palabra lima, razón, pastilla lima con texto oscuro, handle mono. Ícono de guardar (bookmark) en lima. |
| **Stat** (nueva) | Número gigante en lima (Anton ~300 px), etiqueta debajo, contexto en Inter y fuente. Props: `value` (ej. "47%"), `label`, `context?`, `source?`. |

Cover/Bullet/Quote heredan los tokens; no se rediseñan.

La nueva `Stat` se registra en el catálogo de remix (`src/remix/templates-catalog.ts`)
y en el indicador de viralidad si aplica (cuenta como slide de desarrollo con número).

## Reel: estilo y ritmo

- Mismo sistema visual. La grilla se desplaza lento durante todo el reel
  (deriva diagonal continua, determinista con `seek`).
- Animaciones nuevas en el vocabulario `data-anim`:
  - `count`: el número de `Stat` cuenta desde 0 hasta su valor (respeta prefijos/sufijos como `%`, `$`, `×`; si no es numérico, entra como `rise`).
  - `check`: los círculos del checklist aparecen con escala 0 → 1 cuando entra su bullet.
  - `caret`: el cursor del Prompt parpadea (on/off cada 0.5 s) tras terminar de escribir.
- `pace` en `CarouselSpec`: `"ensenar"` (por defecto) o `"rapido"` (ritmo actual).
  - `ensenar`: escena = `clamp(2.4 + chars/16, 3.5, 8)` s, +1.0 s en la primera y la última;
    transición 0.5 s; presupuesto de entradas `min(0.45 × dur, 2.4)` s; entradas
    1.3× más lentas que hoy (salvo la escena 0).
  - `rapido`: exactamente los valores actuales.
  - En ambos, la **escena 0 (hook)** mantiene las metas: titular completo < 1.2 s,
    palabra clave en acento < 1.5 s, cuadro 0 no vacío.
  - `--seconds` y `--fade` siguen sobrescribiendo.

## Fuera de alcance

Audio/voz/subtítulos, formato TikTok foto, coreografías a medida por pieza,
rediseño de Cover/Bullet/Quote.

## Criterios de aceptación

- Los 3 carruseles de `carousels/` (reescritos según la auditoría) se ven con el
  nuevo sistema y cada slide de desarrollo tiene un elemento visual (tarjeta,
  checklist, stat, terminal o mito/realidad).
- Reels con `pace: "ensenar"` de ~45-75 s, legibles; hook igual de rápido.
- `npm run typecheck`, `npm test`, `npm run test:reel` en verde; los tests que
  fijaban colores/markup del look anterior se actualizan, no se borran.
- Nada del texto invade la zona segura inferior del reel (440 px) ni se corta.
