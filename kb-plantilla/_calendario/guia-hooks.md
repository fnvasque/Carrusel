# Guía de hooks

Para el planificador (Paso 5 de `INSTRUCCIONES.md`). El hook es la portada: el
título y el subtítulo del `Hook` (en reels hasta el 2026-11-01, también el
`resultado` que se veía en el primer cuadro; desde el 2026-11-02 la portada del
reel va sin tarjeta y la IA se ve en la escena 2). Decide si alguien se queda. Esta guía te dice qué le importa al
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

Desde el 2026-11-02 (pivote a vitrina de coaching): un profesional de cargo
medio (jefe de área, coordinador, gerente de primera línea), no programador,
que **nunca ha usado IA más allá de una pregunta suelta y no sabe por dónde
partir**. No sabe qué es un agente ni qué pedirle a la IA, y le da algo de
miedo quedarse atrás en su trabajo. Lo que lo hace avanzar no es una función
nueva: es ver a alguien como él dar el primer paso y saber cuál sería el suyo.

> Nota histórica (2026-10-26 a 2026-11-01, ya no rige): el lector era un
> profesional que «ya paga Claude o ChatGPT» y buscaba criterio. Ese perfil
> dejó de valer con el pivote; si una frase de abajo lo supone, manda esta
> sección y la siguiente.

## Desde 2026-11-02: primera persona y nivel cero

Fuente: `informes/foresight-instagram-2026-10-28.md` (en el repo de código).
Donde esta sección choque con el resto de la guía, manda esta.

- **La portada le habla al lector; el cuerpo va en primera persona** (desde el
  2026-10-31). El título nombra la situación o el resultado **del lector**
  («tu informe al jefe», «tu primera tarea con IA»), en «tú» o impersonal, y
  la IA que lo hace; «te muestro» vale. Desde la escena 2 habla quien ya dio
  el paso: «le pedí», «pegué mis notas», «armé». Nunca una confesión sin
  resultado en el título («Nunca supe qué pedirle a la IA», «Corregía a la IA
  en cada chat»): el lector con prisa ve solo el título y no sabe qué gana. Ni
  «tú deberías» ni la voz de experto que enseña desde arriba.
- **La promesa va en el título, no en el subtítulo.** El lector con prisa
  (pregunta 7 del lector frío) y la pregunta 3 del juez miran solo el título:
  tiene que decir **qué consigues y con qué IA**. El subtítulo amplía (cómo,
  cuánto), no carga la promesa. Y promete solo lo que la pieza muestra: si
  muestra un truco, no prometas «todo lo que la IA puede hacer por ti».
- **Nivel cero.** Como máximo **un** término técnico en la portada, y la pieza
  lo explica. Si el hook necesita saber qué es un agente, un prompt o una API,
  reescríbelo.
- **Quitar el miedo, no vender herramientas.** La idea central de la cuenta es
  «pregúntale a la IA cómo ayudarte»: el primer paso es pequeño y se puede dar
  hoy.
- **Por serie:** en `por-donde-partir` el hook nombra el primer paso concreto
  y lo que el lector consigue con él; en `lo-que-construi` la pieza cuenta una
  decisión o un error real del sistema que arma esta cuenta, con su número
  honesto, pero la portada promete la lección **para el trabajo del lector**,
  no la historia del sistema.
- **La regla dura 8 sigue:** el título dice qué te llevas y con qué IA.

Hooks de ejemplo (reels publicados el 2026-10-31 y el 2026-11-01; título
≤ 7 palabras, título + subtítulo ≤ 12):

- «ChatGPT elige tu primera tarea con IA» + «Solo responde 3 preguntas»
  (`por-donde-partir`: le pides a ChatGPT que te haga 3 preguntas y te dice
  por dónde partir).
- «Informe al jefe: ChatGPT ordena tus notas» + «En logros, trabas y pedidos»
  (`por-donde-partir`: pegas tus notas de la semana y ChatGPT las ordena).

Y los que el usuario rechazó el 2026-10-30 aunque el juez les dio 8:

- **Mal:** «Nunca supe qué pedirle a la IA» + «Así partí: que me preguntara».
  Es mi confesión, no tu promesa: solo con el título no sabes qué ganas.
- **Mal:** «“¿Cómo va tu área?” Informe listo» + «Mis notas, ordenadas por
  ChatGPT». «Informe listo» no dice qué informe ni con qué: la promesa quedó en
  el subtítulo.

**Lo que ya no va:**

- Listas de herramientas («5 IAs para…»), «10 prompts», el truco de la semana.
- Hooks que dan por sentado que el lector ya usa ChatGPT o Claude a diario, o
  que paga por ellos.
- Temas sueltos que no responden «¿por dónde parto con la IA en mi trabajo?»
  (finanzas, psicología, storytelling por sí solos).
- El susto sin salida («te van a reemplazar»).

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
- **Reels**: título **≤ 7 palabras, mejor 6**. Con voz (ritmo gancho, hook de
  3 s) va sin subtítulo; sin voz (`config.voz` false, ritmo ensenar, hook de
  5 s) el subtítulo amplía la promesa y título + subtítulo suman ≤ 12
  palabras. Desde el 2026-11-02 la portada del reel va sin tarjeta
  de `resultado` (si viene, no se pinta en el reel): la prueba en pantalla es
  la `Screen` de la escena 2, con lo que la IA respondió, tal cual.
- **Portada pregunta-respuesta** (desde el 2026-11-02): «¿problema del
  lector? salida». El título abre con la pregunta que se hace quien no sabe y
  cierra con lo que hace, y lleva hasta **14 palabras** (tope propio del
  validador, solo para `title` del `Hook` con la forma «¿…? …»). Va **sin
  subtítulo**: la respuesta ya es la promesa.
  - **Bien:** «¿No sabes qué pedirle a la IA? Haz que te pregunte a ti».
  - **Mal:** «ChatGPT elige tu primera tarea con IA» + subtítulo «Solo responde 3
    preguntas»: el con prisa lee el título y no se reconoce en él.
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
   - reel: `title` y, si lo usa, `subtitle` (el `resultado` ya no se pinta en
     el reel y el juez no lo ve; igual va en el candidato porque el post sí lo
     muestra);
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

Si la nota del juez queda bajo `puerta.hookUmbral`, escribe **una ronda más** de 8 a 10
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

Un ejemplo de la semana 2026-10-26 (antes del pivote: la forma de los
candidatos y del juez no cambia; la voz y el lector sí, ver «Desde
2026-11-02»). El reel de criterio sobre el estudio de Harvard y BCG (758 consultores; con
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
una sola tarea: el estudio midió mejoras en 18. El 2 engancha pero no dice qué
te llevas; el 1 es claro pero plano. Así se ve el resultado en `plan.json`
(los demás candidatos, abreviados aquí; en el plan van los 8 completos):

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

Eres el juez de los hooks de una cuenta de Instagram sobre IA aplicada al trabajo. Tu lector es un profesional de cargo medio (jefe de área, coordinador, gerente de primera línea), no programador, que nunca ha usado IA más allá de una pregunta suelta y no sabe por dónde partir. No sabe qué es un agente ni qué pedirle a la IA, y le da algo de miedo quedarse atrás en su trabajo. Le sirve ver un primer paso concreto que puede dar hoy; la jerga, las listas de herramientas y el alarmismo no.

Verás una lista numerada de candidatos de hook: el título y, si lo hay, el subtítulo, tal como se ven en la portada. No sabes de dónde salieron ni qué patrón siguen. Para CADA candidato responde cuatro preguntas, como ese lector yendo con el pulgar por el feed:

1. ¿Pararías el pulgar?
2. ¿Te importa para tu trabajo?
3. Mira **solo el título**, sin el subtítulo: solo con lo que dice, ¿qué consigues y con qué IA? No completes ni supongas lo que no está escrito. Si el título no dice qué consigues, responde exactamente "no sé".
4. Con título y subtítulo, ¿qué crees que te llevas?

Luego elige el mejor y ponle una nota de 0 a 10. No puedes elegir un candidato que no pararía el pulgar ni uno con "no sé" en la pregunta 3. Si ninguno cumple las dos cosas, elige el menos malo y ponle 0.

Responde SOLO con JSON, sin texto antes ni después ni cercos de código:

{ "elegido": n, "nota": 0-10, "porCandidato": { "1": { "pulgar": "sí|no", "importa": "sí|no", "soloTitulo": "…", "teLlevas": "…" } } }

`elegido` es el número del candidato tal como aparece en la lista (el primero es 1, no 0); se guarda tal cual en `hook.juez.elegido`. No abras ni busques ningún archivo.
