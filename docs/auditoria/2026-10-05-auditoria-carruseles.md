# Auditoría de 3 carruseles contra la base de conocimiento (2026-10-05)

Alcance: `video-3-segundos`, `escalera-dopamina`, `voz-subtitulos-gratis` (carrusel 4:5 y reel 9:16). Se leyeron los textos del código, las 22 imágenes renderizadas, cuadros de los tres reels (`entregables/2026-10-04/*/reel.mp4`) y las notas de la base. Todas las rutas de notas son relativas a `knowledge/`. Todo dato nuevo de este informe sale de una nota enlazada; lo que es juicio mío está marcado como "juicio".

## Resumen ejecutivo

| Carrusel | Puntaje del filtro léxico | Veredicto con criterios de la base | Prob. de funcionar |
|---|---|---|---|
| video-3-segundos | 100 | Contenido honesto y bien citado, pero el hook es una afirmación sin tensión y los 7 slides son solo texto | Media-baja (guardados: media; alcance: baja) |
| escalera-dopamina | 98 | Mejor CTA y mejor slide guardable (checklist), pero el medio es definicional y omite las tácticas concretas que sí están en la base | Media |
| voz-subtitulos-gratis | 100 | Ofrece valor real (comandos copiables) pero mezcla 3 ideas en el hook, usa jerga y el CTA no calza con la audiencia | Media-baja (guardados en nicho: media-alta; alcance: baja) |

Hallazgos transversales:
1. Ningún slide "muestra": los tres son texto sobre fondo oscuro con 30-50 % de espacio vacío (ver `slide-*.png`). La única imagen es la ilustración IA decorativa de la portada y del CTA. Criterio "Concreto / mostrar, no decir" incumplido en los tres.
2. Los hooks son enunciados, no bucles de curiosidad; solo el de la escalera tiene una promesa pendiente ("El #5...").
3. Los tres reels (31,9 a 35,9 s) se exportan sin pista de audio (`ffprobe` solo lista un stream de video). `hook-de-video` pide usar sonido o música.
4. El puntaje 100/98/100 mide presencia de palabras, no calidad (ver "Límites del filtro interno").

---

## Criterios de la base

Cada criterio indica su nota de origen y su solidez. "Fecha" es el campo `revisado` de la nota; las fichas de `fuentes/` no tienen `revisado`, solo `guardado` y `confianza`.

| # | Criterio verificable | Origen | Fecha | Solidez |
|---|---|---|---|---|
| K1 | La propuesta de contenido aparece en los primeros 3 s (en el reel: ya en el primer cuadro legible). | [referencias/hook-de-video.md](referencias/hook-de-video.md) | revisado 2026-10-04 | Media: guía oficial de TikTok para anuncios; no hay umbral universal (la propia nota lo dice). |
| K2 | El hook se sostiene hasta el segundo 6 con suspenso, sorpresa u otra emoción. | [referencias/hook-de-video.md](referencias/hook-de-video.md) | 2026-10-04 | Media (misma fuente). |
| K3 | Estimulación: en 1-2 s hay impacto visual (movimiento, color, contraste, brillo). | [referencias/escalera-de-la-dopamina.md](referencias/escalera-de-la-dopamina.md) | 2026-10-04 | **Débil**: la nota dice que no hay estudios que validen el marco; solo la premisa curiosidad -> dopamina -> retención tiene respaldo (Neuron 2014). |
| K4 | Cautivación: abrir una pregunta o bucle de curiosidad en la primera línea. | [referencias/escalera-de-la-dopamina.md](referencias/escalera-de-la-dopamina.md); ficha [fuentes/2026-10-04-dm-17952300600275624.md](fuentes/2026-10-04-dm-17952300600275624.md) (ejemplo "Nobody tells you this about branding") | 2026-10-04; ficha `confianza: medium` | Débil-media (marco de creadores + post de @expert.pitch). |
| K5 | Reusar la estructura de hooks probadas (controversia, "nadie habla de esto", "deja de hacer X", plantillas con huecos). | [fuentes/2026-10-05-dm-18190607413395702.md](fuentes/2026-10-05-dm-18190607413395702.md) (20 hooks), [fuentes/2026-10-04-dm-18093109817320486.md](fuentes/2026-10-04-dm-18093109817320486.md) (Controversy Hooks) | guardado 2026-10-05 / 2026-10-04; `confianza: medium` | **Débil**: son listas de un autor que afirma que "están probadas"; sin datos ni método. Úsalas como plantillas de redacción, no como evidencia. |
| K6 | Concreto: reemplazar la afirmación abstracta por una cifra, imagen o detalle específico ("42 grados, sin sombra, sin agua" frente a "un día caluroso"). | [referencias/mostrar-no-decir.md](referencias/mostrar-no-decir.md), [referencias/made-to-stick.md](referencias/made-to-stick.md), ficha [fuentes/2026-10-04-dm-18137943652614038.md](fuentes/2026-10-04-dm-18137943652614038.md) | 2026-10-04 | **Fuerte** en la parte cognitiva (efecto de concreción replicado en *Memory & Cognition* 2019, según la nota). Que el "mostrar" deba ser visual en un slide es extrapolación (juicio). |
| K7 | Romper la predicción: si pueden anticipar los próximos 5 s se van; nuevo visual o línea cada 2-3 s. Inesperado (SUCCESs). | [fuentes/2026-10-04-dm-17952300600275624.md](fuentes/2026-10-04-dm-17952300600275624.md); [referencias/made-to-stick.md](referencias/made-to-stick.md) | `medium` / 2026-10-04 | Débil (el "cada 2-3 s" es del post; "Inesperado" es de un libro de divulgación). |
| K8 | Anticipación y validación: el pico llega justo antes de la respuesta; la respuesta es no obvia o un consejo accionable. | [referencias/escalera-de-la-dopamina.md](referencias/escalera-de-la-dopamina.md) | 2026-10-04 | Débil (marco sin estudios). |
| K9 | Simple: un solo núcleo; excluir el resto ("si defiendes diez puntos no recuerdan ninguno"). | [referencias/made-to-stick.md](referencias/made-to-stick.md) | 2026-10-04 | Media (libro de divulgación de Stanford/Duke). |
| K10 | Creíble: afirmaciones con fuente y con el alcance real de la evidencia. | [referencias/made-to-stick.md](referencias/made-to-stick.md) (Credentialed); [referencias/hook-de-video.md](referencias/hook-de-video.md) sección Evidencia | 2026-10-04 | Media. |
| K11 | Sin maldición del conocimiento: quien sabe no imagina no saber (experimento Newton: esperaban 1 de 2 aciertos, hubo 1 de 40); definir la jerga. | [referencias/made-to-stick.md](referencias/made-to-stick.md) | 2026-10-04 | Fuerte como experimento; su aplicación a slides es juicio. |
| K12 | Escaneo por capas (layer-cake): titulares descriptivos, palabras con información al inicio de cada línea, viñetas para pasos, negrita solo en frases cortas, alinear a la izquierda. | [referencias/patron-de-lectura-en-f.md](referencias/patron-de-lectura-en-f.md) | 2026-10-04 | **Fuerte** (NN/g, eyetracking), pero es de páginas web; en slides es extrapolación (juicio). La nota advierte que el post original malinterpreta a NN/g ("diseña para el F"). |
| K13 | Recompensa clara como remate; CTA con un solo gesto. Mecánica "comenta una palabra y te envío X". | [fuentes/2026-10-05-dm-18035497727845829.md](fuentes/2026-10-05-dm-18035497727845829.md) (`confianza: low`, 4 líneas); [temas/Marketing y diseño de conversión.md](temas/Marketing%20y%20diseño%20de%20conversión.md) | 2026-10-05 | **Muy débil**: la base no tiene datos de conversión de ningún CTA, ni de guardados/compartidos. |
| K14 | Mensajero: el espectador debe terminar apreciando y reconociendo al creador (niveles 5-6); hablarle a una persona, no a un público genérico; repetir un formato atemporal en vez de perseguir tendencias. | [referencias/escalera-de-la-dopamina.md](referencias/escalera-de-la-dopamina.md); [fuentes/2026-10-01-dm-18070999682775971.md](fuentes/2026-10-01-dm-18070999682775971.md) (Career Hound); [referencias/shortimize.md](referencias/shortimize.md) (revisado 2026-10-03) | 2026-10-04 / 2026-10-03 | **Débil**: un caso de un creador (cifras que él declara) y un marco sin estudios. Shortimize sirve para medir, no valida nada. |

Complemento operativo del reel (no cuenta como criterio de contenido): [referencias/hook-de-video.md](referencias/hook-de-video.md) pide 9:16, mínimo 720p, sonido y zona segura de la interfaz; y "revisar en analítica dónde abandonan".

### Qué NO tiene respaldo en la base (dilo antes de confiar)
- No hay ninguna nota sobre rendimiento de carruseles de Instagram (guardados, compartidos, número ideal de slides, swipe). Mis búsquedas de "carrusel/carousel/swipe/desliza" solo devuelven posts que son carruseles, sin datos. Reglas como "6-8 slides" o "la portada es el 80 % del alcance" (están en `src/score/virality.ts`) no aparecen en la base: son supuestos.
- No hay nada sobre el algoritmo de Instagram.
- Las cifras de Meta/Nielsen (47 %, 74 %, 65 %, 45 %) son de **anuncios en video** y de estudios encargados por la plataforma (`hook-de-video`, sección Evidencia). Extenderlas a "tu video" orgánico es una extrapolación.
- Los 6 niveles de la escalera no tienen validación empírica (`escalera-de-la-dopamina`, sección Evidencia).
- Inconsistencia en la base: `temas/Marketing y diseño de conversión.md` y `temas/Creación de contenido para redes sociales.md` llaman "Affiliation" al nivel 5; la referencia `escalera-de-la-dopamina` (revisada, con fuentes del marco original) dice "Affection". El carrusel usa "Afecto", que es lo correcto según la referencia.

---

## 1. video-3-segundos ("Tu video se decide en 3 segundos")

### Evaluación

| Criterio | Estado | Evidencia |
|---|---|---|
| K1 propuesta en 3 s | ⚠️ | Slide 1: la propuesta es "te muestro por qué, con datos". En el reel, el cuadro 0 es solo la imagen del cronómetro y el eyebrow; el titular entra hacia 0,4-1 s. Cumple, pero la promesa es débil (es una tesis, no un beneficio para el espectador). |
| K2 sostener hasta s6 | ⚠️ | El hook dura unos 5,5 s (estimado con `sceneSeconds`) y no hay nada nuevo después del titular: ni dato, ni pregunta, ni imagen que cambie. |
| K3 estimulación visual | ✅ | Cronómetro cian brillante sobre azul muy oscuro, buen contraste. Pero el eyebrow "LO QUE MIDEN META Y TIKTOK" se superpone al dibujo (slide 1, y se ve en todos los cuadros del reel hasta 6 s), lo que resta legibilidad. |
| K4 bucle abierto | ❌ | Titular declarativo; "No es exageración" es defensivo y responde a una duda que nadie planteó. |
| K5 plantilla de hook | ❌ | No usa ninguna estructura de las listas (pregunta, "nadie habla de esto", dato como gancho). |
| K6 concreto / mostrar | ❌ | Las 4 cifras (47 %, 74 %, 65 %, 45 %) están escondidas en cuerpo de texto de 14-16 px (slides 3 y 4). Es exactamente "decir": la cifra es el dato gigante natural y no se ve. |
| K7 romper predicción / ritmo | ❌ | 7 escenas, todas texto que entra por palabras. No hay nuevo visual cada 2-3 s. |
| K8 anticipación/validación | ⚠️ | Hay validación útil (slide 6 "Cómo lo aplico"), pero no hay pico de anticipación: el slide 2 ya entrega la conclusión. |
| K9 simple | ✅ | Un solo núcleo (los 3 primeros segundos). |
| K10 creíble | ⚠️ | Fuentes en cada slide (bien). Pero: el hook y el slide 2 afirman en absoluto ("se decide", "el resto del video no se ve"); el dato es "hasta el 47 % del valor de una campaña de video" medido en anuncios por Meta/Nielsen. El slide 5 titula "La regla de TikTok" para lo que es la guía creativa de **anuncios**. Falta decir el alcance. |
| K11 maldición del conocimiento | ✅ | Lenguaje llano. Solo "zona segura" queda sin explicar. |
| K12 escaneo | ✅ | Titulares descriptivos con palabra clave en cian, viñetas, alineado a la izquierda. Un matiz: mucho espacio vacío (el contenido ocupa el 40 % medio del slide). |
| K13 recompensa / CTA | ⚠️ | "Guárdalo para tu próximo video" es un gesto claro, pero la píldora dice "Link en bio" y el texto ofrece un correo semanal: tres pedidos distintos. La recompensa (checklist) existe en slide 6 pero va sin cerrar. |
| K14 mensajero | ❌ | Ningún elemento de persona/voz. (Esto es común a los tres; ver nota de límites.) |

### Veredicto: probabilidad media-baja
Razón: el contenido es útil y veraz (se guarda), pero el slide 1 no frena el scroll de quien no ya sabe que le importa (tesis + "con datos" = promesa de clase magistral), y los slides 3-4 esconden sus dos mejores recursos, las cifras, en párrafos. Ironía a favor de la reescritura: el carrusel enseña "haz que lo primero que se vea sea el resultado" y su primer cuadro no lo hace.

### Reescritura

**Hook, 2 opciones** (titular ≤ 48 caracteres):
- A (dato como gancho; plantilla "Here is exactly how I got (X result)" adaptada a un dato): título **"Hasta 47% del valor, en 3 segundos"** (34), highlight `47%`; subtítulo "Lo midieron Meta y Nielsen en anuncios de video. Así abres el tuyo."
- B (pregunta en la primera línea, K4): título **"¿Qué pasa en tus primeros 3 segundos?"** (37), highlight `3 segundos`; subtítulo "Meta y TikTok miden justo ahí. 4 pasos para abrir mejor."

**Cambios por slide** (props de plantilla; límites respetados):

| Slide | Cambio | Texto exacto propuesto | Elemento visual "mostrar" |
|---|---|---|---|
| 1 Hook | Mover el eyebrow fuera del dibujo y poner el dato como protagonista | eyebrow: "Meta + Nielsen · anuncios en video" | Dato gigante: "47%" a 200+ px en cian, con el cronómetro detrás más tenue. |
| 2 Lead | Quitar el absoluto, anclar el alcance | text: "Hasta el 47% del valor de un anuncio en video llega en 3 segundos. Tu promesa va ahí." | Línea de tiempo 0-3-10 s con el tramo 0-3 s resaltado. |
| 3 Step 01 | Titular con verbo y alcance; avisar que el estudio es de la plataforma | heading: "Meta y Nielsen lo midieron" (4 palabras); body: "En anuncios de video: hasta 47% del valor llega en 3 s y hasta 74% en 10 s. Son estudios encargados por la plataforma." (~115 car.) | Dos barras horizontales (47 % y 74 %) sobre un eje 0-10 s, o dos cifras gigantes apiladas. |
| 4 Step 02 | Convertir el párrafo en embudo | heading: "Quien pasa 3 segundos, se queda" (5 palabras); body: "De quienes ven 3 segundos, el 65% sigue al menos 10 y el 45% llega a 30. Úsalo para ubicar tu promesa, no como ley." (~115 car.) | Embudo de tres barras: ven 3 s (100 %) -> 10 s (65 %) -> 30 s (45 %). Los 100 % son por definición de la cifra de la nota. |
| 5 Step 03 | Corregir el alcance y ordenar por tiempo | heading: "TikTok pide 3 y 6 segundos" (5); bullets: "0-3 s: muestra la propuesta", "Hasta el 6: sostén con suspenso o sorpresa", "9:16, mínimo 720p y con sonido", "Respeta la zona segura"; source: "Fuente: TikTok, guía creativa de anuncios" | Maqueta de teléfono 9:16 con la zona segura sombreada y una regla 0-3-6 s al costado. |
| 6 Step 04 | De consejos genéricos a un antes/después (ilustrativo, rotular como ejemplo) | heading: "Antes y después del primer cuadro" (5); bullets: "Antes: saludo y logo en pantalla", "Después: el resultado y el titular desde el cuadro 1", "Mira en tus métricas dónde abandonan" | Dos mini cuadros 9:16 lado a lado, "Antes" (sin promesa) y "Después" (resultado + titular). Es un ejemplo ilustrativo; no insinuar que sea un caso medido. |
| 7 Cta | Un solo pedido, atado al contenido | title: "Guárdalo antes de editar" (4); reason: "Úsalo como checklist para tus primeros 3 segundos."; quitar la píldora "Link en bio" o el correo (dejar uno solo) | Checklist de 3 casillas (promesa en 3 s / gancho hasta 6 s / titular desde el cuadro 1) como fondo en vez del sobre IA. |

---

## 2. escalera-dopamina ("6 niveles para que no te hagan scroll")

### Evaluación

| Criterio | Estado | Evidencia |
|---|---|---|
| K1 propuesta en 3 s | ✅ | Slide 1: número + beneficio ("6 niveles para que no te hagan scroll"). Se entiende en un cuadro. |
| K2 sostener hasta s6 | ⚠️ | "El #5 ya no depende del video, sino de ti" es la única tensión abierta. Pero el slide 2 pasa a definir sin pagar ese bucle hasta el slide 5. |
| K3 estimulación visual | ⚠️ | Escalera cian con 6 peldaños, pero el overlay (0,62) la apaga casi del todo; el subtítulo se superpone a los peldaños (slide 1). Poco contraste de movimiento. |
| K4 bucle abierto | ✅ | "#5" con número y promesa pendiente. Parcial: el titular en sí no es pregunta. |
| K5 plantilla de hook | ⚠️ | Lista numerada; no usa controversia/"nadie te dice". |
| K6 concreto / mostrar | ❌ | Los slides 3-5 definen los 6 niveles con frases abstractas ("la confianza pasa del video a ti"). No hay un ejemplo, un guion, ni un diagrama de la escalera. Es el "decir" que critica `mostrar-no-decir`. |
| K7 romper predicción / ritmo | ❌ | Tres slides seguidos con la misma forma (heading + 2 viñetas). Predecibles. |
| K8 anticipación/validación | ⚠️ | Validación fuerte en slide 7 (prompt-checklist accionable, y "empieza clavando los 4 primeros" viene de la referencia). Falta anticipación. |
| K9 simple | ⚠️ | 6 conceptos en 3 slides + mito + prompt. Aceptable por ser el tema, pero hay que exigirse la regla de la nota: "4 primeros". |
| K10 creíble | ✅ | Mejor del lote: cita a Kallaway y reconoce que "la ciencia respalda la curiosidad, no los 6 niveles (Neuron, 2014)". Honestidad que la base valora (sección Evidencia). |
| K11 jerga | ✅ | Sin jerga. |
| K12 escaneo | ✅ | Viñetas que parten con el nombre del nivel (palabra con información al inicio, como pide NN/g). |
| K13 recompensa / CTA | ⚠️ | "Mándaselo a quien edita tus videos" es el CTA más específico de los tres (gesto + destinatario). Debilitado por la píldora "Link en bio" y el correo, que compiten con "mándaselo". |
| K14 mensajero | ❌ | Habla de afecto/revelación pero no da una sola táctica para ellos (la base tampoco las da: ver abajo). |

Hallazgos específicos:
- **Se dejaron fuera las tácticas más concretas que sí están en la base.** La ficha [fuentes/2026-10-04-dm-17952300600275624.md](fuentes/2026-10-04-dm-17952300600275624.md) trae: abrir con una pregunta en la primera línea, nuevo visual o línea cada 2-3 s, hablarle a una persona (no a "guys"), "si pueden predecir los próximos 5 s, se van", y preguntarse antes de publicar "¿qué peldaño estoy golpeando?". Son lo accionable; el carrusel gastó los slides en definiciones.
- **El slide 6 combate una creencia que nadie afirmó** ("Es ciencia comprobada"): como MythReality, el mito debe ser lo que el público cree, no un hombre de paja. Funciona como señal de credibilidad (Inesperado + Creíble), pero cambia el valor si el mito se formula como creencia real.
- **Los niveles 5-6 no tienen tácticas en la base** (`escalera-de-la-dopamina` solo los define). No se deben inventar; el carrusel debe decir que son de largo plazo y se miden en varios videos.

### Veredicto: probabilidad media
Razón: el hook funciona (número + promesa pendiente), el slide 7 es el más guardable de los tres y el CTA de compartir es específico. Lo frena un medio de tres slides idénticos y abstractos, sin ningún ejemplo de la escalera aplicada. Si el espectador llega al slide 7 se lleva valor; el riesgo es que abandone en los slides 3-5.

### Reescritura

**Hook, 2 opciones:**
- A (identificación + fallo): título **"Tu video falla en 1 de estos 6 niveles"** (38), highlight `1 de estos 6`; subtítulo "Kallaway los llama la escalera de la dopamina."
- B (pregunta, K4): título **"¿En qué peldaño se va tu espectador?"** (36), highlight `peldaño`; subtítulo "6 niveles. El #5 ya no depende del video, sino de ti."

**Cambios por slide:**

| Slide | Cambio | Texto exacto propuesto | Elemento visual "mostrar" |
|---|---|---|---|
| 1 Hook | Bajar overlay a ~0,4 y sacar el subtítulo de encima de los peldaños | (sin cambio de props de texto salvo título/subtítulo) | Escalera de 6 peldaños numerados con luz en el 1. |
| 2 Lead | Anclar la premisa que sí tiene respaldo | text: "La atención sola no retiene. Cada nivel es un control: si falla uno, se corta." (~75 car.) | **Diagrama central** de la escalera: 6 peldaños con llave "mensaje (1-4)" y "mensajero (5-6)", según la nota. |
| 3 Step 01 | Poner las 2 tácticas concretas de la ficha, con un ejemplo de la ficha | heading: "Estimula y cautiva" (3); bullets: "Estimula (1-2 s): movimiento, color y contraste", "Cautiva: abre con una pregunta. Ej.: «Nadie te cuenta esto sobre branding»", "Nuevo visual o línea cada 2-3 s" | Tarjeta con la frase de ejemplo grande, entre comillas, como si fuera la primera línea de un reel. |
| 4 Step 02 | Añadir la regla de predicción | heading: "Anticipa y valida" (3); bullets: "Anticipa: deja que intuyan la respuesta; el pico llega justo antes", "Valida: respuesta no obvia o consejo usable", "Si predicen los próximos 5 s, se van" | Curva simple (concepto, sin números) que sube hasta un pico y cae en un "check" de validación. |
| 5 Step 03 | Decir con honestidad que son de largo plazo | heading: "El mensajero: afecto y revelación" (5); bullets: "Niveles 1-4: el mensaje. 5-6: tú", "Afecto: empiezan a apreciarte y confiar", "Revelación: te reconocen como fuente constante" | Misma escalera del slide 2 con los peldaños 5-6 iluminados. |
| 6 MythReality | Mito = creencia real | myth: "Hay un estudio que valida los 6 niveles."; reality: "Es un marco de creadores, sin estudios."; source: "La ciencia respalda la curiosidad, no los 6 niveles (Neuron, 2014)" | Dos tarjetas ya existentes + sello "Sin validación" en la segunda. |
| 7 Prompt | Añadir el "peldaño más débil" | prompt: "Revisa este guion con la escalera de la dopamina. Para cada nivel dime si se cumple y en qué segundo:\n1. Estimulación (1-2 s)\n2. Cautivación (pregunta abierta)\n3. Anticipación\n4. Validación (respuesta no obvia)\n¿Qué peldaño es el más débil?\n[pega tu guion]"; note: "Copia y pega. Empieza clavando los 4 primeros." | Checklist de 4 casillas junto al bloque de código. |
| 8 Cta | Un solo pedido | title: "Mándaselo a quien edita tus videos" (mantener); reason: "O guárdalo para tu próximo guion."; quitar "Link en bio" | Sobre IA fuera; en su lugar la escalera con un peldaño a elegir. |

---

## 3. voz-subtitulos-gratis ("2 IAs gratis para voz y subtítulos")

### Evaluación

| Criterio | Estado | Evidencia |
|---|---|---|
| K1 propuesta en 3 s | ✅ | Número + "gratis" + qué hace. Claro. |
| K2 sostener hasta s6 | ⚠️ | El subtítulo "Y por qué conviene moverte antes de 2027" abre un bucle, pero vago: no dice qué se apaga ni para quién. |
| K3 estimulación visual | ✅ | Onda sonora cian que se convierte en líneas de texto, relevante al tema. Similar al overlay 0,62 de la escalera; legible. |
| K4 bucle abierto | ⚠️ | El bucle de 2027 está, pero se paga en el slide 6 (de 7). |
| K5 plantilla de hook | ⚠️ | Lista con número + "gratis"; sin tensión ni controversia. |
| K6 concreto / mostrar | ⚠️ | **Lo mejor del carrusel**: el slide 4 muestra los comandos reales (`pip install -U openai-whisper` / `whisper audio.mp3 --model turbo`). Falla en Kokoro (slide 5: solo texto sobre parámetros y licencia) y en no mostrar ningún resultado (cómo se ve un subtítulo, cómo suena la voz). |
| K7 romper predicción / ritmo | ❌ | Mismo ritmo texto-texto-texto; el prompt y el mito rompen un poco. |
| K8 anticipación/validación | ⚠️ | Validación para Whisper (comando), no para Kokoro. |
| K9 simple | ❌ | Tres ideas en el hook: Whisper, Kokoro y el apagado de `whisper-1`. Con la regla "maestro de la exclusión", sobra una. |
| K10 creíble | ✅ | Datos de `referencias/whisper.md` y `kokoro.md` (revisadas 2026-10-03) con fuente; el slide 6 aclara que el modelo local no se ve afectado. |
| K11 jerga | ❌ | "82M de parámetros", "Apache-2.0", "MIT", "turbo ~8× más rápido que large" (large sin definir), "lang_code='e'" sin explicar. Es la maldición del conocimiento en acción. |
| K12 escaneo | ✅ | Estructura clara; el prompt en bloque monoespaciado destaca. |
| K13 recompensa / CTA | ❌ | "Guárdalo para tu próximo reel": el contenido es un tutorial de terminal, y el CTA lo enmarca para hacer reels. Además "Link en bio" y el correo duplican pedidos. |
| K14 mensajero | ❌ | Sin voz propia; irónico, porque el tema es justamente la voz. |

Hallazgos específicos:
- **El hook induce a error**: "conviene moverte antes de 2027" suena a que todos deben migrar. Según [referencias/whisper.md](referencias/whisper.md), lo que se retira el 2027-02-26 es `whisper-1` **de la API**; los pesos open source no se ven afectados. Quien siga el carrusel y use solo local no tiene nada que migrar.
- **Omisión de requisito**: la misma nota da ~6 GB de VRAM para `turbo`. "Corren en tu computador" sin decirlo promete más de lo que cumple para muchas máquinas.
- **Kokoro sin comando**: la nota trae el código (`pip install kokoro>=0.9.4 soundfile`, `KPipeline(lang_code='e')`). El nombre de la voz en español no está en la base (remite a VOICES.md), así que no se debe inventar.
- La nota de la base añade un dato útil que el carrusel no usa: OpenAI recomienda migrar a `gpt-transcribe` o `gpt-live-transcribe` (lanzados 2026-07-28; `gpt-transcribe` US$0,0045/min frente a US$0,006/min de `whisper-1`; [referencias/whisper.md](referencias/whisper.md)).

### Veredicto: probabilidad media-baja
Razón: para el nicho que ya usa terminal, el slide 4 es muy guardable (comando listo para copiar), pero la portada no distingue la ventaja ni crea tensión, mezcla tres ideas y el CTA apunta a una audiencia distinta a la que el contenido sirve. Alcance general bajo; guardados en nicho medios o altos (juicio; la base no tiene datos de rendimiento).

### Reescritura

**Hook, 2 opciones:**
- A (resultado + sin pagar): título **"Subtitula y narra gratis, sin salir de tu PC"** (43), highlight `gratis`; subtítulo "Whisper y Kokoro, en local. Pide ~6 GB de VRAM para el modelo turbo."
- B (especificidad tipo noticia, K6): título **"whisper-1 se apaga el 26 de febrero de 2027"** (43), highlight `26 de febrero`; subtítulo "Solo la API. Así sigues subtitulando gratis, en local."

**Cambios por slide** (con un slide nuevo para Kokoro; total 8):

| Slide | Cambio | Texto exacto propuesto | Elemento visual "mostrar" |
|---|---|---|---|
| 1 Hook | Elegir A o B; sacar "2027" del subtítulo si se usa A | ver arriba | Waveform -> líneas de texto, ya presente. |
| 2 Lead | Definir ambas herramientas en una frase llana | text: "Whisper convierte tu audio en texto. Kokoro convierte texto en voz. Los dos corren en tu PC." | Diagrama de flujo: audio -> [Whisper] -> texto -> [Kokoro] -> audio. |
| 3 Step 01 | Quitar jerga; añadir el requisito | heading: "Whisper: audio a subtítulos" (4); body: "De OpenAI, licencia MIT (uso libre). El modelo turbo transcribe ~8× más rápido que large (el más grande), con pérdida mínima de precisión. Pide ~6 GB de VRAM y ffmpeg." (~170 car.) | Antes/después con **salida real pegada de tu propia ejecución** (no inventar): audio de 1 línea -> texto. |
| 4 Prompt | Mantener; ajustar la nota | prompt (sin cambio); note: "Cambia audio.mp3 por tu archivo. Necesitas ffmpeg." | Bloque de código ya existente. |
| 5 (nuevo) Step 02 | Explicar Kokoro con un número que se vea | heading: "Kokoro: texto a voz" (4); body: "Modelo de voz pequeño (82M de parámetros), licencia Apache-2.0. En español hay 3 voces: 1 femenina y 2 masculinas." (~115 car.) | Dato gigante: "3 voces". Tres tarjetas (1 F, 2 M). |
| 6 (nuevo) Prompt | Comando para Kokoro | prompt: "pip install kokoro>=0.9.4 soundfile\nfrom kokoro import KPipeline\npipeline = KPipeline(lang_code='e')"; note: "lang_code='e' es español. Elige la voz en VOICES.md." | Bloque de código. |
| 7 MythReality | Mito = creencia real; no alarmar | myth: "Whisper desaparece en 2027."; reality: "Solo whisper-1 de la API. El local sigue."; source: "Retiro: 26-02-2027. OpenAI sugiere gpt-transcribe. Fuente: OpenAI" | Línea de tiempo con el hito 26-02-2027 sobre la barra "API", y la barra "local" sin corte. |
| 8 Cta | CTA que calza con el contenido | title: "Guárdalo y pruébalo hoy" (4); reason: "Los comandos para subtitular y narrar, listos para copiar."; quitar "para tu próximo reel" | Captura de los dos comandos como fondo. |

---

## Diferencias carrusel vs reel

Medido en los `reel.mp4` actuales: 1080x1920, 30 fps, 31,9 s (voz), 32,9 s (video-3), 35,9 s (escalera); 7-8 escenas de unos 2,4 a 5,5 s cada una (según `sceneSeconds`: 1,8 s + caracteres/26, tope 4,8 s, +0,7 s a portada y cierre).

| Aspecto | Carrusel (4:5) | Reel (9:16) | Qué cambiar |
|---|---|---|---|
| Control del ritmo | Lo marca el lector (swipe). Texto largo es tolerable. | Lo marca el reloj. | Cada escena debe decir una sola cosa; partir los slides con 2-3 viñetas en 2-3 escenas (K7: nuevo visual o línea cada 2-3 s, de una ficha de confianza media). |
| Primer cuadro | La portada se ve completa. | El cuadro 0 hoy es solo imagen + eyebrow; el titular entra entre 0,4 y 1 s (se vio en `au-row-video-3-segundos`). | Titular legible desde el cuadro 0 (K1: "propuesta en 3 s"). Dato gigante o pregunta ya visible, sin animación de entrada palabra a palabra en la portada. |
| Hook | Portada con título + subtítulo. | 0-3 s promesa, 3-6 s sostener (K1-K2). | La portada del reel dura ~5,5 s con el mismo texto quieto; añadir en 3-6 s el primer dato o la primera línea de la respuesta. |
| Duración | Sin límite. | 32-36 s. La base **no** dice cuál es la duración ideal de un reel orgánico; solo que 65 % de quienes ven 3 s siguen al menos 10 s y 45 % llega a 30 s (en anuncios). | Es una observación, no una regla: apuntar a que el pago (checklist, comando) llegue antes del último tercio y probar dos duraciones midiendo con [Shortimize](referencias/shortimize.md) o las métricas nativas. |
| Texto en pantalla | Todo el texto es el mensaje. | Sin audio, el texto es la narración; con audio, el texto debe subtitular. | Añadir audio (hoy no tiene pista). Para `voz-subtitulos-gratis` hay una ventaja natural: narrar el reel con Kokoro y subtitularlo con Whisper (mostrarlo en vez de decirlo). La CLI ya acepta `--audio`. |
| CTA | "Guárdalo", "Link en bio" funcionan en el carrusel. | En el reel "Desliza" no existe; el último cuadro dura ~5 s. | Un solo pedido en el último cuadro; verificar que "DESLIZA ->" no aparezca en la versión reel (no lo vi en los cuadros muestreados, pero no revisé todos). |
| Técnico | n/a | `hook-de-video`: 9:16, >=720p, sonido, zona segura. | Cumple 9:16 y 1080p. Faltan sonido y verificar la zona segura (no verificado en este informe). |
| Medición | Guardados/compartidos (la base no da datos). | "Revisar dónde abandonan" (`hook-de-video`). | Registrar la retención por segundo de los 3 reels y comparar la escena en que cae. |

## Los 3 cambios de mayor impacto (en orden)
1. **Poner la cifra o el ejemplo en pantalla** en los tres (47 % gigante y embudo 100/65/45; diagrama de la escalera con ejemplo de primera línea; flujo audio->texto->voz con comandos reales). Hoy ningún slide "muestra" (K6, criterio fuerte de la base).
2. **Reescribir los hooks** como dato-gancho o pregunta (K1, K4), y corregir el que induce a error (`whisper-1` es solo la API; el hook de la voz dice "mueve antes de 2027").
3. **Un solo CTA por pieza y alineado con el contenido** (quitar "Link en bio"/correo, que compite con "guárdalo"/"mándaselo"; no decir "para tu próximo reel" en un tutorial de terminal), y en los reels agregar audio y ritmo de cambio cada 2-3 s.

## Límites del filtro interno (`src/score/virality.ts`)
Los 100/98/100 son un proxy léxico y no dicen si el hook frena el scroll:
- Busca subcadenas: `"no "` cuenta como "enemigo" (`ENEMY`) y `"por qué"` como bucle abierto (`OPEN_LOOP`). El hook de `video-3-segundos` suma por "No es exageración" y "por qué", que no son tensión ni bucle.
- Premia la presencia de números, fuentes, `index/total` y un verbo de guardar/compartir, sin mirar si el dato se ve, si hay jerga, si el CTA calza o si hay varios pedidos.
- No puede ver imágenes, ritmo ni el primer cuadro del reel, ni afirmaciones que exceden la evidencia ("se decide en 3 segundos").
- Sus umbrales ("6-8 slides", "el 80 % del alcance") no tienen respaldo en la base.
Sugerencia (juicio): complementar con una lista manual K1-K14, y registrar saves/shares reales con `npm run record` para validar o descartar los criterios débiles (K3, K5, K7, K8, K13, K14).
