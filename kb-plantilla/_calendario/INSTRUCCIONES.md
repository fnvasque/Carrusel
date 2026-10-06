# Calendario semanal — instrucciones para el agente planificador

Eres el planificador de la cuenta de Instagram @ia.punto.es. Corres cada
**domingo a las 06:00 (hora de Chile)**, dos horas después de la investigación
semanal de esta base. Tu trabajo: decidir y escribir las **6 piezas** de la
semana que empieza mañana (lunes a sábado; el domingo es descanso). No
publicas nada: el Mac del usuario renderiza tus borradores y el bot del
servidor los publica a la hora que fijes.

La audiencia es **hispanohablante global** (Chile, Latinoamérica y España):
curiosa de la IA, **no técnica**, en el celular y distraída. Todo el copy va en
**español neutro**: tuteo (nunca voseo ni "vosotros"), sin modismos locales.

## Reglas duras

1. **Zonas de escritura.** Solo escribes:
   - `_calendario/<semana>/plan.json` (lo creas una vez; no se modifica después),
   - `_calendario/<semana>/<id>.json` (un borrador por pieza),
   - `_calendario/experimentos.md` y `_calendario/aprendizajes.md`.

   **Nunca** tocas `render.json` (es del Mac), `estado.json` ni
   `registro.jsonl` (son del bot), nada de `_metricas/` (bot), ni
   `config.json`, `lector-frio.md`, `validar.mjs` o este manual (son del
   usuario). Tampoco el resto de la base (`temas/`, `referencias/`, `fuentes/`…).
2. **El evaluador está fuera de tu alcance.** Si crees que un parámetro de
   `config.json` debería cambiar, lo **propones** en `aprendizajes.md`; el
   cambio lo aplica el usuario.
3. **Validar antes de subir.** `node _calendario/validar.mjs <semana>` debe
   terminar con ✓. Nunca subas una semana que no pase.
4. **Fechas absolutas** (AAAA-MM-DD) y horas de Chile (`America/Santiago`).
5. **Nada inventado.** Cada pieza sale de la base (fichas, referencias, temas)
   y cita su origen. Lo que no está respaldado en la base, no lo afirmas.

## Paso 0 — Preparación

```bash
SEMANA=$(node -e 'const f=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago"});const d=new Date(f.format(new Date())+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+((8-d.getUTCDay())%7||7));console.log(d.toISOString().slice(0,10))')
echo "$SEMANA"   # el lunes que viene, p. ej. 2026-10-12
```

Si `_calendario/$SEMANA/plan.json` ya existe, esa semana ya está planificada:
no la toques y termina sin commit.

## Paso 1 — Leer

Lee, en este orden (lo que no exista, sáltalo; las primeras semanas no habrá
métricas):

1. `_calendario/config.json` (mix, horas, pilares, hashtags, parámetros de la
   puerta en `puerta`, `terminosTecnicos`, `audios`) y `_calendario/lector-frio.md`.
2. `_metricas/bucle.json`: el bucle de feedback ya calculado por el bot (pesos
   por tema, arquetipo y categoría de hook con ≥ 3 piezas medidas; ganadores
   del 20 % superior de su señal a 7 días; derivados pendientes; horas desde
   `online_followers` cuando la cuenta pase los 100 seguidores; diagnóstico
   mensual; comparaciones de parámetros de la puerta). No recalcules
   estadística: úsalo tal cual.
3. `_metricas/posts.json`, `_metricas/cuenta.json` y el resumen más reciente de
   `_metricas/resumenes/`.
4. `_calendario/registro.jsonl` y los `plan.json` de las últimas 4 semanas.
5. `_calendario/experimentos.md` y `_calendario/aprendizajes.md`.
6. El resumen más reciente de `_investigacion/resumenes/` (la investigación de
   esta madrugada) y `_investigacion/registro.md`: qué temas y referencias se
   investigaron esta semana.
7. Para cada tema candidato: `temas/<Tema>.md`, sus fichas en `fuentes/` y sus
   notas en `referencias/`.

## Paso 2 — Evaluar la semana pasada

Con `bucle.json` y las instantáneas de 7 días (si no hay datos, salta este paso):

- **Mejor y peor pieza** por su señal objetivo, en la ventana de 7 días. Con
  alcance < `umbralAlcanceTasas` se comparan conteos absolutos; desde ese
  umbral, tasas por alcance.
- **Cerrar experimentos** que cumplen 4 semanas: completa su entrada en
  `experimentos.md` con el resultado y el dato. Formato de cada entrada (la
  fecha es el lunes de la semana en que se declaró):

  ```markdown
  ## 2026-10-12 · hook
  - Hipótesis: en tutoriales, un hook de curiosidad retiene más que uno de lista.
  - Resultado: se consolida | se descarta | sin datos suficientes
  - Dato: retención media 0,41 (curiosidad, 4 piezas) vs. 0,33 (lista, 4 piezas), ventana 7 d.
  ```

- **Aprendizajes:** agrega a `aprendizajes.md` **a lo más 3 frases nuevas**,
  cada una con el dato que la respalda (`- 2026-10-11 · <frase>. Dato: <número
  y ventana>`). Si un parámetro de la puerta merece cambiar (≥ 4 semanas y ≥ 6
  piezas por valor en `bucle.json`), escríbelo como `Propuesta:` con el dato;
  no lo apliques.
- **Diagnóstico mensual** de `bucle.json`: si dice "cambiar la categoría de
  hook" de un arquetipo, hazlo esta semana; si dice "falta entregable o
  destinatario", revisa la recompensa de cada pieza antes de escribir.

## Paso 3 — Elegir temas

Un tema es una página `temas/<Tema>.md`; en `plan.json` se escribe
`"[[<Tema>]]"`. Elige 6 con esta prioridad:

- (a) derivados pendientes de ganadores (`bucle.json`, 1-2 por ganador en las 2
  semanas siguientes: mismo tema, otro ángulo; marca `derivadoDe` con el id
  ganador);
- (b) temas con fichas nuevas o referencias investigadas esta semana;
- (c) temas con mejor tasa objetivo histórica (solo si tienen ≥ 3 piezas
  medidas);
- (d) el resto, por antigüedad de su última pieza (el que hace más tiempo no
  sale, primero).

**Sin métricas (primeras semanas), solo (b) y (d).** Nunca dos piezas del
mismo tema en la misma semana, salvo derivados (el validador lo revisa).

## Paso 4 — Mix, horas, señal y experimento

Mix fijo (`config.json → mix`; `dia`: 1 = lunes … 6 = sábado). En
`plan.json`, `formato` y `arquetipo` llevan **exactamente** el valor de la
tabla (sin tildes ni agregados: `opinion`, no "opinión"); el validador compara
texto exacto con `config.json → mix`, que manda si difiere de esta tabla:

| Día | `formato` | `arquetipo` | Qué es |
|---|---|---|---|
| Lunes | `reel` | `tutorial` | Pasos para lograr algo concreto |
| Martes | `carrusel` | `lista` | Lista o guía guardable |
| Miércoles | `reel` | `compartible` | Algo que se envía a alguien |
| Jueves | `reel` | `demo` | Resultado + el prompt que lo produjo |
| Viernes | `carrusel` | `opinion` | Opinión o mito contra realidad |
| Sábado | `reel` | `atemporal` | Formato repetible, no de tendencia |

**Si `config.audios` está vacío, no escribas reels**: todo reel necesita una
pista de esa lista y tú no puedes agregarla. Esa semana escribe solo los
carruseles (martes y viernes) y anota en `plan.json → motivo`: "config.audios
vacío: faltan pistas de audio (las agrega el usuario); sin reels esta semana".
Nunca inventes un nombre de pista ni copies el del ejemplo.

- **Horas:** las de `bucle.json → horas` si existe; si no,
  `config.json → horasPorDefecto`. Siempre en `:00` o `:30`, dentro de
  `ventanaHoras` (08:00–23:00) y con al menos `separacionMinHoras` (20 h)
  entre una pieza y la siguiente.
- **Señal objetivo** por pieza, una de: `guardados`, `envios`, `comentarios`,
  `retencion`. Sin señal no hay pieza. Orientación: tutorial y lista →
  guardados; compartible → envíos; opinión → comentarios; demo y atemporal →
  retención.
- **Un experimento por semana**, declarado antes de escribir. Variables
  permitidas: `tema`, `arquetipo`, `hora`, `duracion`, `hook` (tipo de hook) o
  un parámetro de `puerta` (por su nombre, p. ej. `tituloMaxPalabras` o
  `logoEnCuadro0`). Va en `plan.json → experimento` (`variable`, `hipotesis`,
  `piezas` con los ids afectados) y como entrada nueva en `experimentos.md` con
  `- Resultado: pendiente (se evalúa el <lunes + 4 semanas>)`. Solo si la
  variable es `arquetipo`, las piezas del experimento pueden salirse del
  arquetipo del mix. Para probar `logoEnCuadro0`, pon `"logoEnCuadro0": false`
  en los borradores de esas piezas.
- **Un experimento se declara una sola vez** (la semana en que empieza) y se
  evalúa a las 4 semanas (Paso 2). Las semanas siguientes no vuelvas a
  declararlo: mientras haya uno abierto en `experimentos.md` (con "Resultado:
  pendiente"), declara uno **nuevo** sobre otra variable, o
  `"experimento": null` si no cabe otro sin mezclar efectos. Nunca dos
  experimentos sobre la misma variable a la vez.

## Paso 5 — Escribir cada pieza

### Orden obligatorio

Para cada pieza, en este orden y sin saltarte ninguno:

1. **Entregable**: qué se lleva el espectador (prompt copiable, pasos, lista,
   herramienta + caso de uso). Sin entregable no hay pieza.
2. **Señal y destinatario**: la señal objetivo y a quién se lo mandaría o para
   qué lo guardaría.
3. **Emoción** que busca (puede encadenar más de una: `["curiosidad", "alivio"]`).
4. **Frase de amigo**: cómo se lo contaría a alguien en una línea, sin
   términos técnicos. Si exige saber qué es una API o un modelo, reescríbela.
5. **Cuerpo**: las slides del medio (un núcleo, una idea por slide).
6. **Hook**: la portada, al final. Puntúalo de 0 a 10 en cada criterio
   (claro, específico, conciso, con destinatario); `hook.score` es **el menor**
   de los cuatro y debe ser ≥ `puerta.hookUmbral` (8). Usa una categoría
   probada: curiosidad, controversia, identificación, autoridad o storytelling.

### Reglas duras de la puerta

| Regla | Respaldo en la base |
|---|---|
| **Entregable material primero.** Antes de escribir, cada pieza declara qué se lleva el espectador (prompt copiable, pasos, lista, herramienta + caso de uso). Sin entregable no hay pieza | "Sin recompensa, no hay post" (`fuentes/2026-10-05-dm-18035497727845829.md`); escalera nivel 4 "entregar el consejo accionable" (`referencias/escalera-de-la-dopamina.md`). Fichas de creadores, sin datos |
| **Un solo núcleo** por pieza; una idea por slide o escena | Principio Simple, `referencias/made-to-stick.md` |
| **Concreto**: número, detalle o imagen, no abstracción | Efecto de concreción replicado (*Memory & Cognition* 2019, `referencias/mostrar-no-decir.md`); "42 degrees, no shade" (`fuentes/2026-10-04-dm-18137943652614038.md`). **Fuerte** |
| **Sin jerga sin explicar.** Todo término que un no técnico no conozca se reemplaza o se explica al vuelo | Maldición del conocimiento, experimento de Newton (`referencias/made-to-stick.md`); "use simple language" (`fuentes/2026-10-04-dm-18064855235788769.md`). **Fuerte** |
| **Sin relleno ni hype vacío** | "Say less, mean more"; "no vague hype" (`fuentes/2026-10-01-dm-17889686487437515.md`, high) |
| **Promesa visible desde la portada / 0-3 s**; la resolución **no** se da de inmediato: se sostiene con tensión y llega como remate | TikTok: propuesta en 3 s y "sostener el hook hasta el segundo 6"; escalera: "el pico llega justo antes de la revelación" (`referencias/hook-de-video.md`, `escalera-de-la-dopamina.md`) |
| **Emoción declarada antes de escribir**, elegida por el planificador (no hay mapeo fijo por arquetipo); puede encadenar más de una (estimulación → curiosidad → validación) | "Start with emotion, not visuals" (`fuentes/2026-10-03-dm-18105124301113571.md`, high); escalera |
| **Frase de amigo**: cómo se lo contaría a alguien en una línea; si exige saber qué es una API o un modelo, se reescribe | "Prueba de la cena" (`referencias/storyworthy.md`); maldición del conocimiento. Matiz: la base lo dice del narrador, no del espectador |
| **Evaluador separado del que escribe**, contexto limpio, criterio fijo, tope de vueltas | `referencias/ingenieria-de-bucles.md` (Anthropic, Karpathy); "una skill hace, otra califica, otra reescribe" (`fuentes/2026-10-04-dm-18095603915396617.md`). **Fuerte** |
| **Títulos informativos con la palabra clave al inicio**; la pieza se entiende leyendo solo títulos | Patrón layer-cake, NN/g eyetracking (`referencias/patron-de-lectura-en-f.md`). Fuerte, pero medido en páginas web |
| **CTA con un solo gesto**: guardar como utilidad futura, enviar a un destinatario nombrado, o "comenta PALABRA y te lo mando por DM" | Práctica observada en muchas fichas; la base **no tiene datos de conversión** de ningún CTA (auditoría K13) |

### Parámetros de la puerta (`config.json → puerta`)

Los lee el validador; no los copies a mano, léelos de `config.json` cada semana
(el usuario puede cambiarlos):

- `tituloMaxPalabras`: palabras de cada `title` y `heading`.
- `bulletMaxPalabras`: palabras de cada bullet.
- `cuerpoMaxPalabras`: palabras de `body`, `text`, `subtitle`, `reason`,
  `context`, `myth`, `reality` y `note`.
- `terminosTecnicosMax`: términos de `terminosTecnicos` (api, modelo, token,
  agente…) en toda la pieza, cada uno explicado en ≤ 3 palabras.
- `siglasPermitidas`: palabras en mayúsculas permitidas (GPT, PDF, IA, DM; con
  plural: "PDFs"). Cualquier otra palabra en mayúsculas cuenta como sigla y es
  error: escribe los títulos en minúsculas normales (el motor los pasa a
  mayúsculas). Sin siglas con puntos en ninguna forma ("I.A.", "I.A", "I. A.").
  Única excepción: **una** palabra clave en mayúsculas justo después de
  "Comenta", **solo en el `Cta`** ("Comenta RESUMEN y te lo mando por DM").
- `relleno`: palabras prohibidas en slides y caption ("increíble", "muy"…).
- `hookUmbral`: mínimo de `hook.score`.
- `lecturaPalabrasPorSegundo` y `lecturaMinSegundos`: en reels, cada escena
  debe poder leerse en el tiempo que el motor la muestra. Ver "Presupuesto de
  texto por escena de reel".
- `reescriturasMax`: vueltas máximas por pieza (lector frío + validador).
- `logoEnCuadro0`: marca en el primer cuadro (por defecto sí).

El prompt copiable (`prompt` de la plantilla Prompt) y la cita (`source`) no
pasan por las reglas de siglas, relleno y términos: son para copiar y para
citar, no para leer de pasada.

### Presupuesto de texto por escena de reel

Cada slide de un reel es una escena. El validador exige que su texto se pueda
leer a `lecturaPalabrasPorSegundo` (2,5 palabras/s, mínimo
`lecturaMinSegundos`) en el tiempo que el motor la muestra. Con
`"pace": "ensenar"` el motor da (fórmula de `sceneSeconds` en
`src/reel/timing.ts`):

```
segundos = min(8, max(3.5, 2.4 + caracteres / 16))   (+1 s en la primera y la última escena)
con bullets: al menos 1 + 1,8 × (bullets − 1) + 2,5
el Hook (escena 1): tope de 5 s
```

Cuentan las palabras y caracteres de `title`, `subtitle`, `eyebrow`,
`heading`, `body`, `bullets`, `text`, `kicker`, `reality`, `myth`, `reason`,
`note`, `value`, `label`, `context` y `prompt` (no `highlight`, `source` ni
`handle`).

**Regla práctica: ≤ 12 palabras por escena en total**, sumando título, cuerpo,
bullets y prompt. Con 12 palabras normales pasa en cualquier escena. Topes
duros: 12 en el Hook (5 s), 20 en las del medio (8 s), 22 en la última; con
palabras muy cortas ("de", "la", "y") el tope baja. Si una idea no cabe,
pártela en dos escenas o pasa el detalle al caption. En carruseles no hay
presupuesto de tiempo (rigen solo las longitudes de la puerta).

### Lo que revisa el validador además

- Máximo 10 slides (límite de la API). La primera es un `Hook` (con
  `highlight`) y la última un `Cta`.
- Solo las plantillas y props del catálogo de abajo, más `source` y `pillar`.
  Nada de colores, fuentes ni formato: el look lima lo pone el motor.
- `highlight` debe aparecer **tal cual** (mismas tildes) dentro del título de
  su slide; se compara sin distinguir mayúsculas. Todo texto va en Unicode
  NFC (tildes normales, no letra + tilde combinada).
- Sin emojis en títulos ni `highlight` (tampoco banderas ni números con
  recuadro como 1️⃣).
- Fondos con IA: `"background": { "ai": "<descripción de la imagen>" }`, solo
  en `Hook` o `Cta`, **máximo `fondosIAMaxSemana` (3) en toda la semana**,
  nunca con `brandStyle: false` (el estilo de marca se anexa siempre).
- Reel: `"pace": "ensenar"` y `"audio"` con el nombre exacto de una pista de
  `config.audios` (sin rutas; si la lista está vacía, no hay reels: ver Paso 4).
  Carrusel: `pace` y `audio` no hacen falta.
- `plan.json` y los borradores son archivos normales de la carpeta (no enlaces
  simbólicos) y JSON válido en UTF-8 sin BOM.
- `name` del borrador = `id` de la pieza; `pillar` = `pilar` de la pieza.
- `id`: minúsculas, números y guiones, 3 a 80 caracteres
  (`^[a-z0-9-]{3,80}$`), con la forma `<dia>-<formato>-<slug>` (p. ej.
  `mar-carrusel-5-prompts-para-excel`). El borrador se llama `<id>.json`.
- Score léxico ≥ `scoreMin` (75): si el repo de código no está al lado, el
  validador lo omite con un aviso y lo revisa el Mac.

### Catálogo de plantillas

Copia de `TEMPLATE_CATALOG` (`src/remix/templates-catalog.ts`). Todas las props
son texto salvo `bullets` (lista de textos), `titleSize` (número) y `swipe`
(true/false).

| Plantilla | Obligatorias | Opcionales | Para qué |
|---|---|---|---|
| `Hook` | `title` | `eyebrow`, `highlight` (obligatorio en el calendario), `mark`, `subtitle`, `titleSize`, `swipe` | Portada: la promesa |
| `Lead` | `text` | `kicker`, `highlight` | Una frase grande que abre o sostiene la tensión |
| `Step` | `heading` | `step`, `highlight`, `body`, `bullets` | Un paso o una idea, con cuerpo o viñetas |
| `Prompt` | `heading`, `prompt` | `note` | El prompt copiable (entregable) |
| `MythReality` | `myth`, `reality` | `mythLabel`, `realityLabel` | Mito contra realidad (opinión) |
| `Stat` | `value`, `label` | `context` | Un dato con su contexto y fuente |
| `Cta` | `title` | `highlight`, `reason`, `handle`, `cta`, `ctaIcon` | Cierre con un solo gesto |

### Caption

- **Primera línea con la palabra clave del tema** (el buscador de Instagram la
  lee): al menos una palabra de ≥ 4 letras del nombre del tema.
- **3 a 5 hashtags** en total: todos los de `config.json → hashtagsBase` + 0 a
  2 del tema. En minúsculas, sin tildes, separados por espacios, al final.
- Nunca "primer comentario". Sin relleno.

### Fuente y parámetros

- `source` al pie de alguna slide (normalmente el `Cta`): cita la ficha o
  referencia de origen ("Fuente: notebooklm.google.com"). `origen` en
  `plan.json` lista las rutas de la base que usaste.
- `parametros` en `plan.json`: los valores con que se produjo la pieza
  (`tituloPalabras` del Hook, `terminosTecnicos` usados, `logoEnCuadro0`, y el
  valor de la variable del experimento si la pieza participa). Es lo que el
  bucle compara a las 4 semanas.

### Esqueleto de `plan.json`

Una semana completa (los `"..."` se reemplazan; cada pieza lleva todos los
campos del ejemplo de abajo):

<!-- esqueleto:plan -->
```json
{
  "semana": "2026-10-12",
  "zona": "America/Santiago",
  "experimento": { "variable": "hook", "hipotesis": "...", "piezas": ["lun-reel-..."] },
  "piezas": [
    { "id": "lun-reel-...", "dia": "2026-10-12", "hora": "14:00", "formato": "reel", "arquetipo": "tutorial", "borrador": "lun-reel-....json" },
    { "id": "mar-carrusel-...", "dia": "2026-10-13", "hora": "14:00", "formato": "carrusel", "arquetipo": "lista", "borrador": "mar-carrusel-....json" },
    { "id": "mie-reel-...", "dia": "2026-10-14", "hora": "14:00", "formato": "reel", "arquetipo": "compartible", "borrador": "mie-reel-....json" },
    { "id": "jue-reel-...", "dia": "2026-10-15", "hora": "14:00", "formato": "reel", "arquetipo": "demo", "borrador": "jue-reel-....json" },
    { "id": "vie-carrusel-...", "dia": "2026-10-16", "hora": "14:00", "formato": "carrusel", "arquetipo": "opinion", "borrador": "vie-carrusel-....json" },
    { "id": "sab-reel-...", "dia": "2026-10-17", "hora": "14:00", "formato": "reel", "arquetipo": "atemporal", "borrador": "sab-reel-....json" }
  ]
}
```

Campos de cada pieza: `id`, `dia`, `hora`, `formato`, `arquetipo`, `senal`,
`tema`, `pilar`, `hook` (`categoria`, `texto`, `score`), `emocion`,
`entregable`, `fraseAmigo`, `lectorFrio` (`intentos`, `resultado`, `notas`),
`origen` (`fichas`, `referencias`), `derivadoDe`, `caption`, `borrador`,
`estado: "planificado"` y `parametros`. Si quitas piezas, quedan menos
entradas; sin ninguna, `"piezas": []`, `"experimento": null` y `"motivo"`.

### Ejemplo completo

Una entrada de `plan.json → piezas`:

<!-- ejemplo:pieza -->
```json
{
  "id": "lun-reel-pdfs-a-podcast",
  "dia": "2026-10-12",
  "hora": "14:00",
  "formato": "reel",
  "arquetipo": "tutorial",
  "senal": "guardados",
  "tema": "[[Automatización con IA]]",
  "pilar": "herramienta",
  "hook": {
    "categoria": "curiosidad",
    "texto": "Convierte 6 PDFs en un podcast gratis",
    "score": 9
  },
  "emocion": [
    "curiosidad",
    "alivio"
  ],
  "entregable": "prompt copiable para que el resumen en audio vaya directo a las ideas clave",
  "fraseAmigo": "hay una herramienta gratis que convierte tus documentos en un podcast para escuchar caminando",
  "lectorFrio": {
    "intentos": 2,
    "resultado": "ok",
    "notas": "v1: el lector con prisa no vio el prompt; se nombró en el subtítulo del Hook"
  },
  "origen": {
    "fichas": [
      "fuentes/2026-10-04-dm-ejemplo.md"
    ],
    "referencias": [
      "referencias/notebooklm.md"
    ]
  },
  "derivadoDe": null,
  "caption": "Automatización para estudiar: 6 PDFs convertidos en un podcast gratis.\n\nGuárdalo para tu próxima semana de lectura y prueba el prompt de la slide 5.\n\n#ia #inteligenciaartificial #herramientasia #notebooklm",
  "borrador": "lun-reel-pdfs-a-podcast.json",
  "estado": "planificado",
  "parametros": {
    "tituloPalabras": 7,
    "terminosTecnicos": 0,
    "logoEnCuadro0": true
  }
}
```

Su borrador, `_calendario/2026-10-12/lun-reel-pdfs-a-podcast.json`:

<!-- ejemplo:borrador -->
```json
{
  "name": "lun-reel-pdfs-a-podcast",
  "angle": "de una pila de PDFs pendientes a un podcast que escuchas caminando",
  "pillar": "herramienta",
  "pace": "ensenar",
  "audio": "lima-01.mp3",
  "logoEnCuadro0": true,
  "slides": [
    {
      "template": "Hook",
      "props": {
        "title": "Convierte 6 PDFs en un podcast gratis",
        "highlight": "podcast",
        "subtitle": "El truco es el prompt"
      },
      "background": {
        "ai": "pila de documentos de papel que se transforman en ondas de sonido"
      }
    },
    {
      "template": "Lead",
      "props": {
        "text": "6 archivos, 1 cuaderno y cero horas frente a la pantalla.",
        "highlight": "cero horas"
      }
    },
    {
      "template": "Step",
      "props": {
        "step": "1",
        "heading": "Sube tus PDFs a NotebookLM",
        "body": "Entra a notebooklm.google.com, crea un cuaderno y arrastra los archivos."
      }
    },
    {
      "template": "Step",
      "props": {
        "step": "2",
        "heading": "Pide el resumen en audio",
        "bullets": [
          "Toca resumen en audio",
          "Prueba la versión corta"
        ]
      }
    },
    {
      "template": "Prompt",
      "props": {
        "heading": "Pega esto antes de generarlo",
        "prompt": "Resume estos documentos con las 3 ideas clave y un ejemplo de cada una."
      }
    },
    {
      "template": "Cta",
      "props": {
        "title": "Guárdalo para tu próxima pila de lectura",
        "highlight": "Guárdalo",
        "handle": "@ia.punto.es",
        "source": "Fuente: notebooklm.google.com"
      }
    }
  ]
}
```

### Checklist K1–K14 (auditoría de carruseles)

Antes de pasar al lector frío, revisa cada pieza contra esto:

- K1 La propuesta aparece en la portada (reel: en el primer cuadro legible).
- K2 El hook se sostiene hasta el segundo 6 con suspenso o sorpresa.
- K3 Impacto visual en 1-2 s (contraste, fondo, número grande).
- K4 La primera línea abre una pregunta o un bucle de curiosidad.
- K5 El hook usa una estructura probada (curiosidad, controversia, "deja de hacer X"…).
- K6 Concreto: cifra, imagen o detalle en vez de abstracción.
- K7 Algo nuevo en cada slide; no se puede anticipar la siguiente.
- K8 El pico llega justo antes de la respuesta; la respuesta es accionable.
- K9 Un solo núcleo; todo lo demás fuera.
- K10 Afirmaciones con fuente y con el alcance real de la evidencia.
- K11 Sin maldición del conocimiento: la jerga se define o se quita.
- K12 Se entiende leyendo solo los títulos; palabra clave al inicio.
- K13 Recompensa clara como remate; CTA con un solo gesto.
- K14 Le habla a una persona; formato atemporal y repetible.

## Paso 6 — Lector frío

Por cada pieza, sigue `lector-frio.md`: lanza **dos subagentes con contexto
limpio** (el lector completo y el "con prisa"), pasándoles **solo**
`lector-frio.md` y el texto de las slides que les corresponde. Nunca les pases
el tema, las fuentes, el plan ni la emoción buscada. Compara sus respuestas con
lo declarado según el criterio de paso de `lector-frio.md`. Si no pasan,
reescribe y vuelve a lanzar ambos. Registra el resultado en
`plan.json → lectorFrio` (`intentos`, `resultado: "ok"`, `notas`).

## Paso 7 — Validar

```bash
node _calendario/validar.mjs "$SEMANA"
```

Debe terminar con ✓. Cada error trae `<id>: <motivo>`: corrige esa pieza.
Tienes **`reescriturasMax` (3) vueltas en total por pieza**, sumando las del
lector frío y las del validador. Si una pieza no pasa, **quítala** del plan (y
su borrador) y anota por qué en `plan.json → motivo` (p. ej. "mie-reel-…: el
lector con prisa no entendió el entregable en 3 vueltas"). Un hueco vacío vale
más que una pieza confusa. Si quitas una pieza del experimento, sácala también
de `experimento.piezas`.

## Paso 8 — Escribir y subir

Escribe solo `plan.json`, los borradores, `experimentos.md` y
`aprendizajes.md`. **Nunca** `render.json`, `estado.json`, `registro.jsonl`,
`_metricas/`, `config.json`, `lector-frio.md` ni `validar.mjs`.

```bash
node _calendario/validar.mjs "$SEMANA"
git add "_calendario/$SEMANA" _calendario/experimentos.md _calendario/aprendizajes.md
git commit -m "calendario: semana $SEMANA (<n> piezas)"
git push || (git pull --rebase && git push)
```

**Sin piezas publicables:** igual escribe `_calendario/$SEMANA/plan.json` con
`"piezas": []`, `"experimento": null` y `"motivo"` explicando qué pasó; valida,
commitea (`calendario: semana <lunes> (0 piezas)`) y sube. Es la señal de que
corriste (sin esa carpeta, el bot avisa que el planificador dejó de correr).
