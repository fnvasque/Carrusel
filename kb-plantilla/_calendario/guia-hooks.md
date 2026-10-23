# Guía de hooks

Para el planificador (Paso 5 de `INSTRUCCIONES.md`). El hook es la portada: el
título y el subtítulo del `Hook` y, en reels, el `resultado` que se ve en el
primer cuadro. Decide si alguien se queda. Esta guía te dice qué le importa al
público, qué patrones usar, cómo escribir los candidatos y qué hacer con la
respuesta del juez. La última sección, «Para el juez», la copia el código en el
mensaje del juez (`node _calendario/validar.mjs --juez <semana> <id>`): no le
pases esta guía entera ni la cambies.

## Por qué hay guía

En la semana del 2026-10-19 los hooks salieron de un molde: pregunta + número +
«gratis». «¿ChatGPT trabaja sin ti? 3 tareas gratis», «¿Pagar por ordenar 117
correos? No, gratis», «¿Cuánto tiempo te ahorra la IA? 3 estudios». Son claros,
pero describen la herramienta y no tocan nada que al lector le importe. Las
personas del público entrevistadas lo dijeron: los hooks son poco atractivos y
el contenido les parece básico. Además, el mismo agente que escribía el hook se
ponía la nota. Desde el 2026-10-26 escribes varios candidatos y los elige un
juez con contexto limpio.

## A quién le hablas

Un profesional con cargo medio (jefe de área, coordinador, gerente de primera
línea), no programador, que **ya paga** Claude o ChatGPT y lo usa en el
trabajo. Sabe abrir un chat, pegar un texto y pedir un resumen: eso no lo
detiene. Le preocupa quedarse atrás frente a colegas que usan mejor la IA, o
que su rol de coordinar y revisar pierda valor, y le interesa cómo se lidera
cuando el equipo trabaja con IA.

Para él, «sofisticado» es **criterio**, no funciones: cuándo confiar en la IA,
cómo revisar lo que entrega, cómo encargarle trabajo de verdad, qué habilidad
vale más ahora, qué dice un estudio con sus matices. «Gratis» no es gancho:
este público paga.

## Qué está en juego

Un hook bueno nombra algo que el lector puede ganar o perder **en su trabajo**,
no una función de la app. Lo que está en juego para este público:

| Lo que está en juego | Cómo suena en un hook |
|---|---|
| **Su lugar en el equipo**: si suma o se queda atrás frente a quien usa mejor la IA | «Tu colega ya lo hace con Claude» |
| **El juicio de su jefe**: lo que entrega con su nombre, lo que le van a preguntar | «Que ChatGPT critique antes que tu jefe» |
| **El trabajo de su equipo**: lo que recibe hecho con IA, cómo lo revisa, cómo lo encarga | «Tu equipo te entrega trabajo hecho con IA» |
| **Su tiempo**: horas que de verdad se ahorran o se pierden, medidas, no prometidas | «Creían ir más rápido con IA. Iban más lentos» |
| **Su criterio frente a la IA**: cuándo creerle, cuándo revisar, qué no delegar | «La IA no siempre ayuda: cuándo revisar» |

Las frases de la tabla muestran el tono; cada cifra de un hook real sale de la
referencia de la pieza (regla dura 5), igual que en el cuerpo.

El susto es un tema legítimo, pero **con dato y con algo que hacer**. Nunca
«te va a reemplazar», «quedarás obsoleto» ni miedo sin salida (el score resta
por eso y el lector se va). «Revisar lo que hace la IA: la habilidad que más
pesa» toca el susto (¿mi rol de revisar pierde valor?) y da la salida, con el
dato de una referencia (en el Work Trend Index 2026 de Microsoft, el control de
calidad de lo que produce la IA encabeza las habilidades humanas, con 50 %).

## Lo que no cambia

- **Regla dura 8: el hook dice qué te llevas.** El título o el subtítulo nombra
  el resultado concreto y con qué IA. Un patrón agrega tensión; no reemplaza la
  promesa. Más sofisticado no es más críptico: si el lector con prisa no sabe
  qué se lleva, el hook no sirve aunque intrigue. El resultado puede ser
  **profesional** («revisar en 5 minutos el informe que te entregó la IA»,
  «saber cuándo firmar lo que hizo la IA»), no solo una función de la app.
- **La IA se nombra en el `Hook`** (regla dura 6): «IA» o la herramienta en el
  título, el subtítulo o el fondo.
- **Reels**: el título va debajo de la tarjeta, como pie de foto, y se lee en
  3 s en ritmo gancho: **≤ 7 palabras, mejor 6**, sin subtítulo. El
  `resultado` (≤ 20 palabras) es la prueba en pantalla: lo que la IA ya
  respondió, tal cual. La promesa entera cabe en título + resultado.
- **Carruseles**: título ≤ 12 palabras (`tituloMaxPalabras`) con la palabra
  clave al inicio; el subtítulo da la promesa si el título es pregunta o dato.
- **Sin relleno ni hype** (`config.json → puerta.relleno`: «increíble», «muy»,
  «brutal»…), sin clickbait («no vas a creer»), sin jerga sin explicar
  («agente», «token», «API»).
- **Score léxico**: el titular suma si trae pregunta, número o tensión («no»,
  «sin», «error», «nunca»). Los patrones de abajo casi siempre la traen; si tu
  favorito no, pierde esos 5 puntos del hook (no lo bloquea solo).

## Cómo escribir los candidatos

1. Escribe el hook **al final**, cuando ya tienes el cuerpo y sabes qué enseña
   la pieza y qué no sabía el lector (pregunta 8 del lector frío).
2. Escribe **8 a 10 candidatos** de **al menos 3 patrones distintos** (los de
   abajo). No son 8 variantes de la misma frase: cada uno prueba otra entrada
   al mismo contenido.
3. Cada candidato es la **portada completa** que vería el lector:
   - carrusel: `title` y, si lo usa, `subtitle`;
   - reel: `title` y `resultado` (sin `subtitle`);
   - reel con portada `Clip`: solo `title` (el video es el resultado).
4. Todos cumplen las reglas de arriba: si ganara cualquiera, se publicaría tal
   cual. No metas un candidato «de relleno» que no publicarías.
5. Guárdalos en `plan.json → hook.candidatos` como
   `{ "patron": "<id>", "title": "…", "subtitle": "…", "resultado": "…" }`
   (`patron` es uno de los ids de los encabezados de abajo) y corre
   `--juez`. El juez ve solo la lista numerada, sin patrón, tema ni
   entregable.
6. Con su respuesta: `hook.juez = { "elegido": n, "nota": x, "respuestas":
   "<su JSON tal cual>" }`, `hook.score = nota`, `hook.texto` = el `title` del
   candidato `n` (contando desde 1) y el `Hook` del borrador lleva **ese**
   `title`, `subtitle` y `resultado`, letra por letra. El validador los
   compara.

Si el juez no le da 8 o más a ninguno, escribe **una ronda más** de 8 a 10
candidatos nuevos con lo que aprendiste de sus respuestas (qué no paró el
pulgar, qué creyó que se llevaba). Esa ronda cuenta como una vuelta de
`reescriturasMax`. Si tampoco pasa, la pieza se quita y queda el hueco, como
con el lector frío.

Lee las respuestas aunque gane uno: si en «¿qué crees que te llevas?» el juez
describe algo que la pieza no da, el hook promete de más. Corrígelo antes del
lector frío (con otra ronda del juez si cambias la portada).

## en-juego: lo que está en juego en tu trabajo

Nombra lo que el lector gana o arriesga en su trabajo (su lugar en el equipo,
el juicio de su jefe, su tiempo) y deja que la IA sea el cómo.

- **Mal:** «¿Sin equipo? ChatGPT critica tu idea» (lun 2026-10-19). Habla de
  alguien sin equipo, que no es este público, y «critica tu idea» no dice qué
  te juegas.
- **Bien:** «Que ChatGPT critique antes que tu jefe» + resultado «Desde
  ventas, 3 puntos: 1 precio, 2 cliente, 3 canal.» Lo que está en juego es el
  jefe que va a revisar la propuesta; la tarjeta muestra la crítica ya hecha,
  desde el área que te falta.

Trampa: inflar lo que está en juego hasta el alarmismo («o te quedas sin
trabajo»). Lo que está en juego es concreto y cotidiano: una reunión, un informe,
una revisión.

## error-comun: el error que comete la mayoría

Nombra un error que el lector probablemente comete hoy con la IA y promete
cómo evitarlo. Funciona porque el lector se revisa a sí mismo. Si dices «la
mayoría», la referencia tiene que respaldarlo; si no, nombra el error sin
contarlo.

- **Mal:** «6 preguntas para que la IA haga lo que pides» (mar 2026-10-20).
  Lista útil, pero no dice qué falla hoy; parece un manual.
- **Bien:** «El error al encargarle trabajo a la IA» + subtítulo «Las 6
  preguntas de un buen jefe, en una plantilla para copiar». El lector se
  pregunta si lo comete; el subtítulo dice qué se lleva. El dato de la pieza
  lo sostiene, con su alcance: en unas 400.000 sesiones de programación con
  su IA, Anthropic midió 15 % de tareas logradas en principiantes y 28 % en
  quienes daban instrucciones precisas. Es un estudio de programación: la pieza
  lo dice.

Trampa: un error que nadie comete o que un usuario frecuente ya corrigió
(«no le hablas por favor a ChatGPT»). Tiene que ser de alguien que ya usa IA
todos los días.

## dato-contrario: el dato que contradice lo que crees

Un dato de una referencia que choca con lo que el lector da por hecho. Es el
patrón que mejor cumple la prueba de novedad (pregunta 8): el lector no lo
sabía. El dato va con su alcance en la escena o slide siguiente (quién lo
midió, a quiénes).

- **Mal:** «¿Cuánto tiempo te ahorra la IA? 3 estudios» (vie 2026-10-23).
  Pregunta genérica + número: no dice qué descubrieron los estudios.
- **Bien:** «Creían ir 20 % más rápido. Iban 19 % más lentos» + subtítulo
  «Con IA: qué midieron 3 estudios y cómo medir lo tuyo». El choque está en
  el título; la slide del dato aclara que eran 16 programadores expertos con
  cronómetro (METR, 2025), para no estirar el dato a todo el mundo.

Trampa: el dato contrario sin su alcance es una media verdad. Si el estudio es
chico, de otro oficio o de otro año, la pieza lo dice.

## antes-despues: antes y después

Muestra el cambio: cómo está hoy el lector y cómo queda con la IA. En reels,
el «después» es la tarjeta de `resultado`.

- **Mal:** «¿Pagar por ordenar 117 correos? No, gratis» (mie 2026-10-21). El
  gancho es el precio, y este público ya paga.
- **Bien:** «Claude: de no leídos a 2 urgentes» + resultado «Hoy: 2
  urgentes, 9 informativos, el resto a ignorar. Respuestas listas, sin
  enviar.» El antes es su bandeja sin leer; el después, lo que la tarjeta
  muestra que Claude ordenó. No uses el promedio de Microsoft (117 correos al
  día) como si fuera esa bandeja: el antes y el después son los de la
  pantalla; el 117, si entra, va en otra escena con su fuente.

Trampa: un «después» que la referencia no respalda (horas ahorradas que nadie
midió). Si no hay dato del después, muéstralo en pantalla en vez de contarlo.

## pregunta-del-jefe: la pregunta que te va a hacer tu jefe o tu equipo

Pone en el título la pregunta que el lector va a tener que responder en el
trabajo, y promete la respuesta. Conecta con el susto de no tener argumentos
cuando el tema sale en la reunión.

- **Mal:** «¿Cuánto tiempo te ahorra la IA? 3 estudios» (vie 2026-10-23). La
  pregunta es de curioso, no de alguien a quien se la van a hacer.
- **Bien:** «“¿Cuánto nos ahorra la IA?”: qué responderle a tu jefe» +
  subtítulo «3 estudios, lo que miden y cómo medirlo en tu equipo». La
  pregunta es la del jefe; la promesa es tener una respuesta con datos.

Trampa: la pregunta de un jefe caricatura («¿por qué no usas IA?»). Tiene que
ser una que de verdad se hace en una reunión.

## resultado: el resultado de trabajo, dicho directo

`[resultado] + [con qué]`, sin rodeo. Es el patrón más claro y el que menos
engancha solo; gana cuando el resultado es de trabajo y concreto. Siempre
escribe uno de este patrón: es el punto de comparación del juez.

- **Mal:** «¿ChatGPT trabaja sin ti? 3 tareas gratis» (sáb 2026-10-24). La
  función de la app («tareas programadas») y el precio, no el trabajo que
  queda hecho.
- **Bien:** «ChatGPT te resume tu área cada mañana» + resultado «Tarea de hoy
  lista: el resumen de noticias de tu área.» El lector ve el trabajo que le
  llega hecho, sin pedirlo cada día.
- **Bien (criterio):** «Cuándo revisar a la IA: 1 regla». Lo que se lleva es
  una regla de criterio, no una función.

Trampa: el resultado de primer día («ChatGPT te resume un PDF»). Si un usuario
frecuente ya lo hace, el juez no para el pulgar y el lector frío responde
«nada nuevo».

## Ejemplo: los candidatos de una pieza

El reel de criterio sobre el estudio de Harvard y BCG (758 consultores; con
IA, 25 % más rápido en 18 tareas y 19 puntos menos de aciertos en una tarea
fuera de lo que la IA hace bien). Todos con la misma tarjeta: resultado
«Seguro: la respuesta es la B. (Era la C.)», app `GPT-4`.

| # | Patrón | Título |
|---|---|---|
| 1 | `resultado` | Cuándo revisar a la IA: 1 regla |
| 2 | `en-juego` | Lo hizo la IA, lo firmas tú |
| 3 | `dato-contrario` | La IA no siempre ayuda: cuándo revisar |
| 4 | `pregunta-del-jefe` | «¿Revisaste lo que hizo la IA?» |
| 5 | `error-comun` | El error: creerle igual a la IA |
| 6 | `dato-contrario` | Más rápido con IA, hasta esta tarea |
| 7 | `en-juego` | Tu equipo usa IA: qué revisar |
| 8 | `dato-contrario` | Con IA acertaron menos. ¿Dónde? |

Lo que gana suele juntar tensión y promesa: el 3 dice qué pasó, con su alcance
(no siempre ayuda: en una de las tareas les fue peor), y qué te llevas (cuándo
revisar). Un título como «Con IA, más errores» generalizaría un resultado de
una sola tarea: el estudio midió mejoras en 18. El 2 engancha pero no dice qué te llevas; el 1
es claro pero plano. Así se ve el resultado en `plan.json` (los demás
candidatos, abreviados aquí; en el plan van los 8 completos):

```json
"hook": {
  "categoria": "controversia",
  "texto": "La IA no siempre ayuda: cuándo revisar",
  "score": 9,
  "candidatos": [
    { "patron": "resultado", "title": "Cuándo revisar a la IA: 1 regla", "resultado": "Seguro: la respuesta es la B. (Era la C.)" },
    { "patron": "en-juego", "title": "Lo hizo la IA, lo firmas tú", "resultado": "Seguro: la respuesta es la B. (Era la C.)" },
    { "patron": "dato-contrario", "title": "La IA no siempre ayuda: cuándo revisar", "resultado": "Seguro: la respuesta es la B. (Era la C.)" }
  ],
  "juez": { "elegido": 3, "nota": 9, "respuestas": "{\"elegido\": 3, \"nota\": 9, \"porCandidato\": {\"1\": {\"pulgar\": \"no\", \"importa\": \"sí\", \"teLlevas\": \"una regla para revisar\"}}}" }
}
```

## Para el juez

Eres el juez de los hooks de una cuenta de Instagram sobre IA aplicada al trabajo. Tu lector es un profesional con cargo medio (jefe de área, coordinador, gerente de primera línea), no programador, que ya paga Claude o ChatGPT y lo usa en el trabajo. Tiene algo de susto de que la IA afecte su trabajo (quedarse atrás frente a colegas que la usan mejor, o que su rol de coordinar y revisar pierda valor) y le interesa el liderazgo en la era de la IA. Le importa el criterio, no las funciones. «Gratis» no lo detiene. Le sirven los datos y algo que hacer; el alarmismo no.

Verás una lista numerada de candidatos de hook (título, a veces subtítulo y resultado en pantalla). No sabes de dónde salieron ni qué patrón siguen. Para CADA candidato responde tres preguntas, como ese lector yendo con el pulgar por el feed:

1. ¿Pararías el pulgar?
2. ¿Te importa para tu trabajo?
3. ¿Qué crees que te llevas?

Luego elige el mejor y ponle una nota de 0 a 10 (un hook que no pararía el pulgar de ese lector no pasa de 7).

Responde SOLO con JSON, sin texto antes ni después ni cercos de código:

{ "elegido": n, "nota": 0-10, "porCandidato": { "1": { "pulgar": "sí|no", "importa": "sí|no", "teLlevas": "…" } } }

`elegido` es el número del candidato tal como aparece en la lista (el primero es 1, no 0); se guarda tal cual en `hook.juez.elegido`. No abras ni busques ningún archivo.
