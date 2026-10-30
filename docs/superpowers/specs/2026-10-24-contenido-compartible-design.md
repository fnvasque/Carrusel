# Contenido compartible: escribir desde la situación del lector — diseño

Fecha: 2026-10-24 · Rama propuesta: `claude/contenido-compartible` · Reemplaza el
enfoque de `claude/promesa-y-tope-juez` (ver «Relación con la rama actual»).

## Intención y por qué

El ensayo del planificador para la semana 2026-10-26 produjo 6 piezas: 3
pasaron la puerta y 3 cayeron. El usuario las leyó y concluyó que **no se
entiende nada y no es contenido compartible**. La revisión pieza por pieza
muestra que el problema no es de redacción de una pieza: lo produce el diseño
del planificador, y cada arreglo anterior lo empeoró un poco.

### Diagnóstico (evidencia del ensayo)

1. **Las piezas nacen de una fuente, no de una situación del lector.** Paso 3
   elige un tema por sus referencias listas y Paso 5 saca el entregable de
   `## Para la audiencia` de esa referencia. El resultado es un resumen de
   estudio: «Anthropic midió 400.000 encargos», «7.137 trabajadores de 66
   empresas», «las 4 razones de Ethan y Lilach Mollick». La pieza carga en
   pantalla autor, cifras y salvedades («Tómalo como pista: lo midió el
   fabricante», «Es una propuesta, no un estudio»).
2. **El spec del 2026-10-22 empujó hacia ahí.** Definió sofisticación como
   «qué dicen los estudios con sus matices» y la novedad (P8 «nada nuevo»
   bloquea) se cumple más fácil con un dato raro de un paper que con una forma
   mejor de hacer una tarea. Novedad terminó significando «cifra que no
   conocías».
3. **Varias ideas y varios datos por pieza, sin hilo.** El reel del lunes mezcla
   verificar y no abandonar, con 15 % / 33 % / 19 % / 5-7 % de un estudio de
   programación; el propio lector dijo «si hasta los expertos logran solo un
   tercio, ¿para qué me sirve?».
4. **Títulos de molde.** Juez + patrones de `guia-hooks.md` + tope de palabras
   + score léxico producen acertijos: «“¿Cuándo avanzas el informe?” Reclaim
   responde», «Que Claude verifique antes que tu gerente», «“¿Quién aprobó
   esto?” La IA debía preguntarte». Ganan nota del juez, no se entienden.
5. **La puerta remienda en vez de descartar.** Hasta 3 vueltas de parches frase
   a frase («se cambió la voz a “la IA debe llamarte”»). El lector con prisa
   respondió «nada» o «a lo más guardarlo» en 4 de 6 piezas, y sus dudas de
   comprensión (P3, P6) no bloquean por diseño. Las 3 que pasaron llevan NB del
   tipo «¿encargos de qué, a qué IA?» → «no bloquea».
6. **Cada falla se arregla con otra regla.** `INSTRUCCIONES.md` tiene 1.677
   líneas y 39 commits; el escritor optimiza cumplir reglas, no que se entienda.
   La rama actual agrega dos más (promesas, tope del juez).

La muestra contraria: la pieza más útil del ensayo (martes, el correo a 12
supervisores) era la única que partía de una situación concreta, y cayó por
formalismos («3 partes» con 4 pasos).

## Principio

**Una pieza = un momento de trabajo del lector + una cosa que puede copiar para
resolverlo + una frase que se la contaría a un colega.** La fuente respalda; no
se muestra salvo que sea el gancho. Si la pieza no se entiende o nadie la
mandaría, se cambia de momento; no se remienda.

## Cambios

### 1. Banco de momentos (nuevo origen de cada pieza)

- Archivo nuevo `_calendario/momentos.md`: 20–30 situaciones concretas del
  público (jefe de área, coordinador, gerente de primera línea), cada una con
  `id`, la situación en una línea en palabras del lector y la tarea que
  resuelve. Ej.: «Te piden la presentación para el comité y tienes el informe
  pero no las slides», «Tienes que mandarle a tu gerente un resumen con cifras
  y no quieres que tenga un error», «Entra alguien nuevo al equipo y tienes que
  explicarle cómo se trabaja».
- Semilla: la escribe el agente a partir de las entrevistas (spec 2026-10-22),
  `_investigacion/pedidos.md` y las piezas con mejores guardados/envíos; **el
  usuario la corrige antes de activarla**. La investigación semanal puede
  proponer momentos nuevos en una sección aparte; el usuario los acepta.
- **Paso 3 cambia de orden**: elige primero el momento y después busca la
  referencia lista que respalda la solución. El tema (`[[Tema]]`) sigue
  existiendo para las métricas, pero se deriva de la referencia.
- Campo nuevo `momento` en cada pieza; el validador exige que exista en el banco
  y que un momento no se repita en 4 semanas.

### 2. Orden de escritura: la frase primero, la portada sale de ella

Nuevo orden del Paso 5:

1. **Momento** (del banco).
2. **Frase de amigo**: la pieza entera hablada en una frase, sin cifras de
   estudio ni nombres de autores. Es el contrato de la pieza.
3. **Entregable copiable**: el prompt, la plantilla o el antes/después,
   **completo y visible** en una slide (`Screen` o equivalente).
4. **Cuerpo**: solo lo necesario para que la frase se cumpla. Una idea.
5. **Portada**: candidatos al juez como hoy, pero **al menos 3 de los 8 son la
   frase de amigo acortada** (patrón nuevo `frase-amigo`), y se prohíbe el
   patrón «cita entre comillas + “X responde/la arma”» (el validador rechaza un
   `title` que empiece con `«` o `“`).

Con la portada derivada de la frase, las promesas se cumplen por construcción;
la lista `promesas` de la rama actual deja de hacer falta.

### 3. Un dato como máximo, las salvedades fuera de pantalla

- A lo más **una** slide con cifra de estudio (`Stat` o un número en `Lead`), y
  solo si empuja a actuar. Cifras que desaniman («los expertos logran 33 %») no
  entran.
- Atribución metodológica, alcance y salvedades van a `source` y al caption,
  nunca a un paso. La regla dura 5 (todo con respaldo) no cambia: cambia dónde
  se muestra.
- Excepción: la pieza `pilar: "opinion"` o de persona reconocible puede tener
  el nombre en pantalla cuando el nombre es el gancho.
- El validador cuenta slides `Stat` y cifras con `%` en texto visible.

### 4. Novedad redefinida

`Lo nuevo` (Paso 5) y la P8 del lector pasan a significar: **una forma de hacer
la tarea del momento que cambia el resultado** (una frase que agregar al
prompt, un paso que nadie hace, un ajuste de la herramienta). Un dato de
estudio solo cuenta como novedad si cambia qué haces. Se reescribe la sección
«Sofisticación» de `guia-redaccion.md` en ese sentido.

### 5. Lector frío: prueba de compartir y descarte temprano

- Pregunta nueva para **ambos** lectores: «¿A quién se lo mandarías y qué le
  escribirías al mandarlo?». Pasa solo si nombra a una persona o rol y un
  mensaje concreto. «Nada», «guardarlo» a secas o «no sé» bloquean, también en
  el lector con prisa.
- Pregunta nueva para ambos: «¿Hubo una frase que tuviste que leer dos veces o
  no entendiste? Cítala». Cualquier cita bloquea, también en el con prisa. Se
  eliminan los NB `con prisa P3: no bloquea` y `con prisa P6: no bloquea`: la
  queja principal del público es que no se entiende, y el con prisa es el
  público real.
- **Descarte en vez de remiendo**: si en la v1 falla compartir o comprensión,
  se cambia de momento (pieza nueva), no se parchan frases. `reescriturasMax`
  baja de 3 a 2. Una pieza que necesita 3 vueltas no era clara.

### 6. Ejemplos de referencia

- Carpeta nueva `_calendario/ejemplos/` con 3–5 piezas **que el usuario elige**
  como compartibles (propias o de cuentas que admira), cada una con una línea
  de por qué se comparte. Incluye el antes/después del reel del lunes de este
  ensayo.
- El escritor los lee antes del Paso 5. El juez y los lectores no los ven.

### 7. El lector no leyó la fuente (patrones señalados por el usuario, 2026-10-24)

Al revisar la reescritura a mano, el usuario marcó frases que no se entienden.
Todas tienen la misma causa: el que escribe leyó la referencia y escribe para
alguien que también la leyó. A eso se suman los topes de palabras, que empujan a
comprimir. Las reglas van a `guia-redaccion.md` como sección nueva, con estos
casos reales de antes y después:

1. **Las respuestas de la IA en pantalla se escriben como responde la IA de
   verdad**, en frases completas, y se entienden sin ver el archivo. Antes:
   «5 coinciden. Devoluciones 3 %: no está en la planilla.» Después: «Revisé
   las 6 cifras de tu resumen. 5 están en tu planilla. La de devoluciones no
   aparece: revísala antes de enviarlo.»
2. **Toda persona u organización se presenta la primera vez que aparece**: quién
   es y por qué importa su opinión. Antes: «Ethan Mollick». Después: «Ethan
   Mollick, profesor que estudia la IA en el trabajo». También para empresas:
   «Anthropic, la empresa que hace Claude».
3. **Una anécdota se cuenta entera**: qué pasó, por qué pasó y qué salió mal.
   Si la referencia no trae el detalle, se busca en la fuente original o no se
   usa. Antes: «a Mollick un agente le escribió a un colega». Después: le
   encargó una tarea, el agente le escribió a un colega sin avisarle, y fue
   porque antes le había dado permiso para enviar correos.
4. **Sin complementos cortados.** «De fuera», «afuera», «tu OK», «lo apruebas»
   dejan al lector preguntando «¿de fuera de qué?», «¿qué apruebo?». Se nombra
   el complemento: «escribirle a otra persona en tu nombre».
5. **La frase de amigo es una oración hablada**, sin punto y coma ni dos ideas
   pegadas. Si necesita punto y coma, son dos piezas.

Para controlarlo, el lector frío suma una pregunta para ambos lectores:
«¿Qué tuviste que adivinar? (quién es alguien, qué pasó, de qué se habla, qué
dice una pantalla)». Cualquier respuesta concreta bloquea.

En el presupuesto de texto, presentar a una persona o completar un complemento
tiene prioridad sobre el tope de palabras de la escena. Si no cabe, la escena se
divide en dos.

### 8. Poda

Este cambio quita reglas además de poner:

- No se mergea la lista `promesas` (cambio 2 la vuelve innecesaria). El tope
  de 12 palabras del juez se queda.
- Se revisa si el **score léxico** (`src/score/virality.ts`) sigue premiando
  fórmulas («pregunta + número»); si choca con el patrón `frase-amigo`, se baja
  su peso o se saca de la puerta. Se decide con datos en el plan.
- Se sacan de `INSTRUCCIONES.md` y `guia-hooks.md` las secciones que el banco de
  momentos y la frase primero dejan sin uso. Meta: `INSTRUCCIONES.md` más
  corto que hoy al terminar.

## Regla del bucle

Entrada en `kb-plantilla/_calendario/reglas.json`: `id:
"momento-y-frase-primero"`, `desde` = primer día que se publique con ella,
`formato: "todos"`, `descripcion` corta y `fuente: este spec`. Métrica
principal: **tasa de envíos y guardados por alcance**, comparada con las
semanas 2026-10-19 y 2026-10-26.

## Cómo se verifica («terminado»)

1. `npm run typecheck && npm test` en 0, con tests nuevos del validador:
   `momento` en el banco y sin repetir en 4 semanas; `title` que empieza con
   comillas rechazado; ≥ 3 candidatos `frase-amigo`; ≤ 1 slide con cifra de
   estudio; las preguntas nuevas del lector presentes en el mensaje generado
   por `--lector`; los NB eliminados rechazados.
2. **Ensayo** del planificador con la versión nueva para la misma semana. El
   usuario lee las piezas y marca cuáles mandaría a alguien. Meta: ≥ 4 de 6.
   Si no se llega, no se activa.

## Fuera de alcance

- El render, los reels con clip, la revisión visual y la publicación en Meta.
- El público objetivo (sigue el del spec 2026-10-22).

## Decisiones del usuario antes de implementar

1. **Ejemplos de referencia**: qué 3–5 piezas usar.
2. **Banco de momentos**: aprobar la semilla que escribe el agente.
3. **Semana 2026-10-26** (el planificador corre mañana, domingo 2026-10-25,
   06:00): publicar las 3 que pasaron, reescribirlas a mano con este enfoque, o
   dejar la semana con menos piezas.
4. **Rama `claude/promesa-y-tope-juez`**: propuesta del agente = conservar solo
   el tope del juez y descartar `promesas`.
