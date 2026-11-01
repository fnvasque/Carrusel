# Guía de hooks

Para el planificador (Paso 5 de `INSTRUCCIONES.md`). El hook es la portada que
ve el lector, no el plan privado de la pieza. En reels desde el 2026-11-02,
`resultado` no se pinta en la portada: la demostración aparece en la `Screen`
de la escena 2. Una tarjeta oculta no puede completar un título insuficiente.

Esta guía trata la autoría. La sección final «Para el juez» es el prompt
operativo que copia `--juez`; no le pases la guía completa ni lo cambies al
reescribir una pieza. La memoria editorial está en la spec
`2026-11-01-claridad-editorial-design.md` del repo de código.

## A quién le hablas

Un profesional de cargo medio, no programador, que **nunca ha usado IA más allá
de una pregunta suelta y no sabe por dónde partir**. Le sirve reconocer una
situación de su trabajo y ver un primer paso alcanzable. No supongas uso diario,
planes pagados ni conocimiento de agentes o prompts.

Una tarea elemental puede ser nueva para él. Juzga el interés desde su problema,
no desde lo novedosa que sea la función para alguien experto. Las referencias
históricas a otro perfil no rigen la selección de temas ni ejemplos actuales.

## Promesa, comprensión e interés

- **La portada le habla al lector.** Nombra su situación o el resultado que
  consigue, en «tú» o impersonal, y con qué IA. «Te muestro» sirve cuando llega
  a esa promesa; una confesión sola no la reemplaza.
- **La promesa esencial va en el título.** El subtítulo amplía cómo o el alcance;
  no rescata un título que no explica lo que se lleva. Esto vale para reel y
  carrusel, incluso cuando el título empieza con pregunta o dato.
- **La promesa tiene el alcance de la demostración.** Si se muestran acuerdos,
  no prometas un acta completa; si requiere revisión, di borrador. «Tu tono»
  necesita un ejemplo de estilo comparable, no solo un correo más detallado.
- **Interés y cumplimiento son distintos.** El juez de portada puede observar
  expectativa e interés; el cuerpo debe demostrar lo prometido. Contrasta su
  respuesta con las escenas, aunque le haya puesto una nota alta.
- **Nivel cero.** Máximo un término técnico en la portada, explicado en la
  pieza. No convertir el miedo a quedarse atrás en amenaza ni en presión.
- **Por serie:** `por-donde-partir` ofrece un paso de trabajo concreto;
  `lo-que-construi` anticipa una lección útil derivada de una decisión/error real.
  No cambiar la serie para justificar una portada que promete otro contenido.

Ejemplos de dirección editorial, no publicaciones ni pruebas de una herramienta:

- **Mal:** «Nunca supe qué pedirle a la IA». No dice qué obtiene el lector.
- **Bien:** «¿No sabes qué pedirle a la IA? Haz que te pregunte a ti».
  El cuerpo debe mostrar el pedido y cómo usar las respuestas para empezar.
- **Mal:** «Acta lista con ChatGPT» si solo se demuestra una lista de acuerdos.
- **Bien:** «ChatGPT organiza tus notas de reunión en acuerdos» si eso se muestra.

El ejemplo antiguo «ChatGPT elige tu primera tarea con IA» se retira como modelo
normativo: apuntaba al resultado, pero no explicaba tan bien la dificultad del
principiante como la pregunta-respuesta anterior. No conservarlo simultáneamente
como «Bien» y «Mal». Esta comparación no vuelve obligatoria toda pregunta-respuesta.

## Qué puede hacer que siga mirando

La portada conecta con una dificultad reconocible: notas desordenadas, un reclamo,
un mensaje que suena ajeno, una decisión que hay que revisar. El contenido ofrece
una solución visible y proporcionada. No inventar urgencia ni cifras para ganar
atención, ni añadir «error», «nunca» o una pregunta solo para sumar puntos.

| Necesidad del lector | Entrada posible |
|---|---|
| Comunicar una decisión incómoda | Decir que no sin sonar duro |
| Ordenar lo que ocurrió en una reunión | Convertir notas en acuerdos revisables |
| Escribir con una voz reconocible | Mostrar un ejemplo propio para orientar el tono |
| Revisar trabajo antes de entregarlo | Saber qué comparar con el material original |

Estas entradas aún necesitan el resultado y la IA en el título final. No
confundir una etiqueta de tema («productividad») con una promesa. La función
tecnológica es el cómo; lo que importa es la situación de trabajo.

## Formato y límites vigentes

Los topes de la puerta y la configuración instalada siguen aplicando. No
confundir un máximo de palabras con tiempo suficiente para leerlas:

- Reel: título hasta 14 palabras; más corto si se entiende igual. Con voz y
  ritmo `gancho`, sin subtítulo. Sin voz y ritmo `ensenar`, el subtítulo puede
  ampliar; título y subtítulo suman hasta 16 palabras. Confirmar lectura en render.
- Pregunta-respuesta «¿problema? salida»: hasta 16 palabras, sin subtítulo.
  Es una opción cuando expresa mejor la situación y la acción, no una obligación.
- Carrusel: título hasta 14 palabras con la palabra clave al inicio; el
  subtítulo amplía la promesa ya comprensible en el título.
- `resultado` en una portada de reel no aparece desde el 2026-11-02. Si existe
  porque también se usa el post, no lo cuentes como información visible del reel.
- Sin relleno, clickbait, jerga sin explicar ni promesas de precio/acceso sin
  respaldo vigente. La condición que cambia la utilidad debe explicarse en la pieza.

Los ejemplos de esta guía orientan la escritura; cada candidato real debe
comprobarse con la pieza, sus fuentes, el modo de render y la puerta vigente.

## Cómo escribir los candidatos

1. Escribe el cuerpo y su demostración primero. Nombra qué enseña al principiante
   y localiza la escena que lo demuestra. Después escribe la portada.
2. Escribe **8 a 10 candidatos** de **al menos 3 patrones distintos**. Cambia
   la entrada al mismo contenido, no solo palabras. No inventes promesas para
   cubrir patrones que no corresponden.
3. Representa la portada completa: carrusel con `title`/`subtitle` si lo usa;
   reel con lo que realmente se ve; `Clip` de portada, solo `title`. La presencia
   de `resultado` en el candidato no hace visible ese campo en el reel.
4. Todos deben ser publicables si se eligen: sin candidatos de relleno, sin
   promesas que solo otra versión del cuerpo podría cumplir.
5. Guarda `hook.candidatos` como
   `{ "patron": "<id>", "title": "…", "subtitle": "…", "resultado": "…" }`
   usando los campos que correspondan. Corre `--juez`; recibe la lista numerada
   sin patrón, tema ni entregable privado.
6. Conserva su respuesta literal en `hook.juez`, la nota en `hook.score` y el
   título elegido en `hook.texto`. `Hook` y candidato elegido coinciden en
   `title`, `subtitle` y `resultado` cuando existen. No editar la portada después
   de obtener la evaluación sin volver a evaluarla.
7. Contrasta «qué crees que te llevas» con el cuerpo y registra el cumplimiento
   en `promesas`. Si falta la demostración, corrige pieza o promesa; una nota
   alta no lo resuelve. No le des el plan oculto al juez para que complete el título.

Si la nota queda bajo `puerta.hookUmbral`, se permite una ronda más de candidatos
nuevos usando sus dudas. Cuenta en `reescriturasMax`. Si tampoco pasa, se quita
la pieza y se registra el motivo. No repetir exactamente la misma evaluación
hasta obtener la respuesta deseada ni subir umbrales sin diagnosticar la causa.

## en-juego: lo que está en juego en tu trabajo

Una consecuencia cotidiana y concreta: responder al cliente, aclarar acuerdos,
entregar un texto que se entienda. La IA es la ayuda, no la amenaza.

- **Mal:** «Tu colega ya usa IA y te está dejando atrás». Presión sin ayuda concreta.
- **Bien:** «Responde ese reclamo sin sonar duro: ChatGPT te escribe el borrador».
  La pieza muestra la negativa cordial completa y qué revisar antes de enviarla.

Trampa: inventar una pérdida de empleo, ahorro o éxito. El ejemplo de respuesta
puede ser ficticio, rotulado como tal; no se usa como testimonio de un cliente real.

## error-comun: un error reconocible

Nombra una dificultad que este principiante pueda reconocer y la forma concreta
de abordarla. «La mayoría» necesita evidencia; no es un adorno del título.

- **Mal:** «El error que todos cometen con la IA». No dice qué pasa ni qué se lleva.
- **Bien:** «¿El correo de ChatGPT no suena a ti? Muéstrale cómo escribes».
  El cuerpo compara una referencia de estilo con una salida del mismo caso.

Trampa: exigir un error sofisticado de uso diario. Dar una instrucción suelta
sin destinatario ni decisión puede ser el problema adecuado de un principiante.
Cuando se cite un estudio, conservar su alcance: las cifras históricas de
15 % y 28 % de la referencia de Anthropic eran de **sesiones de programación**,
no una medición de correos de oficina. No trasladarlas a este ejemplo.

## dato-contrario: un dato que cambia una expectativa

Solo usarlo si el dato tiene respaldo y sirve al aprendizaje del lector. La
pieza conserva población, tarea y comparación; no adornar con cifras sin conexión.

- **Mal:** «La IA siempre te ahorra tiempo». Universaliza sin evidencia.
- **Bien:** «Con IA tardaron más en estas tareas: qué revisar antes de usarla».
  Solo si la referencia demuestra ese resultado y el cuerpo identifica tareas,
  población y una revisión pertinente, sin inventar una regla que el estudio no da.

Trampa: un dato sorprendente de otro oficio presentado como experiencia de todos.
Un ejemplo ficticio no puede sustituir un estudio ni producir porcentajes reales.

## antes-despues: una transformación visible

Muestra cómo cambia el mismo material. En reels, el después se demuestra en la
`Screen` de la escena 2 y se conecta con su entrada; no en una tarjeta de portada
que no se pinta. Se puede anticipar «así queda» y explicar luego cómo hacerlo.

- **Mal:** «ChatGPT te devuelve el acta lista» con una lista de nombres y fechas
  sin las notas originales.
- **Bien:** «ChatGPT organiza tus notas de reunión en acuerdos», con entrada,
  pedido y lista donde cada dato procede de las notas.

Trampa: comparar casos distintos o datos inventados. No usar un promedio de un
estudio como si fuera la bandeja del ejemplo. La transformación demuestra utilidad;
un cronómetro o ahorro necesitan además medición real.

## pregunta-del-jefe: una pregunta del trabajo

Usa una pregunta que la pieza ayude a responder. La portada completa debe decir
cómo la IA ayuda, no depender del subtítulo para revelar su utilidad.

- **Mal:** «¿Cómo va tu área?» con toda la explicación escondida en el subtítulo.
- **Bien:** «¿Qué acordaron? ChatGPT organiza las notas de tu reunión».
  La demostración conserva acuerdos, responsables y plazos que aparecen en la entrada.

Trampa: una pregunta de jefe caricaturesco o un miedo que no nace del caso.
No todos los lectores tienen el mismo cargo; la situación debe bastar para reconocerse.

## resultado: el resultado de trabajo, dicho directo

`[resultado concreto] + [con qué]`. Incluye siempre un candidato de este patrón
como comparación clara. No asumir que por ser directo será menos interesante:
puede conectar mejor que una pregunta ingeniosa.

- **Mal:** «Mejora tus textos con IA». Beneficio genérico, sin situación ni prueba.
- **Bien:** «ChatGPT organiza tus notas de reunión en acuerdos».
  La pieza permite ver el resultado y cómo conseguir un borrador para revisar.

Trampa: rechazar un resultado de primer día porque un experto ya lo hace. El
criterio es si este lector aprende un uso concreto que le sirve. «Listo» tampoco
reemplaza la descripción del resultado ni justifica omitir revisión humana.

## Comparar candidatos sin inventar una evaluación

Compara portadas que prometen el mismo cuerpo. Una puede entrar por el problema
(«¿Qué acordaron?…») y otra por el resultado («ChatGPT organiza…»). Mantén los
hechos del ejemplo y verifica que ninguna prometa más que la otra versión puede dar.

No copiar notas ni respuestas ficticias de juez desde una guía. Los ocho candidatos
reales y la respuesta completa pertenecen al `plan.json` de la pieza. Una portada
que intrigue pero deje «no sé qué obtengo» necesita reescritura; una portada clara
puede necesitar una situación más reconocible, sin perder precisión.

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
