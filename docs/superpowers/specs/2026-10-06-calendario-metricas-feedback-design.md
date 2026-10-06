# Calendario automático, métricas de Instagram y bucle de feedback — diseño

Fecha: 2026-10-06 · Estado: borrador para revisión

## Objetivo

Tres mejoras encadenadas sobre lo que ya existe (motor de carruseles y reels, base
de conocimiento `ia-es-kb`, bot always-on en el servidor, agente de investigación
semanal en la nube):

1. **Calendario semanal automático.** Cada domingo un planificador decide qué
   publicar la semana siguiente (tema, formato, arquetipo, señal objetivo, día y
   hora), produce las piezas y **las publica solas** en @ia.punto.es a la hora
   fijada. Mix elegido: **2 carruseles + 4 reels** por semana.
2. **Métricas de los posts.** Leer de la API de Meta las métricas propias de cada
   post (alcance, guardados, compartidos, vistas, tiempo de visualización) y de la
   cuenta (seguidores, horas en que la audiencia está en línea), guardarlas con
   ventanas comparables y verlas desde Telegram.
3. **Bucle de feedback.** Que las métricas cambien lo que se publica: pesos por
   tema y arquetipo, derivados de los ganadores, un experimento por semana y
   calibración del indicador de viralidad con datos reales.

Decisiones del usuario (2026-10-06): publicación 100 % automática desde el
primer día; 2 carruseles + 4 reels; temáticas desde la base ponderadas por
métricas.

Punto de partida: la cuenta tiene **4 seguidores** (fase "desierto" del skill:
el alcance bajo inicial es normal, no una señal de fracaso). Dos consecuencias
que atraviesan el diseño:

- **Publicar automático no arriesga nada**: nadie ve un post fallido y se borra
  desde la app. No hay periodo de prueba; el sistema arranca en `auto`.
- **Los números serán chicos durante meses**: las tasas por alcance con
  `reach < 50` son ruido. El bucle compara conteos absolutos y solo pasa a tasas
  cuando el alcance lo permite; `online_followers` (horas de la audiencia) no
  existe hasta los 100 seguidores, así que las horas salen de una tabla fija
  hasta entonces. Lo que sí mide bien desde el día 1: el alcance a **no
  seguidores**, que es justo lo que decide si el contenido sale del círculo.

## Qué dice la base y qué no (auditoría previa al diseño)

Se revisó `ia-es-kb` completa (152 fichas, 64 referencias, 19 temas) y el código.
Lo que la base **sí** aporta y este diseño adopta como reglas:

| Regla | Origen en la base |
|---|---|
| Formatos atemporales y repetibles en vez de tendencias; duplicar los formatos que ganan ("double down on winning formats") | `fuentes/2026-10-01-dm-18070999682775971.md`, `fuentes/2026-10-01-dm-18111230237595831.md` |
| Un hook con estructura probada; sin hook no importa el resto | `fuentes/2026-10-05-dm-18190607413395702.md` (10 plantillas), `fuentes/2026-10-04-dm-18093109817320486.md` (5 categorías: storytelling, controversia, curiosidad, identificación, autoridad) |
| Propuesta en los primeros 3 s; algo nuevo cada 2-3 s; hablarle a una persona | `referencias/hook-de-video.md`, `fuentes/2026-10-04-dm-17952300600275624.md` |
| Sin recompensa no hay post; un solo núcleo por pieza; concreto, mostrar no decir | `fuentes/2026-10-05-dm-18035497727845829.md`, `referencias/made-to-stick.md`, `referencias/mostrar-no-decir.md` |
| Bucle: cada cambio se mide y solo se queda si mejora una métrica fija; evaluador fuera del alcance del agente; tope de vueltas | `referencias/ingenieria-de-bucles.md` |
| 1 vez = ruido, 10 = señal débil, 30 = patrón; comparar contra una línea base | `temas/Psicología del comportamiento y toma de decisiones.md` |
| Criterios K1–K14 y su solidez | `docs/auditoria/2026-10-05-auditoria-carruseles.md` |

Lo que la base **no** tiene (y por eso este diseño lo toma del skill
`instagram-growth-strategy`, fechado julio 2026, o de la documentación de Meta):

- Días, horas y frecuencia de publicación. Nada sobre el algoritmo de Instagram.
- Métricas de Insights, umbrales, ventanas de evaluación, normalización.
- Experimentos de contenido (A/B, trial reels).
- Datos de la propia cuenta: la base son posts **ajenos** guardados. `metrics/`
  en el repo de código está vacío: nunca se registró un post real.

Consecuencia: la mejora 2 va **primero**. Cada semana sin medir es historia que el
bucle no recupera, y hoy el indicador de viralidad (`src/score/virality.ts`) se
apoya en supuestos sin respaldo ("6-8 slides", "la portada es el 80 % del
alcance") que solo las métricas reales pueden confirmar o tumbar.

## Restricciones de la API de Meta (verificadas 2026-10-06)

| Tema | Dato | Efecto en el diseño |
|---|---|---|
| Insights por post | `reach`, `saved`, `shares`, `likes`, `comments`, `views`, `total_interactions`; reels además `ig_reels_avg_watch_time` (ms) y `ig_reels_video_view_total_time`. `impressions`, `plays`, `video_views` y `profile_views` (por post) ya no existen. | Se piden en lista y, ante error de métrica inválida, se reintenta sin ella: la lista de Meta cambia cada pocos meses. |
| Insights de cuenta | `online_followers` (lifetime; exige ≥ 100 seguidores), `follower_count` (day), `reach`, `accounts_engaged` (`metric_type=total_value`). | Las horas del calendario salen de `online_followers`; con < 100 seguidores se usa una tabla por defecto editable. |
| Publicación | Permiso `instagram_content_publish`. Imagen, carrusel (**máx. 10 ítems por API**) y reel. Las imágenes deben ser **JPEG en URL pública**; el reel, MP4 en URL pública. Flujo: crear contenedor → esperar `status_code=FINISHED` → `media_publish`. Tope 100 posts por 24 h. **No acepta hora futura**: alguien debe disparar `media_publish` a la hora exacta. | Carruseles ≤ 10 slides (validar). El servidor sirve los archivos y dispara la publicación. |
| Token | El token actual no pide `instagram_content_publish`; `deploy/README.md` recomienda token de System User (no vence). | Regenerar token con el permiso nuevo; `meta:check` lo exige. |

## Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Quién planifica y escribe el contenido | Agente de Claude en la nube, tarea programada **domingo 06:00 America/Santiago** (2 h después de la investigación de la kb), siguiendo `_calendario/INSTRUCCIONES.md` | Mismo patrón que la investigación semanal: costo extra 0, juicio sobre una base de cualquier tema, lee las referencias recién investigadas |
| Quién renderiza | **El Mac del usuario** (`npm run calendario:render`, lanzado cada hora por `launchd` mientras esté encendido): hace pull, renderiza las piezas pendientes con Chromium y ffmpeg, sube los archivos al servidor por SSH y marca `estado: renderizado` con las URLs | Chromium y ffmpeg ya están ahí; el servidor de Google (e2-micro, 1 GB) no aguanta 1 500 cuadros por reel. Una sola corrida por semana, en cualquier momento antes del lunes |
| Quién publica y mide | El bot del servidor de Google (`src/kb/bot.ts`), que ya corre 24/7 y ya hace pull de `ia-es-kb` cada hora | Lo que exige puntualidad (publicar a la hora, instantáneas a 24 h/72 h/7 d) queda en la máquina que no se apaga; son solo llamadas HTTP |
| Dónde viven calendario, borradores y métricas | Repo privado `ia-es-kb`, carpetas nuevas `_calendario/` y `_metricas/` | Es la memoria estratégica de la cuenta (ritual del skill, punto 5); el agente de la nube la lee; Obsidian la muestra; el bot ya la sincroniza |
| Formato de los borradores | JSON con el `VariationDraft` del remix (`name, angle, pillar, slides: LogicalSlide[]`) + metadatos de planificación | Es lo que `emitCarouselFile` ya convierte a `carousels/*.ts`; no obliga al agente a escribir TSX |
| Dónde quedan JPEG y MP4 | En el servidor, `/data/media/<semana>/<id>/`, subidos desde el Mac con `rsync` por la misma clave SSH de `deploy-to-server.sh`. El bot los sirve en `GET /media/<token>/…` por el ngrok con dominio fijo que ya existe | Cero servicios nuevos; Meta descarga cada archivo una vez. Se borran a los 7 días del publish. Alternativa documentada: Cloudflare R2 |
| Chromium en Docker | **No.** La imagen del servidor sigue como está (`node:24-bookworm-slim` + ffmpeg + git) | El render no corre allá |
| Modo de publicación | `auto` desde el primer domingo. `CALENDARIO_MODO=aviso` existe solo como herramienta de depuración (hace todo menos los POST) | Con 4 seguidores el riesgo de un post fallido es cero y se borra desde la app |
| Freno | `/pausar` y `/reanudar` en Telegram; botón **Saltar** en el aviso de cada pieza (vale hasta la hora de publicación). La API no borra posts: se borra desde la app de Instagram | Barato, y será útil cuando la cuenta crezca |
| Audiencia | **Hispanohablante global** (Chile/Latinoamérica y España a la vez). Copy en español neutro (sin `--es=cl`). Zona del calendario: `America/Santiago`; las horas por defecto se eligen en la franja que sirve a ambos lados | Decisión del usuario 2026-10-06 |
| Horas | Hasta 100 seguidores: tabla fija en `config.json`, por defecto **14:00 Chile** (19:00 Madrid en invierno chileno, 20:00 en verano) lunes a sábado, editable por día. Desde 100: `online_followers` de la semana anterior, hora con más seguidores en línea dentro de 08:00–23:00 Chile, redondeada a :00/:30, con separación mínima de 20 h entre piezas | Ventana crítica de 30-60 min (skill); `online_followers` no existe bajo 100 seguidores; 14:00 Chile es la única franja en que ambos continentes están despiertos y activos |
| Mix semanal | Lun reel tutorial · Mar carrusel lista/guía · Mié reel compartible · Jue reel demo (resultado + prompt) · Vie carrusel opinión/mito · Sáb reel formato atemporal · Dom descanso | Calendario base del skill, que coincide con 2 carruseles + 4 reels |
| Stories | **1 story automática por pieza**, 1 h después del post: imagen 9:16 con la portada (hook) de la pieza en look lima más el texto "Nuevo en el feed ↑"; el motor ya exporta 9:16 (`reel --frames-only`, cuadro 0). Encuestas, preguntas y detrás de escena quedan manuales: la API no publica stickers | Recomendación del skill ("repost del post del día"); las stories no traen seguidores nuevos, solo retención, así que no vale más esfuerzo |
| Fondos con IA | A criterio del planificador, **tope 3 imágenes IA por semana**, solo en Hook o Cta, con el estilo de marca anexado (`brandStyle`). Se generan en el Mac (gpt-image-1, caché en `.cache/ai/`); el costo entra al registro de costos de la kb | La auditoría marcó que las piezas son solo texto ("mostrar, no decir"); el tope acota costo (~0,05-0,20 USD por imagen) y mantiene uniformidad |
| Estilo visual | **Siempre el look lima** (`src/theme.ts`, plantillas de `main` desde PR #22). El agente solo escribe textos por plantilla; los píxeles salen del motor del Mac. El catálogo de plantillas (Hook, Lead, Step, Prompt, MythReality, Stat, Cta) y sus campos van en `INSTRUCCIONES.md`; `validar.mjs` rechaza cualquier otra. El README se corrige (hoy describe navy + cian) | No hay camino por el que salga el estilo viejo sin cambiar código |
| Caption | Lo escribe el planificador: primera línea con la keyword del tema (SEO de Instagram), 3-5 hashtags de `config.json` + 0-2 del tema, sin "primer comentario". Pie `source` en la pieza cita la referencia o ficha de origen | Reglas del skill (SEO > hashtags) y K10 de la auditoría |
| Posts previos al sistema | Se miden igual (`origen: manual`) pero no entran en el bucle (sin tema, arquetipo ni señal declarados) | Historia útil; no contamina los pesos |
| Rituales manuales | El sistema **no** responde comentarios, no comenta en otras cuentas ni gestiona colaboraciones: manda recordatorios por Telegram (post-publicación: "responde comentarios en la primera hora"; lunes: "30-60 min de interacción en el nicho esta semana") | El skill los exige en fase 1; automatizarlos es lo que hace que Instagram marque la cuenta |
| Señal objetivo por pieza | Declarada antes de producir: guardados, envíos, comentarios o retención. Sin señal, no se produce | Regla "un post = un trabajo" del skill; `ingenieria-de-bucles`: métrica fija y comparable |
| Puerta de calidad | Tres filtros en serie, ninguno se salta: (1) reglas duras de texto en `validar.mjs` (longitudes, siglas, relleno, tiempo de lectura); (2) **lector frío**: un evaluador con contexto limpio que solo ve el texto de las slides y debe reconstruir tema, entregable, emoción y acción sin confundirse (ver "Puerta de comprensión y emoción"); (3) score léxico ≥ 75 y checklist K1–K14. Si una pieza no pasa tras 3 reescrituras, **se deja el hueco vacío** | El score léxico cuenta palabras, no entendimiento: la auditoría encontró piezas con 100/100 que mezclaban 3 ideas y usaban jerga. "Evaluador fuera del alcance del agente" (`ingenieria-de-bucles`); validador de 5 puertas del skill `reels-hooks-ia` |
| Emoción por pieza | Cada pieza declara **una emoción objetivo** (de una lista cerrada por arquetipo) y la **"frase de amigo"**: cómo el espectador se lo contaría a alguien en una línea sin usar términos técnicos. El hook se escribe al final, como promesa de ese entregable y esa emoción | "Un post = un trabajo" (skill); gatillo antes que hook (`reels-hooks-ia`); test de la frase de amigo (puerta 1 del validador) |
| Logo y cabecera en el primer cuadro | En reels, el wordmark y la cabecera `NN / PILAR` **entran a los 3 s**, no en el cuadro 0; en carruseles, la portada no lleva wordmark (va en el CTA). El resto del look lima no cambia | Regla del skill de la cuenta: ~100 % de los views son de no seguidores, nadie conoce la marca y el logo quema el segundo más valioso |
| Ventanas de medición | Instantáneas a 24 h, 72 h, 7 d y luego semanal hasta 28 d. La comparación entre piezas usa siempre la de **7 d** | "Mismas ventanas siempre" (skill); patrón vs. señal aislada (base) |
| Métrica de comparación | Con `reach < 50`: conteos absolutos (`reach`, `saved`, `shares`, `views`) y, en reels, `avg_watch_time / duración`. Con `reach ≥ 50`: tasas por alcance (`saved/reach`, `shares/reach`, `comments/reach`). El umbral vive en `config.json` | Con 4 seguidores una tasa sobre 12 de alcance es ruido; la retención por reel sí es comparable desde el primer post |
| Alcance a no seguidores | `reach` de cuenta con `breakdown=follow_type` (diario) y, por pieza, `reach` − seguidores del día como aproximación | Es la métrica que importa en la fase "desierto": si el contenido no sale del círculo, nada más cuenta |
| Peso de un tema/arquetipo | Media de la tasa objetivo con encogimiento hacia la media global; un tema pesa solo con ≥ 3 piezas medidas | "1 vez = ruido" (base); evita que un post viral dicte el mes |
| Experimentos | **Una** variable por semana (tema, arquetipo, hora, duración o tipo de hook), anotada antes de publicar y evaluada a las 4 semanas | Ritual semanal del skill; `ingenieria-de-bucles` |
| Derivados | Toda pieza en el 20 % superior de su señal objetivo (ventana 7 d) genera 1-2 derivados (mismo tema, otro ángulo) en las 2 semanas siguientes | Fase 2 del skill; "double down on winning formats" (base) |

## Estructura nueva en `ia-es-kb`

```
ia-es-kb/
├── _calendario/
│   ├── INSTRUCCIONES.md           manual del agente planificador (versionado)
│   ├── config.json                mix, horas por defecto, zona horaria, pilares, hashtags base
│   ├── validar.mjs                valida plan y borradores (node, sin dependencias)
│   ├── 2026-10-12/                una carpeta por semana (lunes de la semana)
│   │   ├── plan.json              6 entradas: día, hora, formato, tema, arquetipo, señal, hook, experimento
│   │   ├── lun-reel-<slug>.json   borrador (VariationDraft + metadatos)
│   │   ├── mar-carrusel-<slug>.json
│   │   └── ...
│   ├── registro.jsonl             una línea por pieza: plan + estado + media_id + permalink + hora real
│   ├── experimentos.md            hipótesis → variable → resultado (lo escribe el agente)
│   └── aprendizajes.md            lo que ya se sabe de la cuenta, en prosa corta (memoria estratégica)
├── _metricas/
│   ├── posts.json                 última instantánea por post (lo escribe el bot)
│   ├── instantaneas/AAAA-MM-DD.jsonl   todas las instantáneas del día (bot)
│   ├── cuenta.json                seguidores por día, online_followers, reach, accounts_engaged (bot)
│   └── resumenes/AAAA-MM-DD.md    resumen semanal legible (bot; lo reenvía por Telegram)
└── CLAUDE.md                      + 4 líneas: qué hay en _calendario y _metricas
```

Zonas de escritura (regla dura, igual que con la investigación):

- **Agente planificador:** `_calendario/<semana>/`, `experimentos.md`,
  `aprendizajes.md`. Lee `_metricas/`, `temas/`, `referencias/`, `fuentes/`,
  `registro.jsonl`. Nunca escribe en `_metricas/` ni en el resto de la base.
- **Bot:** `_metricas/`, `_calendario/registro.jsonl` y, dentro de la carpeta de
  la semana, solo el campo `estado` de `plan.json`. Nunca toca borradores.
- **Usuario:** `config.json`, `## Mis notas` donde exista.

### `plan.json` (una entrada por pieza)

```json
{
  "semana": "2026-10-12",
  "zona": "America/Santiago",
  "experimento": { "variable": "hora", "hipotesis": "19:30 rinde más que 12:30 en reels", "piezas": ["mie-reel-..."] },
  "piezas": [
    {
      "id": "lun-reel-agentes-claude-code",
      "dia": "2026-10-12", "hora": "19:30",
      "formato": "reel", "arquetipo": "tutorial", "senal": "guardados",
      "tema": "[[Automatización con IA]]", "pilar": "herramienta",
      "hook": { "categoria": "curiosidad", "texto": "...", "score": 9 },
      "emocion": "alivio",
      "entregable": "prompt copiable de 4 líneas para resumir PDFs",
      "fraseAmigo": "hay una IA gratis que te resume 6 PDFs en un podcast",
      "lectorFrio": { "intentos": 2, "resultado": "ok", "notas": "v1 confundió 'agente' con persona" },
      "origen": { "fichas": ["fuentes/2026-10-04-dm-....md"], "referencias": ["referencias/claude-code.md"] },
      "derivadoDe": null,
      "caption": "primera línea con la keyword…\n\n#ia #claudecode #automatizacion",
      "borrador": "lun-reel-agentes-claude-code.json",
      "estado": "planificado"
    }
  ]
}
```

`estado` avanza: `planificado → renderizado → programado → publicado | saltado |
fallido`. Es el único campo que el bot escribe en `plan.json`.

### Borrador (`<id>.json`)

`VariationDraft` tal cual lo produce el remix (`name`, `angle`, `pillar`,
`slides: LogicalSlide[]`), más `pace` (`ensenar`/`rapido`) y `audio` (nombre de
una pista de `promo/audio/`). `validar.mjs` comprueba: ≤ 10 slides, plantillas
del catálogo, `highlight` presente en el hook, caption con keyword en la primera
línea y 3-5 hashtags, `senal`, `emocion`, `entregable` y `fraseAmigo` declarados,
`lectorFrio.resultado = "ok"`, las reglas duras de texto de la sección siguiente,
y score léxico ≥ 75 (el validador importa `scoreDraft` vía `npx tsx` si el repo
de código está al lado; si no, lo omite y lo deja al Mac).

### Puerta de comprensión y emoción

Objetivo: que nadie de la audiencia (hispanohablante curioso de IA, **no
técnico**, en el celular, distraído, probablemente sin sonido) se confunda, y que
cada pieza produzca la emoción que la hace detenerse, guardar o enviar. Adapta el
validador de 5 puertas de `reels-hooks-ia` a carruseles, reels y stories.

**1. Antes de escribir** (orden obligatorio, al revés del intuitivo):

1. Entregable material: qué se lleva el espectador (prompt copiable, pasos
   numerados, nombre de herramienta + caso de uso, lista, comparativa). Sin
   entregable no hay pieza; "inspirar" no cuenta.
2. Señal objetivo y, si es envío, el destinatario nombrado ("mándaselo a quien
   sigue pagando X").
3. Emoción objetivo, una por pieza, de esta lista por arquetipo:

   | Arquetipo | Emoción objetivo | Categoría de hook (de la base) |
   |---|---|---|
   | Tutorial (lun) | Alivio: "es más fácil de lo que creía" | Curiosidad o autoridad |
   | Lista / guía (mar) | Saturación útil: "es demasiado, lo guardo" | Curiosidad |
   | Compartible (mié) | Reconocimiento: "esto es para [nombre]" | Identificación |
   | Demo (jue) | Sorpresa: "¿eso se puede?" | Storytelling o curiosidad |
   | Opinión / mito (vie) | Validación o contrariedad: "yo lo sabía" / "¿cómo que no?" | Controversia |
   | Atemporal (sáb) | Curiosidad: bucle abierto que se cierra en la pieza | Curiosidad |
   | Story | Anticipación: "hay algo nuevo" | — |

4. Frase de amigo: una línea de cómo el espectador se lo contaría a alguien. Si
   esa línea necesita saber qué es una API, un token o un modelo, la idea se
   reescribe antes de producir nada.
5. Recién entonces el hook: promesa de ese entregable con esa emoción; se puntúa
   con la rúbrica de 10 puntos del skill (especificidad +2, gatillo +2, segundo
   gatillo +2, destinatario +1, legible sin sonido +1, movimiento desde el
   cuadro 0 +1, promesa cumplible en la slide/segundo siguiente +1). Se entrega
   solo con **≥ 8**. Saludo, contexto previo o logo en el primer cuadro = 0.

**2. Reglas duras de texto** (las aplica `validar.mjs`, sin juicio):

| Regla | Carrusel | Reel | Story |
|---|---|---|---|
| Título del hook | ≤ 8 palabras | ≤ 8 palabras | ≤ 8 palabras |
| Títulos de slide / escena | ≤ 10 palabras | ≤ 10 palabras | — |
| Bullet | ≤ 10 palabras | ≤ 8 palabras | — |
| Cuerpo (`body`) | ≤ 25 palabras, 1 idea | ≤ 15 palabras | — |
| Tiempo de lectura (reel) | — | por escena: `≥ palabras ÷ 2.5 + 1.5 s`; el motor ya lo cumple con `pace: ensenar`, el validador lo verifica con la fórmula de `sceneSeconds` | — |
| Siglas | Prohibidas salvo lista blanca en `config.json` (GPT como parte de un nombre) | igual | igual |
| Término técnico | Máximo **uno** por pieza, explicado al vuelo en ≤ 3 palabras: "prompt (la instrucción)" | igual | ninguno |
| Relleno | Cero: "increíble", "brutal", "realmente", "básicamente", "la verdad", "muy" (lista en `config.json`) | igual | igual |
| Cada texto lleva | número, beneficio o destinatario | igual | — |
| Una sola idea | 1 núcleo por pieza; 1 idea por slide; la slide 2 (`Lead`) cumple la promesa del hook | la escena 2 cumple la promesa (≤ 4 s desde el inicio) | — |
| CTA | guardado como utilidad futura ("guárdalo para cuando…") y/o envío con destinatario; "link en la bio" solo secundario | igual | — |
| Idioma | Español neutro; anglicismos solo si son el nombre de la herramienta | igual | igual |

**3. Lector frío** (evaluador fuera del alcance del que escribe):

El planificador lanza, por cada pieza, un subagente con **contexto limpio** que
recibe solo el texto de las slides en orden (sin tema, sin fuentes, sin plan, sin
la emoción buscada) con el perfil de la audiencia y responde un cuestionario fijo:

1. ¿De qué trata, en una frase?
2. ¿Qué te llevas o qué puedes hacer después de verlo?
3. ¿Qué palabra o frase no entendiste o te hizo dudar?
4. ¿Qué sentiste al leer la primera slide? (elige una de la lista de emociones)
5. ¿Qué harías al terminar? (guardar / enviárselo a alguien / comentar / nada)
6. ¿Algo te confundió, se contradijo o prometió algo que no llegó?

Se corren **dos lectores**: el no técnico completo y uno "con prisa" que solo
recibe títulos y `highlight` de cada slide (escaneo en capas, K12). Pasa si:
(1) coincide con el tema, (2) nombra el entregable, (3) está vacío o solo cita el
término permitido, (4) coincide con la emoción objetivo, (5) coincide con la
señal objetivo, (6) está vacío, **en ambos lectores**. Si no, el planificador
reescribe (máximo 3 vueltas) y vuelve a correr. El resultado y las notas de cada
intento quedan en `plan.json` (`lectorFrio`) y en `registro.jsonl`: sirven para
cruzarlos con las métricas (si una pieza que pasó el lector frío tiene retención
< 0,3, el problema no es de claridad sino de hook o de tema).

**4. QA del archivo final** (en el Mac, después del render, sin juicio):

- Cuadro 0 del reel y portada del carrusel: luminancia media > 12 % (no es una
  pantalla negra), hay texto detectado en la zona segura (15-75 % vertical), sin
  wordmark (el logo entra a los 3 s).
- Pista de audio presente (`ffprobe`); un MP4 mudo no se sube.
- Cada texto del reel visible al menos `palabras ÷ 2.5` s (lo garantiza
  `sceneSeconds`; se comprueba sobre el timeline exportado).
- Story: ≤ 8 palabras, texto en zona segura.

Lo que no pasa se marca `fallido` con el motivo y no se publica.

## Mejora 2 — Métricas (`src/insights/`)

Módulo nuevo, solo lectura, reutiliza `graphGet` de `src/meta/client.ts`.

- `fetchOwnMedia(since)`: `GET /{ig-user-id}/media?fields=id,caption,media_type,
  media_product_type,permalink,timestamp,like_count,comments_count`, paginado.
- `fetchMediaInsights(id, productType)`: lista de métricas por tipo; si Meta
  devuelve "metric not supported" se quita esa métrica y se reintenta (una vez por
  métrica). Reels: suma `ig_reels_avg_watch_time` y `ig_reels_video_view_total_time`.
- `fetchAccountInsights()`: `follower_count` (day, últimos 30 d),
  `online_followers` (lifetime), `reach` y `accounts_engaged`
  (`metric_type=total_value`, `period=day`, últimos 7 d). Si la cuenta tiene
  < 100 seguidores, `online_followers` falla: se registra y se usa la tabla por
  defecto.
- `snapshotDue()`: para cada post publicado, decide si toca instantánea (24 h,
  72 h, 7 d, 14 d, 21 d, 28 d ± 1 h) y la guarda en SQLite (tabla `insights`:
  `media_id, ventana, tomada_en, reach, saved, shares, likes, comments, views,
  avg_watch_ms, total_watch_ms`) y en `_metricas/instantaneas/<día>.jsonl`.
- Derivadas por post (ventana 7 d): `saved_por_alcance`, `shares_por_alcance`,
  `comments_por_alcance`, `views_por_alcance`, `retencion = avg_watch_ms / duracion_ms`
  (solo si la pieza salió del motor y conocemos la duración).
- Vínculo pieza ↔ post: `media_id` lo devuelve `media_publish` y se guarda en
  `registro.jsonl`. Posts publicados a mano antes del sistema se miden igual pero
  sin metadatos de pieza (aparecen como `origen: manual`).
- Puente con la calibración existente: cada instantánea de 7 d de una pieza del
  motor escribe `metrics/<name>.json` con el formato de `record.ts`
  (`predictedScore, saves, shares, reach, likes, savesPerK, sharesPerK`) y llama
  a `refreshCalibration()`. Con 3 piezas medidas la proyección "≈ X saves/1k"
  empieza a salir en `score`, `generate` y `remix` sin tocar ese código.
- Timers en el bot (mismo patrón `setInterval`): instantáneas cada hora;
  cuenta una vez al día; resumen semanal **domingo 05:30** (antes del
  planificador), escrito en `_metricas/resumenes/` y enviado por Telegram.
- Telegram: `/metricas` (últimos 7 d: mejor y peor pieza por su señal objetivo,
  seguidores ganados, hora con más audiencia), `/metricas <id|url>` (todas las
  instantáneas de un post). Comando CLI espejo: `npm run insights [-- --desde=…]`.
- Aviso post-publicación: 2 min después de publicar, Telegram manda el permalink
  con "responde los comentarios en la primera hora" (ventana crítica del skill).

## Mejora 1 — Calendario y publicación

### Agente planificador (nube, domingo 06:00)

Prompt de la tarea: «Sigue `_calendario/INSTRUCCIONES.md` al pie de la letra».
El manual indica:

1. Clonar `ia-es-kb`. Leer `config.json`, `_metricas/posts.json`,
   `_metricas/cuenta.json`, `_calendario/registro.jsonl`, `experimentos.md`,
   `aprendizajes.md` y el resumen de la investigación de esa madrugada.
2. **Evaluar la semana pasada** (ritual del skill): mejor y peor pieza por señal
   objetivo con la ventana de 7 d; cerrar los experimentos que cumplen 4 semanas
   (anotar resultado en `experimentos.md`); actualizar `aprendizajes.md` con a lo
   más 3 frases nuevas, cada una con el dato que la respalda.
3. **Elegir temas** con esta prioridad: (a) derivados pendientes de ganadores;
   (b) temas con fichas nuevas o referencias investigadas esta semana; (c) temas
   con mejor tasa objetivo histórica (solo si tienen ≥ 3 piezas medidas); (d) el
   resto por antigüedad de su última pieza. Nunca dos piezas del mismo tema en la
   misma semana salvo derivados. Sin métricas (primeras semanas), solo (b) y (d).
4. **Asignar el mix** fijo (lun reel tutorial … sáb reel atemporal) y una señal
   objetivo por pieza. Horas desde `cuenta.json` (`online_followers`) o la tabla
   por defecto. Elegir **un** experimento y declararlo.
5. **Escribir cada borrador** desde la base: núcleo único, hook de una categoría
   probada, recompensa concreta (prompt copiable, checklist, comando), fuente
   citada al pie (`source`), caption con keyword en la primera línea y 3-5
   hashtags. Orden obligatorio: entregable → señal y destinatario → emoción →
   frase de amigo → cuerpo → hook (puntuado ≥ 8). Aplicar las reglas duras de
   texto y K1–K14; carrusel ≤ 10 slides; reel con `pace: ensenar` y una pista de
   `promo/audio/`. Puede pedir fondo `ai` en Hook o Cta (tope 3 por semana, lo
   cuenta el validador). Copy en español neutro.
6. **Lector frío** por pieza (dos lectores con contexto limpio, ver "Puerta de
   comprensión y emoción"). Reescribir hasta que ambos pasen, máximo 3 vueltas.
7. `node _calendario/validar.mjs <semana>` debe terminar con ✓. Lo que falle se
   corrige (máx. 3 vueltas en total con las del lector frío) o se deja el hueco
   vacío con motivo en `plan.json`.
8. Commit `calendario: semana 2026-10-12 (6 piezas)` y push con `pull --rebase`
   si hace falta. Si no hay nada publicable, igual deja una línea de latido en
   `registro.jsonl` (alerta de silencio a los 8 días, como la investigación).

### Render en el Mac (`npm run calendario:render`)

Comando idempotente; `deploy/launchd/es.ia.calendario-render.plist` lo lanza
cada hora mientras el Mac esté encendido (si estaba dormido, `launchd` lo corre
al despertar). También se puede correr a mano.

1. `git pull --rebase` de `knowledge/` (el clon del repo privado que ya tiene el
   Mac). Si no hay piezas `planificadas`, termina en silencio.
2. Por cada pieza: `emitCarouselFile` → `renderCarousel` (PNG) → JPEG con ffmpeg
   (`-q:v 2`, 1080×1350); reel: `renderReel` con `pace` y `audio` (MP4 h264,
   1080×1920, 30 fps) + `cover.jpg` (cuadro 0). Para toda pieza, además
   `story.jpg` (1080×1920: la portada en 9:16 con el rótulo "Nuevo en el feed ↑",
   plantilla `StoryCover`). Fondos `ai` se generan aquí con `OPENAI_API_KEY` del
   Mac y caché. Corre el **QA del archivo final** (cuadro 0, audio, tiempos de
   lectura, zona segura) y revalida score ≥ 75; si algo falla,
   `estado: fallido` con las sugerencias y sigue con la siguiente.
3. `rsync -az output/calendario/<semana>/<id>/ servidor:/data/media/<semana>/<id>/`
   con la clave SSH que ya registra `deploy-to-server.sh` (`SERVER_HOST` en `.env`).
   Luego `curl` a cada URL pública para confirmar que el servidor la sirve (200 y
   `Content-Type` correcto) antes de darla por buena.
4. Escribe en `plan.json` `estado: renderizado`, `medios: { urls[], cover, duracionMs }`,
   commit `calendario: render <semana> (<n> piezas)` y push con `pull --rebase`.
5. Un render completo (2 carruseles + 4 reels de ~50 s) toma unos 10-15 min en un
   Mac M-series; el comando muestra progreso y no bloquea el bot (son procesos
   distintos; el bot del Mac sigue apagado, solo corre el de Google).

### Bot del servidor (`src/calendario/`)

- `syncFromRemote` (ya existe, cada hora) detecta piezas recién `renderizadas`,
  las pasa a `programadas` y Telegram manda la portada, el caption, la hora y el
  botón **Saltar**. Una semana nueva sin render todavía solo se anota.
- **Aviso de render pendiente**: si el sábado a las 12:00 (o 12 h antes de la
  primera pieza de la semana siguiente) hay piezas `planificadas` sin render,
  Telegram avisa «Prende el Mac: faltan N piezas por renderizar». A la hora de
  publicar, una pieza sin render se marca `saltada` con motivo y avisa.
- Servidor estático: `GET /media/<token>/<semana>/<id>/<archivo>` en el mismo
  `node:http` del inbox (`KB_INBOX_PORT`), con un token largo por despliegue
  (`MEDIA_PUBLIC_TOKEN`) para que la URL no sea adivinable. Sirve desde
  `/data/media` (volumen de Docker). Borra la carpeta de una pieza 7 días después
  de su publish (Meta ya copió los archivos).
- `scheduler`: cada minuto revisa `registro.jsonl`/SQLite por piezas
  `programadas` cuya hora llegó (zona `America/Santiago`). Idempotente: la tabla
  `publicaciones` guarda `container_id` y `media_id`; si el proceso se reinicia a
  mitad, retoma desde el paso guardado y nunca crea un segundo contenedor para la
  misma pieza.
- `publish(pieza)`: carrusel = N contenedores `image_url` (`is_carousel_item`) →
  contenedor `CAROUSEL` con `children` y `caption` → `media_publish`. Reel =
  contenedor `media_type=REELS` con `video_url`, `cover_url` (primer cuadro),
  `share_to_feed=true` → sondear `status_code` cada 15 s hasta `FINISHED` (tope
  10 min) → `media_publish`. Story = contenedor `media_type=STORIES` con
  `image_url` (la portada 9:16), programada 60 min después del publish de su
  pieza y solo si la pieza se publicó (una pieza `saltada` o `fallida` no tiene
  story). `CALENDARIO_MODO=aviso` hace todo menos los POST.
- Reintentos: error de red o `status_code=IN_PROGRESS` → reintenta; error de
  Meta (contenido rechazado, permiso, cuota) → `fallido`, aviso con el mensaje
  traducido por `translateGraphError`, no reintenta.
- Estado del día siguiente: `GET /{media_id}?fields=permalink` para guardar el
  link en `registro.jsonl` y arrancar las instantáneas.
- Telegram: `/calendario` (semana en curso con estados), `/pausar`, `/reanudar`,
  `/publicar <id>` (fuerza ahora, para probar), `/saltar <id>`.

### Cambios en código, por módulo

| Archivo | Cambio |
|---|---|
| `src/meta/check.ts` | `REQUIRED_SCOPES` + `instagram_content_publish` cuando `CALENDARIO_MODO` está definido; muestra `followers_count` y si `online_followers` está disponible |
| `src/meta/client.ts` | `graphPost` ya existe; agregar `graphPostForm` si Meta exige form-encoded para `media` (verificar en implementación) |
| `src/insights/*` (nuevo) | `client.ts`, `snapshots.ts`, `derive.ts`, `summary.ts`, `cli.ts` |
| `src/calendario/*` (nuevo) | `plan.ts` (tipos + lectura), `render.ts` + `render-cli.ts` (Mac: render, rsync, verificación, commit), `publish.ts`, `scheduler.ts`, `media-server.ts`, `telegram.ts` (servidor) |
| `src/kb/bot.ts` | registra timers y comandos nuevos; `syncFromRemote` detecta piezas renderizadas y avisa si falta render |
| `package.json` | script `calendario:render` |
| `deploy/launchd/es.ia.calendario-render.plist` (nuevo) | lanza `calendario:render` cada hora en el Mac; `scripts/calendario-install-mac.sh` lo instala en `~/Library/LaunchAgents` |
| `.env` (Mac) | `SERVER_HOST`, `SERVER_MEDIA_DIR=/data/media`, `MEDIA_PUBLIC_BASE`, `MEDIA_PUBLIC_TOKEN` (mismos valores que el servidor) |
| `src/kb/db.ts` | tablas `insights`, `publicaciones`, `calendario_estado` |
| `src/score/calibration.ts` | sin cambios; recibe `metrics/*.json` del puente |
| `src/remix/emit.ts` | exponer `emitCarouselFile` para borradores JSON (hoy solo lo usa el remix) |
| `src/reel/*` | `renderReel(spec, {pace, audio, outDir})` como función (hoy solo CLI) |
| `Dockerfile` | sin cambios (no hay Chromium en el servidor) |
| `compose.yaml` | volumen `/data/media`; `MEDIA_PUBLIC_TOKEN`, `CALENDARIO_MODO`, `MEDIA_PUBLIC_BASE` (dominio ngrok) |
| `scripts/server-setup.sh` | crea `/data/media` con permisos para el usuario de `rsync` |
| `kb-plantilla/_calendario/` (nuevo) | `INSTRUCCIONES.md`, `config.json`, `validar.mjs`; `scripts/kb-calendario-install.sh` los copia a la base |
| `promo/audio/` (nuevo) | 2-3 pistas libres de derechos (el usuario las elige) |
| `src/templates/StoryCover.tsx` (nuevo) | portada 9:16 para la story: hook + rótulo, look lima, registrada en el catálogo |
| `src/templates/Frame.tsx`, `src/reel/runtime` | wordmark y cabecera `NN / PILAR` con `data-anim="late"` (entran a los 3 s en el reel); prop `showLogo: false` por defecto en `Hook` cuando es portada de carrusel |
| `src/calendario/qa.ts` (nuevo) | QA del archivo final: luminancia del cuadro 0, texto en zona segura (OCR ligero o bounding boxes del render), `ffprobe` de audio, tiempos de lectura por escena |
| `kb-plantilla/_calendario/lector-frio.md` (nuevo) | prompt fijo del lector frío (perfil de audiencia, cuestionario, criterio de paso) y el perfil "con prisa"; versionado para que el evaluador no lo cambie el que escribe |
| `README.md` | sección "Marca" con el look lima (hoy navy + cian); sección nueva "Calendario y métricas" |
| `test/insights.ts`, `test/calendario.ts` (nuevos) | pruebas offline: parseo de insights con métricas faltantes, cálculo de ventanas, asignación de horas, máquina de estados idempotente (pieza y su story), validación de borradores (catálogo, tope de fondos IA, caption, reglas duras de texto: longitudes, siglas, relleno, un término técnico, tiempo de lectura por escena), QA del archivo con un MP4 mudo y un cuadro 0 negro |

## Mejora 3 — Bucle de feedback

El bucle es la suma de tres entradas que ya quedaron definidas arriba; aquí se
fija qué cambia con los datos y qué no.

| Entrada | Qué cambia | Cuándo empieza a actuar |
|---|---|---|
| Tasas por tema/arquetipo/hook (`posts.json` + `registro.jsonl`) | Prioridad (c) de la elección de temas; elección de categoría de hook por arquetipo | ≥ 3 piezas medidas por tema |
| Ganadores (20 % superior, 7 d) | Derivados programados en las 2 semanas siguientes | Desde la primera semana medida |
| Experimento semanal | Una variable del calendario; se consolida o se descarta a las 4 semanas | Semana 1 |
| `online_followers` | Horas del calendario | ≥ 100 seguidores |
| `follower_count` diario vs. piezas | Detecta qué piezas traen seguidores (delta del día siguiente) | Semana 1 |
| Instantánea 7 d → `metrics/*.json` | Calibración del score (`refreshCalibration`); proyección en `score`/`generate`/`remix` | ≥ 3 piezas |
| `aprendizajes.md` | Contexto del agente la semana siguiente (lo que ya se sabe de la cuenta) | Semana 2 |

Lo que **no** cambia solo: los pesos léxicos de `virality.ts`, el mix semanal, la
zona horaria y el modo de publicación. Cambiarlos exige editar `config.json` o
código: el evaluador queda fuera del alcance del agente (`ingenieria-de-bucles`).

Diagnóstico mensual (árbol del skill, con lo que la API sí da):

1. Seguidores nuevos / alcance total < 1 % → problema de perfil (bio, CTA), no de
   contenido. Aviso en el resumen.
2. Reels con `retencion` < 0,3 (tiempo medio / duración) → hooks: el agente debe
   cambiar la categoría de hook de ese arquetipo la semana siguiente.
3. Retención bien pero `saved/reach` y `shares/reach` planos → falta entregable o
   destinatario explícito: el agente revisa la recompensa de la pieza.
4. Todo bien y crecimiento plano → volumen o distribución: considerar 3 carruseles
   o trial reels (requiere 1.000 seguidores).

El skill evalúa en ciclos de 4 semanas; el resumen semanal muestra la tendencia,
pero las decisiones del agente sobre temas y hooks se toman con datos de 4
semanas, no de una.

## Fases de entrega (cada una se puede fusionar sola)

| Fase | Entrega | Tamaño | Valor que deja |
|---|---|---|---|
| 0 · Prerrequisitos | Token con `instagram_content_publish` (System User), `/data/media` + ruta `/media` + `MEDIA_PUBLIC_TOKEN` en el servidor, `rsync` por SSH desde el Mac probado (`SERVER_HOST` apuntando a la máquina de Google, no a Oracle), pistas de audio, `kb-calendario-install.sh`, README con el look lima, **perfil listo** (nombre con keyword, bio de una frase con CTA, foto, destacadas: fase 0 del skill, lo haces tú) | S | Nada visible; destraba lo demás |
| 1 · Métricas | `src/insights/`, instantáneas, `/metricas`, resumen semanal, puente a `metrics/*.json` | M | Desde el primer día se mide lo que publiques a mano. Sin riesgo: solo lectura |
| 2 · Calendario y publicación | Agente planificador + `_calendario/` + `calendario:render` en el Mac (launchd) + `publish.ts` + scheduler idempotente + `/pausar` + previews, aviso de render pendiente y aviso post-publicación por Telegram | L | Manos libres salvo tener el Mac encendido un rato entre el domingo y el lunes |
| 3 · Bucle | Prioridad por métricas, derivados, experimentos, diagnóstico mensual, `aprendizajes.md` | M | El calendario aprende de la cuenta |

Orden recomendado: 0 → 1 → 2 → 3. La fase 1 antes que la 2 porque el bucle
necesita historia y hoy no hay ninguna; además la fase 1 mide desde ya lo que
publiques a mano. La primera corrida real de la fase 2 se prueba con
`/publicar <id>` de una sola pieza antes de dejar el domingo entero al scheduler.

## Manejo de errores

- **Token vencido o sin permiso**: `meta:check` diario ya avisa a 10 días; el
  scheduler no intenta publicar con un token que `debug_token` marque inválido y
  avisa por Telegram. Con System User no vence.
- **Meta rechaza el contenedor** (formato, tamaño, URL inaccesible): `fallido`,
  mensaje traducido, la pieza no se reintenta; las demás de la semana siguen.
- **ngrok caído a la hora de publicar**: Meta no puede descargar; el contenedor
  queda en `ERROR`; se reintenta 3 veces en 30 min y luego `fallido`.
- **Reinicio del contenedor durante un publish**: la tabla `publicaciones` guarda
  el último paso; al arrancar se retoma. Nunca se duplica un post.
- **El agente no corrió** (sin carpeta de semana el domingo 12:00): aviso de
  silencio; la semana queda sin piezas (no se reciclan las anteriores).
- **Métrica que Meta deja de soportar**: se descarta esa métrica y se registra;
  nunca falla la instantánea completa.
- **Pieza con score < 75 tras render** (el validador en la nube no pudo correr el
  score): `fallido` con las sugerencias del score; hueco vacío.
- **El Mac no se prendió antes de la hora**: la pieza se marca `saltada` con
  motivo y avisa; no se publica tarde (la hora es parte del plan y del
  experimento). El sábado a las 12:00 ya hubo un aviso preventivo.
- **`rsync` falla o la URL no responde 200**: el render queda local, la pieza
  sigue `planificada`, el comando avisa en la terminal y por Telegram
  (`notifyAdmin` vía el bot del servidor no aplica: el Mac no tiene bot; usa un
  `sendMessage` directo con el token de Telegram que ya está en `.env`). La
  próxima corrida horaria reintenta sin volver a renderizar (los archivos están).
- **Render a medias por reposo del Mac**: el comando escribe cada pieza en una
  carpeta temporal y la mueve al final; una pieza incompleta se vuelve a
  renderizar entera en la corrida siguiente.
- **Dos bots** (Mac y servidor): ya está resuelto (409 de Telegram); el scheduler
  además exige `CALENDARIO_MODO` definido, que solo lo tiene el servidor.
  `calendario:render` no arranca ningún bot.

## Pruebas

- Offline (`npm test`): parseo de insights con métricas ausentes; cálculo de
  ventanas (24 h/72 h/7 d) y de tasas; asignación de horas desde
  `online_followers` y desde la tabla por defecto; prioridad de temas con y sin
  métricas (encogimiento, mínimo 3); máquina de estados de publicación
  (reinicio a mitad → sin duplicado); `validar.mjs` con borradores válidos e
  inválidos (11 slides, sin señal, caption sin hashtags).
- Con Chromium (`npm run test:reel` ampliado, en el Mac): borrador JSON → JPEG
  1080×1350 y MP4 con audio; `rsync` a un directorio local simulando el servidor.
- Manual, una vez: `/publicar <id>` de una pieza de prueba y comprobar en
  Instagram, el `media_id` en `registro.jsonl` y la instantánea de 24 h. Si algo
  sale mal, se borra desde la app.

## Puesta en marcha

1. Fase 0 en el servidor (`deploy-to-server.sh`: volumen `/data/media`, token
   público, `CALENDARIO_MODO=auto`) y en el Mac (`scripts/calendario-install-mac.sh`:
   `SERVER_HOST` en `.env`, prueba de `rsync`, agente de `launchd`).
2. `scripts/kb-calendario-install.sh` → copia manual, config y validador a
   `ia-es-kb`; editar `config.json` (horas por defecto, hashtags base).
3. Crear la tarea programada en claude.ai: domingo 06:00 America/Santiago,
   repo `ia-es-kb`, prompt «Sigue `_calendario/INSTRUCCIONES.md` al pie de la
   letra».
4. Primer domingo: `npm run calendario:render` a mano en el Mac para ver el
   proceso; `/publicar <id>` con una pieza de prueba; corregir el manual con lo
   que se vea.
5. Dejar correr la primera semana completa con `launchd`.

## Fuera de alcance

- Stories interactivas (encuestas, preguntas, stickers): la API no las publica.
- Reels con grabación de pantalla o voz (los del motor son de texto animado).
- Trial reels (exigen 1.000 seguidores) y colaboraciones.
- Responder comentarios automáticamente (solo el recordatorio por Telegram).
- Reaprender los pesos de `virality.ts` con los datos (primero hay que tener 30+
  piezas medidas; se evalúa en 3 meses).
- Más de una cuenta.
