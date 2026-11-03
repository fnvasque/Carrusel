# Guía de redacción

Para el planificador (Paso 5 de `INSTRUCCIONES.md`). Es **obligatoria**: escribe
primero el guion, el cuerpo y su demostración; aplica esta guía antes del hook y
del lector frío. Termina con la lista de chequeo. La memoria del cambio está en
`docs/superpowers/specs/2026-11-01-claridad-editorial-design.md` del repo de código.

## A quién le escribes

Un profesional de cargo medio, no programador, que **nunca ha usado IA más allá
de una pregunta suelta y no sabe por dónde partir**. Tiene IA a mano, no paga
por ella y la usa como Google: pregunta, lee y cierra. Le faltan situaciones
concretas de su trabajo en las que usarla y una forma de empezar.

Escribe con tuteo, español neutro y palabras de oficina. Comprensible para un
principiante no significa interesante para todo el mundo. Una tarea sencilla
puede ser nueva y útil para él; no busques sofisticación para impresionar a
quien ya usa IA todos los días. El contexto histórico de la audiencia anterior
queda en las specs, no rige estos ejemplos.

## Una pieza, una necesidad y un resultado

Antes de elegir plantilla, usa `fraseAmigo`, `entregable`, `guion` y las notas
existentes para responder: qué le pasa, qué podrá hacer, qué le impide hacerlo,
qué aprenderá, cómo lo demuestras, de dónde salen los hechos, qué debe revisar
y qué ayuda real recibe al terminar. No hace falta agregar campos al plan.

- **Mal:** enseñar a resumir un video, interrumpir para contar cuánto cuesta
  un bot propio y terminar con pasos de otra herramienta.
- **Bien:** enseñar una transformación de principio a fin; o contar una
  decisión del bot, su resultado y la lección para el trabajo del lector.

En `por-donde-partir`, los pasos van al lector («copia», «pega», «respóndele»).
La primera persona suma cuando aclara una experiencia, no cuando sustituye el
cómo. En `lo-que-construi`, la primera persona es el hilo: problema propio →
decisión/error → resultado observado → límite → lección transferible y un paso
para el lector. No convertir una anécdota sin lección en tutorial ni inventar
resultados para llenar la serie. En `con-tu-equipo`, el lector es el jefe:
situación del equipo → dato que la explica (con su límite: encuesta, estudio
de otro oficio) → la decisión que le toca → qué hacer esta semana con su
equipo. Los pasos son de jefe («muéstrales», «pregúntale a tu equipo»), no
pasos en la pantalla de la IA.

## 1. Cada escena aporta una idea completa

El lector debe entender quién o qué hace qué y para qué le sirve dentro de la
secuencia. Con audio, se juzgan **pantalla y voz juntas**; sin audio, solo lo que
se ve. En carrusel se leen título y cuerpo juntos. No exigir sujeto, acción y
consecuencia en cada frase por separado: una escena puede preparar la siguiente
si el vínculo es claro. Un rótulo solo no reemplaza la explicación.

- **Mal:** «Suben los precios. Plazo: marzo. Cambia el sistema». No sabemos qué
  precios, qué vence ni qué sistema cambia.
- **Bien:** «Las nuevas tarifas comienzan en marzo». Conserva el referente y
  la relación entre hechos; es un ejemplo ficticio de redacción, no una noticia.

Ante «esto», «lo» o una palabra ambigua, comprueba que su referente sea visible
o se haya nombrado claramente. No confíes en `angle` o en el conocimiento del
autor para completar lo que el lector no recibe.

## 2. Los datos llevan contexto y origen

Un número necesita alcance: quién lo midió, sobre qué población/tarea, cuándo
y comparado con qué si hay comparación. Distingue medición, declaración y
estimación. No conviertas el resultado de una tarea en una afirmación universal.

Ejemplo histórico de la semana 2026-10-19, para conservar el aprendizaje sobre
contexto, no para copiar cifras sin releer su referencia:

- **Mal:** «Uno con IA rinde como dos». No dice quién ni comparado con qué.
- **Bien:** «En el estudio de Procter & Gamble con 776 profesionales, una persona
  con IA igualó a una pareja sin IA». La publicación debe conservar el alcance
  y la fuente del estudio, no presentar esa comparación como garantía general.

En una bitácora, las cifras salen del caso real, con unidad y alcance. No usar
un ahorro inventado, un costo ajeno o una salida ficticia como resultado propio.
Verifica nombres de productos, funciones, acceso, costos y pasos de interfaz
con la referencia vigente antes de publicar; un ejemplo antiguo no los confirma.

## 3. La voz explica y puede repetir lo que orienta

La `narracion` aporta detalle, ejemplo, vínculo o porqué. Puede repetir un nombre
o una instrucción clave para orientar a quien escucha. El problema es la
redundancia sin función, no compartir palabras con la pantalla.

- **Mal:** pantalla «Esto le pides» y voz «Esto le pides y esto te devuelve».
  No aclara qué se aporta ni qué cambia.
- **Bien:** pantalla «Pega tus notas de la reunión» y voz «Pega tus notas de la
  reunión; de ahí saldrán los responsables y los plazos». Repite para orientar
  y agrega de dónde sale el resultado.

Sin voz, lo que solo está en `narracion` se pierde. Con voz, revisa también el
reel sin sonido: el nombre de una propiedad no garantiza que se oiga o se vea.
Si falta información esencial, resuelve su presencia en pantalla/subtítulos
con el modo vigente; no actives audio o cambies configuración por tu cuenta.

## 4. La prueba del «¿y?»

Pregunta qué aporta cada escena: orientación, prueba, explicación, revisión o
paso siguiente. Si no aporta ninguna de esas cosas, quítala. El beneficio no
necesita repetirse en todas las escenas, pero debe quedar claro en la pieza.

- **Mal:** «La IA ordena información». Es una capacidad genérica.
- **Bien:** «Ordena los acuerdos por tarea, responsable y plazo para revisarlos
  antes de compartirlos». Conecta capacidad, resultado y uso.

Explica el porqué junto a la acción que aclara, en el cuerpo o la voz si cabe.
Puede ocupar una escena propia cuando lo necesita; no agregues un `Lead` solo
para decir «funciona porque». La frase debe explicar una relación real.

## 5. Enseña algo que este lector no sabía

Nombra el aprendizaje en una línea y apóyalo en la referencia o en el caso real
de la bitácora. Puede ser un primer uso, cómo aportar contexto, cómo iterar o
qué revisar. Lo básico para un experto no es motivo para descartar una pieza.

- **Mal:** «Dale contexto a la IA». El principiante no sabe qué contar.
- **Bien:** «Dile para quién es el correo y qué decisión necesitas comunicar».
  Le dice qué información aportar y permite usarlo en su trabajo.

No supongas que cualquier principiante conoce un riesgo. Si enseñas revisión,
muestra qué revisar y cómo, en lugar de una advertencia genérica. El lector
frío evalúa novedad con este perfil; su respuesta no demuestra interés real
del público ni reemplaza las métricas posteriores.

## 6. Lenguaje concreto, sin exagerar

Máximo un término técnico por pieza, explicado en la misma escena con palabras
de oficina. Evita jerga, hype, relleno y miedo sin salida. Conserva las siglas
y límites de la puerta vigente; no uses palabras grandilocuentes para compensar
una demostración débil.

- **Mal:** «Un agente orquesta tus tareas con herramientas».
- **Bien:** «Una IA que hace tareas paso a paso». Si importan permisos o revisión,
  explícalos; «sola» no debe sugerir autonomía que el ejemplo no demuestra.

No prometer «acta lista» cuando se muestra una lista de acuerdos ni «correo
listo para enviar» cuando todavía hay que revisar hechos. La promesa tiene
el alcance del ejemplo: lista, borrador, fragmento o criterio, según corresponda.

## 7. Espacio y estructura por formato

**Reel:** situación/promesa → transformación visible → cómo conseguirla con
su porqué → revisión útil → cierre. Se pueden combinar funciones; no es una
cantidad fija de escenas. Una vista previa del resultado puede ir antes de
los pasos si queda claro «así queda» y luego «para hacerlo».

Hasta 20 palabras por escena, mejor menos, es la orientación de claridad
acordada el 2026-10-31; no garantiza cabida. Aplican los tiempos, lectura y
límites vigentes. Sin voz, ritmo `ensenar`. Los títulos se ajustan al límite
vigente y a su lectura real. Con voz y ritmo `gancho`, el validador exige los
topes de 7/5/10 palabras de `INSTRUCCIONES.md`: son un máximo, no una meta.
Una `Screen` de reel aguanta unas 20 palabras entre `heading`, `prompt` y
`respuesta` (8 s): el rótulo «Ejemplo ficticio» también cuenta. Si la
demostración completa no cabe, reparte entrada y resultado en dos escenas
(como en el piloto de notas) o llévala a un carrusel; no cortes la parte difícil.

Si no cabe: reducir el caso o dividir temas en piezas independientes. No
recortar sujetos, referentes o la parte difícil del ejemplo, acelerar la
lectura ni cambiar duración para acomodarlo. Una lectura en voz alta ayuda a
redactar, pero solo el render confirma tiempos y legibilidad.

**Carrusel:** problema/promesa → caso → pasos con su razón → resultado que
cumple la promesa → adaptación/revisión → cierre. Cada lámina añade una función.
Sus títulos permiten seguir la idea al hojear; el cuerpo desarrolla lo necesario.
No llenar todos los campos hasta el máximo ni convertirlo en una lista de temas.

Las restricciones técnicas de cuerpo, títulos, bullets y escenas están en
`INSTRUCCIONES.md` y la configuración instalada. Esta guía no las reemplaza.
Si una buena explicación entra en conflicto con ellas, registra el caso y
reduce el alcance; no la mutiles para que parezca válida.

## 8. Mito contra realidad y comparaciones

`MythReality` enfrenta una creencia con un dato que la corrige. No sirve para
«lo que pides contra lo que sale»: tachar el pedido lo hace parecer un error.

- **Mal:** usar de mito «Escribe un correo» y de realidad el correo generado.
- **Bien:** mostrar pedido y respuesta en `Screen`, o un antes/después del
  mismo caso. Reservar `MythReality` para una creencia respaldada y su contraste.

Al comparar estilo, mostrar un fragmento de referencia y uno de salida, con
hechos y destinatario constantes. No atribuir al tono una mejora causada por
agregar datos. Si el ejemplo demuestra información más completa, prometer eso.

## 9. Ejemplo legible y acceso a lo copiable

El ejemplo entre «» va primero y en su propia línea; después, su explicación.
Un `\n` explícito separa párrafos. En correos, usa `\n` entre asunto, saludo,
cuerpo y cierre; evita líneas vacías que consumen alto. Verifica el resultado
visual, no solo el JSON.

- **Mal:** esconder el pedido que se ofrece «para copiar» en una explicación
  resumida o mostrar únicamente «dile esto».
- **Bien:** pedido entero, con las partes reemplazables reconocibles y un
  lugar real para recuperarlo. En reel, incluirlo también en el caption si ese
  es el acceso elegido; comprobar que esté allí.

El caption amplía, cita y facilita copiar. No rescata una pieza incomprensible:
los pasos y condiciones indispensables para cumplir la promesa deben verse u
oírse en la pieza. No anunciar un descargable o envío automático inexistente.

## 10. La demostración completa la parte difícil

Cuando la promesa depende de transformar información, muestra la cadena mínima
**entrada → pedido → resultado**. Puede repartirse entre escenas y no exige tres
`Screen`. Los nombres, fechas y hechos de la salida deben tener origen visible.
Mantén el mismo caso durante toda la explicación.

- **Mal:** pedido «arma el acta» y salida «Paula, lunes» sin notas de entrada.
- **Bien:** entrada «Paula cambia el turno el lunes» y salida «Cambiar turno —
  Paula — lunes», con el pedido de ordenar por tarea, responsable y plazo.

Mostrar un fragmento es válido si contiene lo prometido. Para enseñar a decir
que no cordialmente, «Hola, entiendo tu molestia…» omite justamente la dificultad.

- **Mal:** una salida que termina antes de comunicar la negativa.
- **Bien** (carrusel; en reel no cabe en una `Screen`, ver sección 7): «Hola, Ana.
  Entiendo que necesitas recibirlo antes. La entrega se mantiene para el viernes;
  no podemos adelantarla. Lamento el inconveniente».
  El contexto del ejemplo debe decir que esa fecha está acordada y no se puede
  adelantar: no es un compromiso que la IA pueda decidir por su cuenta.

Los ejemplos nuevos de esta guía son didácticos ficticios. Rotular «Ejemplo
ficticio» de forma visible cuando se usen en una pieza; no presentarlos como
captura, testimonio o ejecución real. En una ejecución real, conserva evidencia
y verifica que la salida corresponda a la entrada. No prometas que cualquier
lector obtendrá exactamente el mismo texto.

Un resultado útil sigue necesitando revisión. En acuerdos, comparar nombres y
fechas con las notas; en correos, revisar hechos y compromisos. Pedir «no
inventes» o «marca lo que falta» orienta la respuesta, no garantiza exactitud.
Si falta un responsable en la entrada, el ejemplo no inventa uno.

## 11. Carrusel explicativo: una idea, dicha como a un colega

Cuando corresponde la variante `explicativo`, las láminas `Concepto` desarrollan
una sola idea: qué ocurre, por qué y cómo reconocerlo o actuar. No tienen que
imitar un tutorial ni una transformación de app si no es lo que prometen.

`idea` describe lo que le pasa al lector; `contraste` ofrece una distinción
clara; `enSimple` cuenta en primera persona cómo lo abordas y una acción para
él. Las láminas se complementan, sin repetir la misma conclusión con sinónimos.

- **Mal:** «La falacia de la planificación» seguida de una definición técnica
  y «hay que considerar datos históricos».
- **Bien:** «Calculas el tiempo como si todo saliera bien», con un ejemplo de
  tarea y una acción concreta: «Yo comparo con la última vez que la hice.
  Busca cuánto tardaste antes de comprometer una fecha».

El ejemplo debe probar la idea; no introducir teoría o hechos sin respaldo.
Si una lámina no añade contexto, distinción, ejemplo o acción, sobra.

## 12. El hilo y la elección de plantilla

Escribe la explicación corrida y divídela en `guion`, una entrada por escena.
En un tutorial, debe poder reconstruirse qué abrir, qué aportar, qué pedir,
qué cambia y qué revisar. El porqué puede integrarse en el paso. En bitácora,
la secuencia es problema, decisión, resultado y lección: no forzar instrucciones
al lector en cada escena.

Si un paso no se sigue del anterior, falta una transición o sobra una escena.
La pregunta 9 del lector frío ayuda a observar si puede contar la pieza; no
completes tú el paso ausente usando el plan privado.

**La plantilla va después del texto:**

| Función | Plantilla |
|---|---|
| Pedido y respuesta; rotular si es un ejemplo ficticio | `Screen` |
| Paso con su cómo y porqué breve | `Step` (`heading` + `body`) |
| Explicación o transición que necesita su propia escena | `Lead` |
| Creencia contra dato | `MythReality` |
| Dato con contexto y fuente | `Stat` |
| Desarrollo de una idea en la variante correspondiente | `Concepto` |

## 13. Cierre PARTIR y ayuda real

Mantén `cta: "Escríbeme PARTIR"`. El título pregunta por el caso del lector y
termina con «Escribe esta palabra y te ayudo»; PARTIR aparece en la burbuja, sin
repetirlo en el título. El caption y la voz, cuando existe, piden el mismo gesto.

La pregunta continúa lo enseñado: después de enseñar un paso, no preguntar
«¿Te digo por dónde empezar?». El caption usa la oferta vigente: «Escríbeme
PARTIR por mensaje o en los comentarios y te ayudo con tu caso». Precisar la
ayuda solo cuando corresponda a lo que se ofrece de verdad; no inventar una
sesión gratuita, un plazo de respuesta, un archivo o un servicio personalizado.

## Lista de chequeo

Revisa antes del hook y del lector frío; ante un fallo de hilo, vuelve al guion
y comprueba la pieza completa tras corregirlo.

1. **Necesidad y novedad:** un resultado principal útil para el principiante;
   no se descarta por ser básico para un experto.
2. **Idea completa:** pantalla y voz juntas cuando existe audio, o solo pantalla
   sin voz, permiten entender referentes y relaciones; carrusel, título y cuerpo.
3. **«¿Y?» e hilo:** cada escena añade orientación, prueba, explicación o acción;
   el mismo caso continúa y no exige inventar pasos.
4. **Demostración:** se ve la parte difícil prometida y el origen de los datos
   relevantes; un resumen o una negativa no terminan antes de aportar significado.
5. **Porqué:** explica una relación útil cerca del paso; no requiere escena
   aparte ni basta escribir la palabra «porque».
6. **Voz:** aporta valor y puede repetir para orientar; nada esencial depende de
   narración inaudible ni de subtítulos que el render no muestra.
7. **Lenguaje y alcance:** palabras concretas, sin jerga sin explicar, hype o
   promesas mayores que el ejemplo; fuentes y límites pertinentes.
8. **Evidencia:** cifras con contexto, ejemplos ficticios visibles como tales,
   resultados observados respaldados, hechos y compromisos revisados.
9. **Espacio y acceso:** lectura comprobada en el render; pedido entero y un
   acceso real para copiarlo; caption no sustituye pasos indispensables.
10. **Formato:** reel con una transformación; carrusel con desarrollo conectado;
    bitácora con decisión y lección, no una anécdota intercalada sin función.
11. **Cierre:** primer paso o lección aplicable y PARTIR con una ayuda real.
12. **Interés separado de claridad:** identificar qué situación reconoce el
    lector y qué lo invita a continuar. Una nota de juez no prueba retención.
