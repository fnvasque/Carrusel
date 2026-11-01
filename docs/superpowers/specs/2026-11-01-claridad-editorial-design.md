# Claridad e interés en reels y carruseles — especificación y memoria de decisiones

Fecha: 2026-11-01. Estado: **propuesta editorial documentada; implementación pendiente**.

Plan asociado: [plan de ejecución](../plans/2026-11-01-claridad-editorial.md).

## 1. Encargo y límites

El usuario pidió revisar cómo se escriben reels y carruseles para que se entiendan sin
conocimientos previos y llamen la atención. Excluyó inicialmente las reglas de validación.
Después pidió un plan exhaustivo y recordar las decisiones porque quizá haya que ajustar
el validador y el juez. Esta solicitud autoriza la planificación y su registro; no implica
que cada propuesta de este documento esté aprobada ni que se deban implementar ahora.

Este documento es la memoria de esta iniciativa. Los identificadores E01–E18 permiten
vincular futuros cambios, ejemplos, pruebas y correcciones sin depender del historial del chat.
Ante un cambio, registrar fecha, motivo y decisión sustituida; no reinterpretar silenciosamente
una propuesta como una decisión del usuario.

El trabajo actual produce documentación. La ejecución posterior empieza por la escritura;
la adaptación de evaluadores es una fase posterior condicionada a evidencia.

## 2. Evidencia revisada y alcance del diagnóstico

Se leyeron `guia-redaccion.md`, `guia-hooks.md`, `momentos.md`, los apartados editoriales de
`INSTRUCCIONES.md` y el perfil/preguntas de `lector-frio.md`. Las cinco copias de
`kb-plantilla/_calendario/` y `knowledge/_calendario/` eran idénticas al revisarlas el 2026-11-01.
Se leyeron los cuatro borradores y captions de `knowledge/_calendario/2026-11-02/plan.json`.
Son borradores planificados, no evidencia de publicaciones ni de rendimiento.

| Evidencia | Problema observado | Consecuencia para el lector |
|---|---|---|
| `lun-reel-ordena-tus-notas.json`, `Screen` | Aparecen Paula, Juan y fechas sin mostrar las notas de entrada | No se ve de dónde salen los datos ni la transformación |
| Mismo reel, portada | Promete «acta lista» y muestra una lista breve de tareas | El alcance de la promesa supera lo demostrado |
| `vie-carrusel-responde-el-correo-dificil.json`, `Screen` | «Hola, entiendo tu molestia…» termina antes de decir que no | No demuestra la habilidad prometida: rechazar sin sonar duro |
| `mie-reel-mi-bot-resume-videos.json`, respuesta | «Suben los precios. Plazo: marzo. Cambia el sistema» | Faltan referentes; breve no equivale a comprensible |
| Mismo reel, escena del bot | Interrumpe el tutorial para introducir un sistema propio y su costo | Abre otro tema sin desarrollar la lección de construcción |
| `mar-carrusel-tu-correo-con-tu-estilo.json` | Pide un correo de ejemplo, pero no lo muestra | No permite comprobar que el resultado conserve el estilo |
| `guia-hooks.md` | El mismo título «ChatGPT elige tu primera tarea con IA» figura como positivo y negativo | El escritor recibe ejemplos incompatibles |
| `guia-hooks.md`, patrones de error/resultado | Conserva referencias a alguien que usa IA todos los días y desprecia resultados de primer día | La novedad se juzga con el nivel equivocado |

No se verificaron aquí funciones, nombres comerciales, precios ni interfaces vigentes de
herramientas. Los nombres presentes en borradores son evidencia textual, no afirmaciones
verificadas. Tampoco se inspeccionó el render: densidad visual, audio y tiempos reales quedan
para el piloto. No se atribuyen estas deficiencias a límites del validador sin una prueba.

## 3. Decisiones previas que siguen siendo el punto de partida

Fuentes históricas: specs `2026-10-30-portada-al-lector-design.md` y
`2026-10-31-piezas-que-se-entienden-design.md`. Son antecedentes; sus instrucciones operativas
no autorizan ejecutar de nuevo sus pilotos, instalar la base o modificar semanas existentes.

- Público: profesional/empleado no programador, con IA a mano y poca experiencia práctica.
  «Cualquier lector» significa comprensible sin conocimientos previos; no cambia por sí solo
  el público a niños, desarrolladores o especialistas.
- La portada expresa una situación o resultado del lector; la promesa esencial está en el título.
- Los pasos de `por-donde-partir` se dirigen al lector. `lo-que-construi` conserva su carácter
  de bitácora en primera persona y una lección transferible.
- Momento y capacidad con respaldo, guion antes de plantillas, ejemplos y explicación del porqué.
- La spec previa recoge preferir claridad a recortes artificiales, hasta 20 palabras por escena
  como orientación y tiempos existentes. Sin voz, ritmo `ensenar`.
- Este plan no cambia duración, motor, mix, voz, CTA PARTIR ni configuraciones. No fija una
  fecha de entrada en vigor. La configuración instalada de la base manda en producción.
- `knowledge/` es otro repositorio y no se modifica desde esta tarea. `render.json` lo escribe
  el Mac. El banco de momentos y el cuestionario del lector tienen propiedad editorial explícita.

## 4. Registro de propuestas editoriales

Todas las filas siguientes son **propuestas del agente**, salvo lo expresamente citado como
decisión previa. Su aprobación y fecha de aplicación quedan pendientes de la siguiente etapa.

| ID | Propuesta | Motivo y criterio observable |
|---|---|---|
| E01 | Una pieza desarrolla una necesidad y un resultado principal | El lector puede contar de qué trata sin enumerar temas desconectados |
| E02 | Novedad relativa al principiante | Enseñar a ordenar notas puede ser valioso aunque sea básico para un experto |
| E03 | Portada concreta y proporcionada a la demostración | «Lista de acuerdos» cuando se muestran acuerdos; «borrador» cuando requiere revisión |
| E04 | Mostrar la cadena mínima entrada → pedido → resultado cuando la promesa depende de ella | Los nombres, fechas, tono o conclusiones demostrados tienen un origen visible |
| E05 | Completar la parte difícil del ejemplo | Un rechazo cordial incluye el rechazo; un resumen conserva de qué habla |
| E06 | Mantener el mismo caso durante la explicación | No cambiar de reunión a informe, ni de destinatario, sin explicar la transición |
| E07 | Guion causal y pasos ejecutables | Se entiende qué abrir, qué aportar, qué pedir y cómo usar/revisar la respuesta |
| E08 | Explicar el porqué cerca de la acción que aclara | El lector puede adaptar el método; no necesita una lámina teórica adicional por obligación |
| E09 | Distinguir demostración didáctica de resultado observado | Un ejemplo redactado no se presenta como captura, testimonio o salida real de una ejecución |
| E10 | Escribir para los canales que realmente llegan al espectador | Sin voz, nada esencial depende de `narracion`; con voz, pantalla y voz se complementan |
| E11 | Permitir repetición útil entre voz y pantalla | Repetir un nombre o una instrucción clave puede orientar; eliminar solo redundancia sin función |
| E12 | Separar tutorial y bitácora por su propósito | Tutorial enseña a hacer; bitácora explica una decisión/error y su consecuencia para el lector |
| E13 | Usar una estructura distinta según formato y tipo de idea | Reel concentra una transformación; carrusel permite desarrollar y volver a consultar |
| E14 | Cierre concreto y proporcional al contenido | PARTIR puede continuar; precisar ayuda real sin inventar servicios, plazos o recursos |
| E15 | Mantener un criterio editorial vigente por asunto | Sustituir instrucciones y ejemplos obsoletos; conservar historia en specs, no capas contradictorias |
| E16 | Separar comprensión, fidelidad y atractivo en la revisión | Una pieza puede entenderse y ser poco interesante; una portada atractiva puede prometer de más |
| E17 | Revisar legibilidad y acceso al texto copiable en el artefacto | Un pedido visible en un video no es automáticamente fácil de copiar; prever acceso real |
| E18 | Conservar límites que cambian la utilidad del procedimiento | No relegar al caption una condición imprescindible para que el paso funcione |

E11 propone reemplazar el «nunca repite» de la guía; no se modifica ahora. E08 propone que el
porqué pueda integrarse en una escena, en lugar de forzar siempre una escena exclusiva.
Ambas diferencias deben evaluarse expresamente contra los contratos existentes antes de aplicar.

## 5. Cómo escribir una pieza

### 5.1 Preparación editorial

Antes de elegir plantilla, escribir en una ficha de trabajo:

1. Situación: qué le está pasando al lector en su trabajo.
2. Resultado: qué podrá hacer o entender al terminar.
3. Obstáculo: qué no sabe, no tiene o teme hacer mal.
4. Aprendizaje: la diferencia que le permite avanzar.
5. Demostración: entrada mínima, pedido y salida que prueban esa diferencia.
6. Evidencia: qué es real y de dónde sale; qué es un ejemplo didáctico.
7. Límite relevante: qué no resuelve o qué necesita revisar.
8. Continuación: acción útil y ayuda real disponible al escribir PARTIR.

Esta ficha es una herramienta de autoría, **no ocho campos nuevos obligatorios de `plan.json`**.
Reutilizar `angle`, `fraseAmigo`, `entregable`, `guion`, `promesas`, referencias y notas cuando
corresponda. Solo proponer un campo nuevo si una necesidad comprobada no cabe en lo existente.

### 5.2 Guion y continuidad

- Escribir primero la explicación corrida; después dividirla en escenas/láminas.
- Cada transición debe responder una duda que dejó la anterior o mostrar el siguiente paso.
- Una vista previa del resultado puede preceder al tutorial si se señala «así queda» y luego
  «para hacerlo». No imponer orden cronológico si esa apertura se entiende mejor.
- No exigir entrada/pedido/salida en tres escenas distintas. Pueden compartir escena o aparecer
  en una secuencia; la condición es que se pueda reconstruir la transformación.
- Nombrar el referente cuando «esto», «lo», «plazo» o «sistema» admitan más de una lectura.
- Eliminar escenas cuya supresión no quite significado, prueba, orientación o una transición útil.
- No poner una consecuencia y una acción en cada frase por fórmula: evaluar la unidad de sentido.

### 5.3 Portada e interés

Escribir candidatos después del cuerpo. Probar entradas por situación reconocible, resultado
visible o dificultad concreta. No exigir siempre pregunta, número, negación o miedo.

Ejemplos de dirección, no títulos ya aprobados ni ajustados al render:

- «¿Tus notas de reunión son un desorden? ChatGPT las organiza en acuerdos».
- «Dile que no a un cliente con un borrador cordial de ChatGPT».
- «¿El correo de ChatGPT no suena a ti? Muéstrale cómo escribes».

La especificidad atrae por reconocimiento: una reunión, un reclamo, una entrega. No añadir
urgencia, cifras, ahorro o éxito sin evidencia. La herramienta explica el cómo; no sustituye
la necesidad del lector. No prometer un resultado exacto y reproducible de la IA por mostrar
una salida ilustrativa. Mantener la promesa esencial en el título conforme a la decisión previa.

### 5.4 Reel

Estructura orientativa: situación/promesa → transformación visible → instrucciones mínimas
con su porqué → revisión o límite útil → cierre. Se pueden combinar funciones en una escena.
No convertir esta secuencia en un número fijo de escenas.

Sin voz, escribir una versión autosuficiente en pantalla. Con voz, redactar un relato hablado
y verificar además qué entiende quien lo ve sin sonido; si hace falta audio para comprender,
resolver la accesibilidad del texto/subtítulos en la etapa correspondiente, sin asumir que una
propiedad `narracion` se oye o se pinta. Confirmar el modo real con el render.

La voz puede repetir un término necesario y completar el ejemplo o el porqué. «Esto le pides
y esto te devuelve» normalmente no agrega información. No reemplazarla por palabras distintas
que tampoco aportan nada. La lectura en voz alta ayuda a revisar el guion; no certifica duración.

Si no cabe sin perder comprensión: reducir el caso o dividir temas en piezas independientes.
No quitar sujetos, datos esenciales ni acelerar la lectura para encajar; no cambiar tiempos
o topes como parte incidental de esta mejora editorial.

### 5.5 Carrusel

Estructura orientativa: problema/promesa → caso concreto → pasos conectados con su razón →
resultado completo en el aspecto prometido → adaptación/revisión → cierre.

Un carrusel explicativo puede desarrollar qué ocurre, por qué y cómo reconocerlo sin ser un
tutorial ni mostrar tres pantallas de una app. Su ejemplo debe demostrar la idea central.
Cada lámina añade una función; el conjunto cuenta una sola idea. Los títulos permiten seguir
el argumento a quien hojea, pero no tienen que contener todas las instrucciones del cuerpo.

En ejemplos de estilo, mostrar un fragmento de referencia y un fragmento de salida comparable.
En un antes/después, mantener hechos y destinatario; no atribuir al estilo una mejora causada
por agregar información que faltaba. Usar `Screen`/pasos para comparaciones de pedidos;
`MythReality` solo cuando realmente haya creencia y contraste factual.

### 5.6 Texto copiable, límites y cierre

- Si se ofrece un pedido «para copiar», mostrarlo completo y distinguir partes reemplazables.
  En un reel, dar acceso en el caption si ese es el mecanismo elegido; verificar que esté allí.
  No prometer un descargable o envío automático inexistente.
- El caption puede repetir el pedido, ampliar contexto y citar fuentes. No debe rescatar una
  pieza cuyo procedimiento o promesa principal son incomprensibles sin abrirlo.
- Explicar las condiciones imprescindibles en la pieza. Verificar funciones/precios/interfaces
  con fuentes primarias vigentes al preparar el piloto, no con memoria ni solo con el borrador.
- Mantener revisión humana concreta: nombres/fechas en acuerdos; hechos y compromisos en correos.
  Para ejemplos usar datos ficticios claramente identificados; no copiar información sensible.
- CTA propuesto: una pregunta del caso + PARTIR + ayuda real. El texto «te ayudo a escribir el
  primer pedido para tu tarea» solo se usa si ese servicio corresponde a lo que el usuario ofrece.

## 6. Ejemplos de referencia para preparar el piloto

Todos los textos nuevos de esta sección son **ejemplos didácticos ficticios**. No son respuestas
obtenidas en una prueba de herramientas ni piezas listas para publicar. Falta revisar formato,
duración, evidencia de capacidades y compatibilidad con la puerta actual.

### Caso A: notas de reunión (reel tutorial)

- Promesa: organizar notas en una lista de acuerdos para revisar.
- Entrada visible: «Paula cambia el turno el lunes. Juan pide sillas antes del viernes».
- Pedido: «Ordena estas notas por tarea, responsable y plazo. Si falta un dato, escribe “no indicado”».
- Resultado ilustrativo: «Cambiar turno — Paula — lunes. Pedir sillas — Juan — antes del viernes».
- Porqué: las notas aportan los hechos; el pedido indica cómo ordenarlos.
- Revisión: comparar los acuerdos con las notas antes de compartirlos.
- Variante límite: si no consta quién pide las sillas, el ejemplo no inventa a Juan.

La instrucción de marcar datos ausentes ayuda a orientar la salida; no garantiza que la IA
nunca invente. La revisión permanece. No llamar «acta lista» a una lista de acuerdos.

### Caso B: correo difícil (carrusel tutorial)

- Entrada ficticia: «Necesito recibir el pedido el miércoles. El viernes ya no me sirve».
- Contexto aportado por el autor: entrega acordada el viernes; no puede adelantarla.
- Pedido: redactar una respuesta cordial que mantenga la fecha sin prometer alternativas.
- Salida ilustrativa: «Hola, Ana. Entiendo que necesitas recibirlo antes. La entrega se mantiene
  para el viernes; no podemos adelantarla. Lamento el inconveniente».
- Explicación: dar la decisión y el tono permite pedir una redacción; decidir la fecha sigue
  siendo responsabilidad de la persona.
- Revisión: que mantenga la fecha, diga que no con claridad y no agregue descuentos/promesas.

No es necesario un correo extenso: sí mostrar la oración que resuelve la dificultad.

### Caso C: correo con tu estilo (carrusel)

Usar un mismo aviso y destinatario. Mostrar un fragmento propio ficticio, identificar una
característica observable (frases directas, saludo breve) y mostrarla en la salida. No prometer
«tu tono» si solo se ve información más completa. La variación de estilo no debe alterar hechos.

### Caso D: resumir un video / lo que construí

Preparar dos posibles guiones, elegir según la serie sin cambiar el mix incidentalmente:

- Tutorial: qué video se aporta, qué se pregunta y un resumen con referentes claros. Verificar
  antes herramienta, acceso y condiciones de importación; no heredar nombres/precios del borrador.
- Bitácora: problema propio → decisión al construir → resultado real → límite/error → lección
  aplicable al trabajo del lector. Solo usar costos y resultados con respaldo del caso real.

Si la lección de construcción no tiene evidencia o no resulta útil para este lector, buscar
otro caso de bitácora. No rebautizar el tutorial como bitácora para llenar la serie.

## 7. Revisión editorial propuesta (sin activar nuevos bloqueos)

Para cada respuesta registrar evidencia textual y escena; permitir «no sé». No completar
mentalmente lo que falta con `angle`, el guion privado o el conocimiento del revisor.

| Dimensión | Pregunta de revisión | Evidencia necesaria |
|---|---|---|
| Comprensión | ¿Qué problema resuelve y qué haría primero? | Respuesta concreta a partir de la pieza |
| Continuidad | ¿Puedo contar los pasos sin inventar uno? | Entrada y transiciones suficientes |
| Demostración | ¿Qué parte de la respuesta prueba la promesa? | Fragmento completo en el aspecto prometido |
| Fidelidad | ¿Se agregaron hechos o se exageró el resultado? | Comparación entre entrada, evidencia y salida |
| Transferencia | ¿Qué tendría que cambiar para usarlo en mi caso? | Campos/condiciones adaptables identificables |
| Interés | ¿Qué situación reconocí y por qué seguiría mirando? | Razón específica; no solo «sí» o una nota |
| Canal | ¿Lo esencial llega por pantalla/voz disponibles? | Render y modo real comprobados |
| Cierre | ¿Qué recibo o hago después? | Acción o ayuda concreta y verdadera |

Defecto editorial crítico del piloto: contradicción, dato indispensable ausente, ejemplo que
omite la habilidad prometida o promesa sin demostración. Interés bajo se registra aparte;
un lector simulado no prueba retención ni conversión. No convertir cada preferencia en veto.

## 8. Memoria para una eventual adaptación del juez y validador

**Pendiente y fuera de la implementación editorial inicial.** La inspección actual solo localizó
interfaces y dependencias; no auditó todas las reglas ni decidió nuevas notas o umbrales.

| Propuestas | Quién debería comprobarlas | Posible punto de integración futuro |
|---|---|---|
| E02, E03, E16 | Juez de portada: identificación, claridad y expectativa | `guia-hooks.md` sección «Para el juez»; `mensajeJuez`, `vetoDelJuez` |
| E01, E04–E08, E12, E13 | Revisión de pieza completa/lector frío | `lector-frio.md`, `mensajeLector`, `textosLector`, análisis de causas |
| E09, E18 | Revisión de evidencia | Referencias y promesas frente al contenido; no una nota de atractivo |
| E10, E11, E17 | Inspección del artefacto y contrato del render | Extractor de texto visible, voz real, QA visual; código solo si se demuestra desajuste |
| E14 | Revisión editorial y oferta real | Cierre/caption; no deducir el servicio de una palabra clave |
| E15 | Autoría de documentación y ejemplos | Guías e instrucciones canónicas; evitar reglas duplicadas |

Separación propuesta de responsabilidades:

- **Validador determinista:** estructura, referencias resolubles, campos y contratos objetivos.
  Presencia de `entrada` o de la palabra «porque» no demuestra coherencia ni comprensión.
- **Juez de hooks:** solo la portada que el usuario ve y la expectativa que produce. No puede
  certificar el cumplimiento de una promesa sin conocer el cuerpo. No darle el plan oculto para
  que complete una portada insuficiente. Preservar candidatos sin etiquetas que sesguen.
- **Lector frío:** comprensión del contenido que realmente recibe. Distinguir lector completo,
  lectura rápida y caso con/sin audio. No exigir al rápido detalles que no se le muestran.
- **Revisión de cumplimiento/evidencia:** compara promesa, cuerpo y fuentes. Puede reutilizar
  `promesas`; no implica crear otro agente o una llamada pagada obligatoria.
- **Revisión visual:** legibilidad, sincronía y acceso efectivo a pantalla/voz. Un JSON claro
  no certifica un reel claro.

Riesgo específico: editar «Para el juez» modifica el prompt operativo aunque no cambie
`validar.mjs`. Lo mismo ocurre con «Para el lector». Tratar ambos como cambios del evaluador,
con pruebas y revisión propia, no como corrección de estilo inadvertida.

Antes de ajustar: reunir casos correctos rechazados y defectuosos aceptados, clasificar causa
(documentación, pieza, extracción, evaluación o contrato) y cambiar el componente responsable.
Subir `hookUmbral` por sí solo no resuelve una promesa falsa con nota alta.

No decidir aún: nuevos campos JSON, vetos, preguntas, escalas, umbrales, fechas de vigencia ni
retroactividad. Preservar esquemas e historia hasta diseñar compatibilidad explícita. Si se
versiona una regla, registrar primera publicación real y fuente en `reglas.json`, no la fecha
de este documento ni la fecha de un ensayo local.

## 9. Pendientes explícitos

| ID | Pendiente | Momento para resolver |
|---|---|---|
| P01 | Confirmar/ajustar propuestas E01–E18 con ejemplos concretos | Revisión editorial del piloto |
| P02 | Qué ayuda real ofrece PARTIR y con qué alcance | Antes de reescribir el cierre como promesa de servicio |
| P03 | Modo efectivo de voz/subtítulos y acceso al pedido copiable | Preparación y render del piloto |
| P04 | Capacidades, nombres, acceso y costos vigentes de apps usadas | Antes de producir piezas nuevas |
| P05 | Compatibilidad de mejores ejemplos con evaluadores existentes | Después de cerrar ejemplos editoriales |
| P06 | Fecha/semana de aplicación y si corresponde tocar borradores programados | Antes de activación, en el repositorio adecuado |
| P07 | Evidencia y ángulo de la bitácora | Antes de elegir el guion de `lo-que-construi` |

Mientras un pendiente no se resuelve, no se inventa una respuesta ni se atribuye aprobación.
Se puede avanzar en los demás casos sin bloquear toda la iniciativa.

## 10. Historial de decisiones y punto de reentrada

- **2026-11-01, usuario:** solicita revisión editorial sin considerar validación.
- **2026-11-01, usuario:** solicita planificación exhaustiva y memoria para posibles ajustes
  posteriores del validador y juez.
- **2026-11-01, agente:** documenta diagnóstico, antecedentes, E01–E18 y pendientes P01–P07.
  Ninguna propuesta se ha aplicado a guías operativas, piezas, configuración o evaluadores.

- **2026-11-01, agente (Codex):** ejecuta F1, F3 y F4: piloto aislado, guías de la plantilla
  reescritas, criterios P6/P8 de `lector-frio.md` precisados y `compatibilidad.md`. Sin commit.
- **2026-11-01, usuario:** pide a Claude Code seguir lo que hacía Codex y revisar el plan.
- **2026-11-01, agente (Claude Code):** restaura la regla de palabras del ritmo `gancho` que la
  puerta exige, arregla referencias rotas y los reels del piloto (Screen en escena 2, narración,
  dato ausente, CTA), re-renderiza y actualiza el estado del plan. E01–E18 siguen siendo
  propuestas: falta la revisión del usuario (F2), incluida la desviación en `lector-frio.md`.

Al retomar: leer esta sección, las decisiones E01–E18, pendientes y el estado del plan asociado.
Revisar cambios del repositorio y de las guías antes de reutilizar el diagnóstico. El siguiente
trabajo propuesto es el piloto editorial en archivos aislados del repo de código; no instalar,
publicar ni ejecutar el plan anterior de 2026-10-31.
