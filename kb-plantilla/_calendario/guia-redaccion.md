# Guía de redacción

Para el planificador (Paso 5 de `INSTRUCCIONES.md`). Es **obligatoria**: la
aplicas a cada pieza después de escribir el cuerpo y antes del hook y del
lector frío, y terminas con la lista de chequeo del final.

## Por qué hay guía

Las personas del público entrevistadas dijeron que el contenido es demasiado
básico y que muchas veces no se entiende o no explica lo suficiente. La
revisión de la semana del 2026-10-19 mostró por qué: topes de 5 palabras por
escena y reels de 20 s produjeron frases como «Lo midió Microsoft.», «En 18
tareas, acertó.» o «Uno con IA rinde como dos». Se perdían el por qué y el
cómo, y la voz a menudo repetía el título. Desde el 2026-10-26 los reels
llegan a 35 s y el cuerpo de los carruseles a 50 palabras: el espacio nuevo es
para explicar, no para decir más cosas.

## A quién le escribes

Desde el 2026-11-02 (pivote a vitrina de coaching): un profesional de cargo
medio (jefe de área, coordinador, gerente de primera línea), no programador,
que **nunca ha usado IA más allá de una pregunta suelta y no sabe por dónde
partir**. No sabe qué es un agente ni qué pedirle a la IA. Le escribes en
primera persona, como alguien que ya dio ese paso y le cuenta cómo: directo,
con tuteo, en español neutro (sin voseo ni «vosotros», sin modismos), sin
jerga sin explicar y sin exagerar.

> Nota histórica (2026-10-26 a 2026-11-01, ya no rige): el lector «ya paga
> Claude o ChatGPT» y le faltaba criterio, no el primer paso. Los ejemplos de
> esta guía con datos de estudios siguen sirviendo para la forma (idea
> completa, números con contexto, voz que explica); el lector es el de arriba.

## Desde 2026-11-02: primera persona, nivel cero y cierre PARTIR

Fuente: `informes/foresight-instagram-2026-10-28.md` (en el repo de código).
Donde esta sección choque con el resto de la guía, manda esta.

- **Primera persona singular** en pantalla y en la voz: «yo partí por aquí»,
  «a mí me pasó», «armé un sistema que…». El lector ve a alguien como él dar
  el paso, no a un experto que le dice qué hacer.
  - **Mal:** «Sube tus informes a Gemini Notebook y ahorra horas.»
  - **Bien:** «Primero creé un cuaderno nuevo y subí ahí los seis informes en
    PDF.»
- **Nivel cero sin jerga:** un término técnico como máximo en toda la pieza, y
  explicado en la misma escena con palabras de oficina.
  - **Mal:** «Un agente orquesta tus tareas con herramientas.»
  - **Bien:** «Un agente es una IA que hace tareas sola, paso a paso.»
- **Quitar el miedo, no vender herramientas.** Cada pieza termina con un
  primer paso que el lector puede dar hoy; la idea central es «pregúntale a la
  IA cómo ayudarte».
- **`lo-que-construi`:** el «resultado» de la regla dura 8 es lo que se
  aprendió construyendo el sistema, con el número honesto (también lo que no
  funcionó: 27 piezas, 1 guardado).
- **Cierre PARTIR (regla dura 11):** el `Cta` y el caption piden «escríbeme
  PARTIR» y dicen qué recibe quien escribe. Texto base: «Escríbeme PARTIR y te
  cuento por dónde empezar en tu caso». La voz del `Cta` pide lo mismo con
  palabras habladas («¿No sabes cuál sería tu primera tarea? Escríbeme y te
  cuento.»).

**Lo que ya no va:** listas de herramientas, «10 prompts», el truco de la
semana, la voz de experto («ya sabes pedir un resumen»: este lector no lo
sabe), los cierres «Guárdalo» o «Mándaselo» (la señal de toda pieza es `dm`) y
los temas que no responden «¿por dónde parto con la IA en mi trabajo?».

## 1. Cada escena es una idea completa

Cada escena del reel y cada slide del carrusel dice **quién o qué**, **hace
qué** y **por qué importa o qué cambia**. Se juzga **pantalla y voz juntas**:
en un reel, el texto en pantalla puede ser un rótulo corto («En 18 tareas: 25 %
más rápido») si la voz de esa escena trae el sujeto, el verbo y la
consecuencia. En un carrusel no hay voz: el título puede ser rótulo si el
cuerpo o los bullets completan la idea. Prohibidas las escenas donde ni la
pantalla ni la voz completan la idea: un rótulo sin voz que lo explique
(«Dónde acierta: tareas conocidas» con «En 18 tareas, acertó.») o una frase con
verbo pero sin consecuencia («En 18 tareas, acertó.»).

- **Mal:** en pantalla «Dónde acierta: tareas conocidas», voz «En 18 tareas,
  acertó.» (jue 2026-10-22). ¿Quién acertó? ¿En qué? ¿Y qué ganaron?
- **Bien:** en pantalla «En 18 tareas: 25 % más rápido», voz «En 18 tareas
  reales de consultoría, con IA fueron 25 % más rápidos y con más calidad.»

- **Mal:** en pantalla «Uno con IA rinde como dos», voz «Lo probaron en una
  gran empresa.» (lun 2026-10-19). «Rinde como dos» no dice comparado con qué,
  y la voz esconde el dato.
- **Bien:** en pantalla «Una persona con IA rindió como una pareja», voz
  «Procter & Gamble lo probó con 776 profesionales: una persona sola con IA
  igualó a una pareja sin IA.»

## 2. Los números llevan contexto

Un número solo no enseña nada. Dice **quién lo midió, a cuántos y comparado con
qué**, y si es lo que la gente declara o lo que se midió. El contexto cabe en
la voz, en el `context` del `Stat` o en el cuerpo del carrusel.

- **Mal:** «758 consultores lo probaron» (jue 2026-10-22). ¿Probaron qué? ¿Qué
  pasó?
- **Bien:** en pantalla «758 consultores, con y sin IA», voz «Harvard y BCG
  los midieron con y sin GPT-4, en las mismas tareas.»

- **Mal:** en pantalla «117 correos al día», voz «Lo midió Microsoft.» (mie
  2026-10-21).
- **Bien:** en pantalla «117 correos al día por persona», voz «Microsoft lo
  contó en usuarios de Microsoft 365, en 2025, junto con 153 mensajes de Teams
  al día.»

Lo que ya estaba bien (vie 2026-10-23): el `Stat` «2,2 horas» con el contexto
«Encuesta en Estados Unidos a quienes usan IA en el trabajo. Es lo que cada
persona declara, no un reloj.» Así se escribe un número.

**No estires el dato.** Si el estudio midió una tarea «elegida para quedar
fuera de lo que la IA hace bien», no escribas «falla en tareas nuevas»: es
otra afirmación, y la regla dura 5 vale para cada frase.

- **Mal:** «Dónde falla: tareas nuevas, con seguridad» (jue 2026-10-22).
- **Bien:** «En otra igual de difícil: 19 puntos menos», voz «En otra, fuera de
  lo que la IA hace bien, le creyeron y acertaron menos.»

## 3. La voz explica, no lee

En reels, la `narracion` nunca repite el título de la escena: da el detalle, el
porqué o el ejemplo que no cabe en pantalla. Si la borras y la escena se
entiende igual, la voz no estaba haciendo su trabajo.

- **Mal:** en pantalla «Escribe de qué área eres», voz «Dile de qué área
  vienes.» (lun 2026-10-19). Dice lo mismo con otras palabras.
- **Bien:** misma pantalla, voz «Si le dices que vienes de producción, te
  critica desde lo que no ves: precio, cliente y canal.»

- **Mal:** título del `Hook` «¿Pagar por ordenar 117 correos? No, gratis»,
  voz «Tu correo ordenado, gratis.» (mie 2026-10-21). Repite la promesa.
- **Bien:** voz «Claude te separa lo urgente y te deja las respuestas
  escritas, sin enviar. Si vives en el correo, mira.» La voz agrega qué hace y
  a quién le sirve.

## 4. La prueba del «¿y?»

Lee cada escena y pregúntate «¿y?». Si alguien puede preguntarlo, falta la
consecuencia: qué cambia para su trabajo, qué decide distinto, qué evita.

- **Mal:** «En una distinta, falló segura.» (jue 2026-10-22). ¿Y?
- **Bien:** «En otra, fuera de lo que la IA hace bien, le creyeron y acertaron
  menos.» La consecuencia es de ellos: confiar sin revisar les bajó los
  aciertos.

- **Mal:** en pantalla «Pídele 3 puntos, no opiniones», voz «Puntos
  concretos, no opiniones.» (lun 2026-10-19). ¿Y?
- **Bien:** voz «Con tres puntos concretos sabes qué corregir; con una opinión
  general, no.»

## 5. Enseña algo que no sabía

El lector frío responde «¿Qué aprendiste que no sabías?» (pregunta 8); «nada
nuevo» bloquea. Antes de escribir, nombra en una línea lo que un usuario
frecuente de ChatGPT o Claude **no sabe** de este tema (desde el 2026-11-02:
lo que no sabe alguien que nunca ha usado IA más allá de una pregunta suelta): un límite, un error
común, el matiz de un estudio, una forma de pedir que cambia el resultado.
Sale de la referencia («Lo que no sabe un usuario frecuente», «Límites»,
«Evidencia», «Novedades»), con su cita. Esa línea es el centro de la pieza, no
un dato al pasar.

- **Mal:** «La IA a veces se equivoca: revisa lo que te entrega.» Ya lo sabe.
- **Bien:** «Con IA fueron 25 % más rápidos en 18 tareas, y en otra igual de
  difícil acertaron menos. El estudio no da una lista de tareas seguras: si no
  la viste acertar en esa tarea, revísala entera.» Lo nuevo es que la falla no
  avisa (la tarea parece igual de fácil) y que no hay lista.

## 6. Sin jerga, sin hype, sin alarmismo

- **Jerga:** «agente», «token», «API», «modelo», «frontera irregular» se
  explican en la misma escena con palabras de oficina o se cambian («una IA que
  hace tareas sola», «lo que la IA hace bien»). Las siglas fuera de
  `siglasPermitidas` son error.
- **Hype:** nada de las palabras de `puerta.relleno` («increíble», «brutal»,
  «muy»…) ni promesas vacías («te cambia la vida»). Lo concreto convence más.
- **Alarmismo:** el susto de este público es real (quedarse atrás, que su rol
  pierda valor) y se trata con un dato y algo que hacer.
  - **Mal:** «La IA te va a dejar atrás» (ejemplo inventado para mostrar el
    error).
  - **Bien:** «Revisar lo que hace la IA es la habilidad que más pesa», con el
    contexto «Microsoft preguntó a 20.000 trabajadores que usan IA: control de
    calidad, 50 %; pensamiento crítico, 46 %.»

## 7. Cuánto cabe

**Reels (tope de 35 s, ritmo gancho).** El hook no cambia: título ≤ 7 palabras
y la promesa completa en 3 s. El espacio extra es para el medio:

- 5 a 6 escenas. El texto en pantalla sigue corto (≤ 10 palabras por escena
  del medio); lo que crece es la voz.
- Voz: 12 a 16 palabras por escena (tope duro 24), unas **80 palabras en
  total**, dan ~33–34 s. Cada palabra de voz suma ~0,35 s.
- Usa el espacio para una escena de **contexto** (quién lo midió) y una de
  **matiz o límite** (lo que no sabía), no para más pasos.
- Score léxico: la rúbrica de reel da 2 puntos por 20 a 90 palabras de voz (cabe
  el tope de 35 s). Con unas 80 palabras no pierdes nada; pasar de 90 cuesta
  esos 2 puntos y no cabe en 35 s.

**Carruseles (cuerpo ≤ 50 palabras).** `body`, `text`, `subtitle`, `reason`,
`context` y `note` llegan a `cuerpoMaxPalabrasCarrusel` (50); títulos y bullets
siguen en 12. `myth` y `reality` no son cuerpo: se dibujan como titular en
mayúscula y van en ≤ 14 palabras cada uno (ver «Mito contra realidad»). Son la pieza densa de la semana: el
porqué, el matiz del estudio, un ejemplo de trabajo.

- **Mal:** «Preguntas 1 y 2: objetivo y límites» con bullets «¿Qué quieres y
  para qué?» y «¿Hasta dónde puede decidir sola?» (mar 2026-10-20). Las
  preguntas, sin por qué hacerlas.
- **Bien:** mismo título y bullets, más `body`: «Es el encargo que propone
  Ethan Mollick (Wharton): lo mismo que le pedirías a alguien nuevo del
  equipo. Qué quieres y para qué, y qué puede decidir sin preguntarte.»

## 8. Mito contra realidad: una creencia contra un dato

`MythReality` enfrenta lo que la gente cree con el dato que lo desmiente, y
dibuja los dos como titular en mayúscula (≤ 14 palabras cada uno). No sirve para
«lo que pides contra lo que sale»: el pedido sale tachado, como si pedir fuera
el error.

- **Mal:** `myth` con el pedido a la IA y `reality` con 26 palabras de lo que
  sale (mar 2026-10-27, «tu correo en tres líneas»). El pedido salió tachado y
  la «realidad» era un bloque en mayúscula: no se entendía qué era lo falso.
- **Bien:** dos `Screen`: «Escribe un correo sobre el cambio de turnos» con su
  respuesta vaga, y después el pedido con quién eres, para qué y el estilo, con
  su respuesta. El lector ve la diferencia sin que se la expliques.
- **Bien (mito):** `myth` «Hay que saber editar audio», `reality` «NotebookLM lo
  arma solo».

## 9. El ejemplo va en su propia línea

Cuando un cuerpo trae un ejemplo entre «» (lo que se le escribe a la IA, una
frase de muestra) y después su explicación, el ejemplo va primero y en su
propia línea: el motor separa en su párrafo la cita «…» del inicio, y un `\n`
explícito también parte el párrafo.

- **Mal:** «Soy jefa de operaciones; el correo va a mis 12 supervisores.» y la
  explicación en el mismo bloque, sin aire (mar 2026-10-27).
- **Bien:** `body`: «Soy jefa de operaciones; el correo va a mis 12
  supervisores.»`\n`La IA no conoce tu equipo: sin esto escribe para cualquiera.

## 10. Lo que la IA responde en pantalla se podría enviar tal cual

La `respuesta` de un `Screen` es la prueba de la pieza: el lector se pregunta
si él la mandaría. Tiene que ser algo que un profesional de cargo medio enviaría
sin tocar.

- Si es un correo: asunto claro y concreto, saludo, cuerpo y cierre, con un `\n`
  entre las partes. Un solo `\n`, sin líneas en blanco (`\n\n`): cada línea
  vacía ocupa alto y, con el `prompt` y el `heading`, el `Screen` del post ya no
  cabe sobre la fuente al pie. Respeta los topes de la regla 10 (`prompt` ≤ 30
  palabras, `respuesta` ≤ 45).
- Nada de «ojo», muletillas ni jerga juvenil; tono de trabajo, cordial y directo.
- **Mal:** «Asunto: ojo, cambian los turnos» en un solo bloque (mar 2026-10-27).
- **Bien:** «Asunto: Rotación de turnos desde el lunes`\n`Hola, equipo:`\n`Desde
  el lunes los turnos rotan cada dos semanas.`\n`Gracias,`\n`Paula».

## Pieza completa: antes y después

El reel «¿Cuándo no confiar en la IA? 1 regla» (jue 2026-10-22), reescrito
como pieza de la serie `criterio` (serie retirada el 2026-11-02: el ejemplo
sirve para la forma de cada escena, no para la serie ni la voz, que desde el
pivote va en primera persona). Mismos hechos (referencia
`estudio-de-la-frontera-irregular.md`), otra redacción.

| Escena | Antes (en pantalla / voz) | Después (en pantalla / voz) |
|---|---|---|
| `Hook` | «¿Cuándo no confiar en la IA? 1 regla» / «Contestó segura y estaba mal. Una regla.» | «La IA no siempre ayuda: cuándo revisar» / «En una de las tareas, con IA acertaron menos. Si tu equipo usa IA, te sirve.» |
| `Lead` | «758 consultores lo probaron» / «Con IA iban más rápido, hasta que…» | «758 consultores, con y sin IA» / «Harvard y BCG los midieron con y sin GPT-4, en las mismas tareas.» |
| `Step` 1 | «Dónde acierta: tareas conocidas» / «En 18 tareas, acertó.» | «En 18 tareas: 25 % más rápido» / «En 18 tareas reales de consultoría, con IA fueron 25 % más rápidos y con más calidad.» |
| `Step` 2 | «Dónde falla: tareas nuevas, con seguridad» / «En una distinta, falló segura.» | «En otra igual de difícil: 19 puntos menos» / «En otra, fuera de lo que la IA hace bien, le creyeron y acertaron menos.» |
| `Step` 3 | «La regla: revísala como a alguien nuevo» / «Tarea nueva: revisa su trabajo.» | «La regla: ¿ya la viste acertar en esto?» / «No hay lista de tareas seguras: si no la viste acertar en esa, revísala entera.» |
| `Cta` | «Guárdala antes de delegar» / «Guarda la regla para tu próximo informe.» | «Mándaselo a quien firma sin revisar» / «Mándaselo a quien firma sin revisar lo de la IA.» |

El después dura ~34,5 s con 86 palabras de voz (el antes, ~20 s con 35) y pasa
el validador con la puerta de la plantilla. Qué cambió: el título dice el
alcance (no siempre ayuda; no «con IA, más errores», que generalizaría una
sola tarea); cada escena tiene sujeto, verbo y consecuencia; los números dicen
quién y comparado con qué; «tareas nuevas» volvió a lo que el estudio midió;
la voz nunca lee el título; y lo nuevo para el lector (no hay lista de tareas
seguras) es la regla, no una nota al pie.

## Lista de chequeo

Antes del hook y del lector frío, pasa cada pieza por esto. Si un punto falla,
reescribe la escena; no lo dejes para el lector.

1. **Lo nuevo**: puedo decir en una línea qué no sabía alguien que nunca ha
   usado IA más allá de una pregunta suelta, y sale de la referencia con cita
   (en `lo-que-construi`, de lo que pasó al construir).
2. **Idea completa**: en cada escena, pantalla y voz juntas (en carrusel,
   título y cuerpo juntos) dicen quién o qué, hace qué y por qué importa. La
   pantalla puede ser un rótulo si la voz trae sujeto, verbo y consecuencia.
3. **«¿Y?»**: ninguna escena deja preguntar «¿y?».
4. **Números**: cada cifra dice quién la midió, a cuántos y comparado con qué,
   y no dice más que la referencia.
5. **Voz** (reels): ninguna `narracion` repite su título; cada una agrega el
   detalle o el porqué.
6. **Lenguaje**: tuteo, español neutro, sin jerga sin explicar, sin palabras de
   `puerta.relleno`, sin alarmismo.
7. **Espacio**: reel ≤ 35 s con el hook en ≤ 7 palabras; el espacio extra se
   fue a contexto y matiz, no a más pasos. Carrusel: el cuerpo explica el
   porqué y el matiz.
8. **Entregable**: al final, el lector tiene un primer paso que dar en su
   trabajo esta semana, y el cierre le pide «escríbeme PARTIR».
9. **Mito contra realidad**: `MythReality` solo enfrenta una creencia con un
   dato (≤ 14 palabras cada uno); el antes y después de un pedido va con dos
   `Screen`.
10. **Ejemplos**: el ejemplo entre «» va en su propia línea, antes de su
    explicación.
11. **Respuesta en pantalla**: la `respuesta` del `Screen` se podría enviar tal
    cual (asunto concreto, saludo, un `\n` entre asunto, cuerpo y cierre, sin
    líneas en blanco; sin «ojo» ni muletillas).
12. **Primera persona**: la pieza la cuenta quien la vivió («yo partí», «armé»),
    con un término técnico como máximo, explicado.
