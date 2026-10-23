# Calidad del contenido: público, sofisticación, hooks y redacción — diseño

Fecha: 2026-10-22 · Rama: `claude/calidad-contenido` · Proyecto 1 de 2 (el 2 es
"carruseles animados", aparte).

## Intención y por qué

El usuario entrevistó a personas del público y le dijeron tres cosas:

1. El contenido es **demasiado básico**: no les sirve, ya lo saben.
2. Los **hooks** son poco atractivos.
3. El **wording** es malo: no se entiende o no explica lo suficiente.

La revisión del 2026-10-22 (manual del planificador, lector frío y las 10 piezas
de la semana 2026-10-19) mostró que las tres cosas las producen las reglas del
propio sistema:

- **Público mal definido.** El manual y el lector frío describen a un
  «hispanohablante de 25 a 45, curioso de la IA, no técnico, distraído». No dice
  oficio ni problema, y confunde «no técnico» con «principiante». La
  investigación semanal escribe `## Para la audiencia` para «una persona no
  técnica», así que el entregable de cada pieza sale de usos de primer día
  (programar una tarea en ChatGPT, ordenar el correo). Ningún filtro pregunta si
  el espectador **ya lo sabía**.
- **Hooks de molde.** La regla dura 8 (el hook dice resultado + con qué IA)
  arregló la claridad pero los dejó descriptivos, y el score léxico premia
  «pregunta + número + gratis»: «¿ChatGPT trabaja sin ti? 3 tareas gratis»,
  «¿Pagar por ordenar 117 correos? No, gratis». El mismo agente que escribe el
  hook se pone la nota, con criterios (claro, específico, conciso, destinatario)
  que no miden si a alguien le importa.
- **Redacción telegráfica.** Topes de ≤ 5 palabras en las escenas de arranque,
  ≤ 7 en el hook y reels de 20 s máximo producen «Lo midió Microsoft.», «En 18
  tareas, acertó.», «Uno con IA rinde como dos». Se pierde el por qué y el cómo.
  La voz a menudo repite el título. No hay una guía de redacción.

## El público nuevo (decidido por el usuario)

Profesional con **cargo medio** (jefe de área, coordinador, gerente de primera
línea), **no programador**, que **ya paga Claude o ChatGPT** y lo usa en el
trabajo. Tiene **algo de susto de que la IA afecte su trabajo** y le interesa el
**liderazgo en la era de la IA**.

Interpretación (del diseñador, aceptada por el usuario): el susto no es tanto
«un robot me reemplaza» como quedarse atrás frente a colegas que usan mejor la
IA, o que el rol intermedio (coordinar, revisar) pierda valor.

Consecuencias para las piezas:

- **Sofisticación = criterio, no funciones**: cuándo confiar en la IA, cómo
  revisar lo que entrega, cómo delegarle trabajo real, qué habilidades valen más
  ahora, qué dicen los estudios con sus matices.
- **El «gratis» deja de ser gancho**: esta audiencia paga.
- **El susto es tema legítimo**, tratado con datos y con algo que hacer; nunca
  alarmismo.
- Los hooks tocan **lo que está en juego en su trabajo**, no la herramienta.

## Metas

- Cada pieza enseña algo que un usuario frecuente de ChatGPT o Claude **no
  sabía**, y eso se comprueba antes de publicar.
- Hooks que nombran lo que está en juego para un profesional de cargo medio,
  elegidos por un evaluador separado entre varios candidatos.
- Cada escena tiene una idea completa (qué, y por qué o qué cambia), sin
  fragmentos telegráficos.
- Medir el paquete contra las dos semanas anteriores.

## No metas

- Carruseles animados (proyecto 2, aparte).
- Cambiar el score léxico (`src/score/virality.ts`). Ver "Decisiones del
  diseñador".
- Reescribir las referencias existentes de la base: mejoran solas a medida que
  la investigación semanal las actualiza.
- Cambiar el mix (días, formatos, arquetipos), las horas o la cantidad de piezas
  por semana. Las series sí cambian (ver punto 7).

## Anti-metas (sería un fracaso aunque funcione)

- **Alarmismo**: «te van a reemplazar», miedo sin salida. La lista `FEAR` del
  score sigue igual.
- **Jerga de programador**: el público no es dev; «agente», «API», «token»
  siguen necesitando explicación.
- **Volver a hooks que no dicen qué te llevas**: la regla 8 y la pregunta 7 del
  lector frío se mantienen. Más sofisticado no es más críptico.
- **Piezas largas que no cumplen**: más tiempo solo si se usa para explicar.
- **Temas que se sostienen sin IA**: la regla dura 6 se mantiene.

## Restricciones

- **Quién es dueño de qué** (`kb-plantilla/CLAUDE.md`): `INSTRUCCIONES.md`,
  `lector-frio.md`, `validar.mjs`, `config.json` y `reglas.json` del calendario
  son del usuario; se editan en `kb-plantilla/` en este repo y llegan a la base
  con `scripts/kb-calendario-install.sh`. Lo mismo para
  `kb-plantilla/_investigacion/` con `scripts/kb-research-install.sh`.
  `config.json` y `alcance.json` ya existen en la base y el instalador **no los
  sobrescribe**: el cambio se aplica a mano en la base (o con un paso explícito
  del instalador), con el visto bueno del usuario. Desde este repo no se toca
  `knowledge/` salvo por esos instaladores.
- **Fecha límite**: el planificador corre en la nube el **domingo 2026-10-25 a
  las 06:00** y la investigación semanal dos horas antes. Para que la semana del
  **2026-10-26** salga con las reglas nuevas, todo debe estar mergeado e
  instalado en la base antes del sábado 2026-10-24 en la noche. Si no alcanza,
  arranca la semana del 2026-11-02 y se corren todas las fechas una semana:
  el bloque `paquete` de `_calendario/config.json` (`desde`, `semanas`,
  `motivo`; sin él valen `DESDE_CALIDAD` y `SEMANAS_PAQUETE` de `validar.mjs`)
  y los `desde` de `reglas.json` en la plantilla.
- **Puerta de calidad**: `npm run typecheck && npm test` en 0, más
  `node kb-plantilla/_calendario/validar.mjs --self-test`.
- **Regla de `reglas.json`** (AGENTS.md): la PR agrega una entrada por regla
  nueva, con `desde` = primer día en que se publica con ella.
- **Riesgo**: el proyecto no toca publicación, borrado ni gasto en APIs, así que
  no exige `/codex:adversarial-review`.
- El planificador corre en la nube con la base al lado y, casi siempre, **sin el
  repo de código**: todo lo que deba saber tiene que estar en archivos de
  `_calendario/` (no en skills de `~/.claude/skills`).

## Lo decidido (por el usuario)

### 1. Público nuevo en todo el sistema

El perfil de arriba reemplaza al actual en:

- el encabezado de `kb-plantilla/_calendario/INSTRUCCIONES.md` (párrafo «La
  audiencia es…»), manteniendo español neutro con tuteo;
- los dos perfiles de `kb-plantilla/_calendario/lector-frio.md` (completo y con
  prisa), y el texto que arma `validar.mjs --lector`, si lo copia;
- `kb-plantilla/_investigacion/INSTRUCCIONES.md`: donde dice «persona no
  técnica» (elegir referencias y `## Para la audiencia`), pasa a este
  profesional. **Qué se puede hacer** pide usos de un usuario que ya domina lo
  básico, en su trabajo, con plan pago si hace falta, y agrega un campo nuevo
  **Lo que no sabe un usuario frecuente:** 1 o 2 cosas no obvias con cita `[n]`
  (un límite, un error común, un matiz de un estudio, una forma de uso que
  cambia el resultado). Motivo: la regla dura 5 prohíbe que la pieza afirme lo
  que la referencia no dice, así que la sofisticación tiene que venir de la
  investigación.
- **Para quién** de `## Para la audiencia` deja de listar «estudiante,
  emprendedor…» y nombra roles de trabajo (jefe de área, coordinador,
  gerente…).

### 2. Corte de temas (`alcance.json`)

Salen de `dentro` y pasan a `fuera`: **Creación de contenido para redes
sociales**, **Monetización con Inteligencia Artificial**, **Finanzas personales
con IA** y **Producción de contenido automatizado** (que incluye los videos con
Higgsfield y Kling como tema).

La cuenta se centra en cuatro ejes: **trabajo con IA**, **liderazgo**,
**decisiones y criterio**, **carrera frente a la IA**.

### 3. Prueba de novedad en el lector frío

Los lectores pasan a ser el público nuevo. Se agrega la **pregunta 8** a ambos:

> 8. ¿Qué aprendiste que no sabías antes de verlo? Si ya sabías todo, responde
>    "nada nuevo".

Criterio de paso: en el **lector completo** bloquea si responde "nada nuevo" o
algo que la pieza no enseña; en el **con prisa** bloquea solo "nada nuevo" (ve
solo los títulos: si ni los títulos traen algo nuevo, la pieza es básica). Se
registra como las otras en `lectorFrio.notas`.

### 4. Guía de hooks y evaluador separado

Archivo nuevo `kb-plantilla/_calendario/guia-hooks.md` (del usuario, lo instala
el instalador). Contiene:

- Qué está en juego para este público (su lugar en el equipo, el juicio de su
  jefe, el trabajo de su equipo, su tiempo, su criterio frente a la IA).
- Patrones con un ejemplo malo y uno bueno cada uno, sacados de piezas reales:
  lo que está en juego en tu trabajo, el error que comete la mayoría, el dato
  que contradice lo que crees, antes y después, la pregunta que te va a hacer tu
  jefe o tu equipo.
- La regla 8 sigue: el título o el subtítulo dice qué te llevas. El resultado
  puede ser profesional («revisar el informe que te entregó la IA en 5
  minutos»), no solo una función de la app.

Proceso nuevo en el Paso 5 del manual:

1. El planificador escribe **8 a 10 hooks candidatos** por pieza, de al menos 3
   patrones distintos.
2. Un **juez de hooks**, subagente con contexto limpio y el perfil del público
   nuevo, recibe solo los candidatos (sin tema, sin entregable) y, por cada uno,
   responde: ¿pararías el pulgar?, ¿te importa para tu trabajo?, ¿qué crees que
   te llevas? Elige el mejor y le pone nota de 0 a 10.
3. `hook.score` pasa a ser **la nota del juez**, no la propia. El umbral
   (`puerta.hookUmbral`, 8) no cambia.
4. `plan.json` guarda los candidatos y la respuesta del juez (para que el bucle
   aprenda qué patrones ganan). El validador exige que estén.

El mensaje al juez lo genera el código, igual que hoy el del lector frío
(`validar.mjs --juez <semana> <id>` o equivalente).

### 5. Guía de redacción

Archivo nuevo `kb-plantilla/_calendario/guia-redaccion.md` (del usuario, lo
instala el instalador). Contiene:

- **Cada escena es una idea completa**: quién o qué, hace qué, y por qué
  importa o qué cambia. Prohibidos los fragmentos sin verbo o sin consecuencia.
- **Los números llevan contexto**: quién lo midió, a cuántos, comparado con
  qué. «758 consultores lo probaron» no basta; dice qué pasó.
- **La voz explica, no lee**: nunca repite el título; da el detalle o el porqué.
- **La prueba del "¿y?"**: si al leer la escena alguien puede preguntar "¿y?",
  falta la consecuencia.
- Pares **mal → bien** con frases reales de la semana 2026-10-19.
- Una lista de chequeo corta que el planificador aplica a cada pieza antes del
  lector frío.

El manual (Paso 5) remite a la guía y la vuelve obligatoria.

### 6. Más espacio para explicar

- **Reels**: `puerta.duracionMaxSegundos` sube de **20 a 35**. El hook sigue a
  ≤ 3 s y con la promesa completa (lo que retiene en los primeros segundos no
  se toca). El espacio extra es para escenas del medio y narración más completa.
  Se actualizan en el manual la orientación de "Tope de duración del reel" y las
  "reglas prácticas" de palabras por escena para el medio.
- **Carruseles**: llevan el contenido más denso. El tope de cuerpo de carrusel
  sube (ver "Decisiones del diseñador" para el valor) y el manual les pide
  profundidad: el porqué, el matiz del estudio, el ejemplo de trabajo.

### 7. Series de reels reenfocadas al público nuevo

Decisión del usuario: se reemplaza `gratis-vs-pago` por una serie de criterio y
se ajustan las otras dos. Tabla del Paso 4 del manual:

| Día | Serie | Qué es |
|---|---|---|
| Lunes y jueves | `hazlo-con-ia` | «Hazlo con IA»: una **tarea de trabajo** de un jefe de área (preparar una reunión 1:1, revisar un informe, dar feedback, priorizar la semana del equipo) resuelta en pantalla, con el prompt con contexto que la hace salir bien y el porqué de ese contexto. Lunes: paso a paso; jueves: el resultado primero, luego cómo. |
| Miércoles | `criterio` (nueva) | «Confía o revisa»: una situación de trabajo donde la IA acierta o falla, la regla para decidir cuándo confiar, con el dato de una referencia. Destinatario: «mándaselo a quien firma lo que le entrega la IA sin revisarlo». Arquetipo `compartible`. |
| Sábado | `lo-probe-por-ti` | «Lo probé por ti»: una herramienta o función nueva probada **en una tarea de trabajo real**, con veredicto: ¿le sirve a un jefe de área y para qué? No el video con IA como espectáculo. |

Decisiones del diseñador sobre las series: `hazlo-con-ia` y `lo-probe-por-ti`
**conservan su id** (cambia la descripción, no el nombre) para que el bucle siga
comparando la serie en el tiempo; «en 20 s» sale del nombre porque el tope pasa
a 35 s. El validador acepta `criterio` y deja de aceptar `gratis-vs-pago` para
semanas desde el 2026-10-26. Entrada nueva en `reglas.json`: `series-publico-
profesional` (`reel`).

### 8. Medición

Todo entra junto, así que se mide **como paquete**: las dos semanas desde el
2026-10-26 contra las dos anteriores, con el antes/después de `reglas.json` que
ya calcula el bot. Señales: guardados, envíos y seguidores nuevos por cada 100
de alcance, y retención media de reels (comparando solo piezas de alcance
parecido, `aprendizajes.md` 2026-10-18). Evaluación el **2026-11-09**.

### 9. `reglas.json`

Una entrada por regla, `desde` = `2026-10-26` (o el lunes en que realmente
arranque):

- `publico-profesional-ia` (formato `null`): público nuevo en planificador,
  lector frío e investigación, y corte de temas.
- `lector-novedad-p8` (`null`): pregunta 8 del lector frío.
- `hook-juez` (`null`): candidatos y juez separado de hooks.
- `guia-redaccion` (`null`).
- `reel-35s` (`reel`): tope de 35 s.
- `carrusel-denso` (`carrusel`): tope de cuerpo mayor en carruseles.

## Decisiones del diseñador (revisables)

- **Score léxico sin cambios.** Premia «gratis» en el hook, pero tocarlo cambia
  la calibración. Si en las dos semanas el score (≥ 75, revalidado en el Mac)
  rechaza piezas que el juez y el lector aprobaron, se revisa en otra PR.
- **Temas que no se nombraron**: «Marketing y diseño de conversión» pasa a
  `despues` (un gerente de marketing puede ser público, pero no es eje).
  «Herramientas de desarrollo open source» pasa a `fuera` (el público no es dev).
  «Avances en inteligencia artificial» se queda en `dentro` (las noticias siguen,
  con el tope de una por semana). «Emprendimiento y startups» se queda en
  `despues`.
- **Carrera frente a la IA** no tiene página propia en `temas/`. En vez de crear
  un tema nuevo, se cubre desde los que ya existen (Liderazgo, Productividad,
  Modelos mentales, Psicología del comportamiento) y su `enfoqueIA`. Se agrega
  al `enfoqueIA` de Liderazgo y de Productividad el ángulo «qué pasa con tu rol
  y tus habilidades cuando la IA hace parte del trabajo», y se pide en
  `pedidos.md` investigar estudios sobre empleo y habilidades frente a la IA.
- **Los slides `Clip` (video generado) siguen permitidos** como imagen dentro de
  una pieza de los cuatro ejes; lo que sale es el video con IA *como tema*. El
  límite `hookVideoMaxSemana` no cambia.
- **Tope de cuerpo de carrusel: 50 palabras** (hoy `cuerpoMaxPalabras` = 30 para
  todo). Se agrega un parámetro propio para carrusel en `config.json → puerta`
  en lugar de subir el general, para que los reels no cambien. Bullets siguen en
  12.
- **Pregunta 8 en los dos lectores** existentes en vez de un tercer lector: al
  cambiar el perfil al público nuevo, los lectores ya son "colegas que usan IA".
- El planificador usa las guías como archivos de `_calendario/`, no como skills
  de Claude Code: corre en la nube sin `~/.claude/skills`. Si después se quiere
  un skill local para escribir a mano, se arma desde las mismas guías.

### Resueltas tras la revisión del constructor (decisiones del diseñador)

- **`alcance.json`: la base manda.** El `alcance.json` de la base ya tiene
  Liderazgo, Modelos mentales y Psicología en `dentro`, y Comunicación y
  Storytelling en `fuera`; la copia de `kb-plantilla/_investigacion/` está
  desactualizada. Se edita el de la base (corte de arriba) y se sincroniza la
  copia de la plantilla con él en la misma PR.
- **Experimentos suspendidos dos semanas.** Las semanas del 2026-10-26 y del
  2026-11-02 el experimento es el paquete: el planificador no declara otro
  experimento ni usa `parametros` para pisar topes (`duracionMaxSegundos`,
  ritmo). El manual lo dice con fecha de vencimiento y el validador lo acepta
  (experimento vacío con motivo «paquete calidad-contenido»).
- **De dónde sale la novedad la primera semana.** El campo nuevo de la
  referencia se **prefiere**, no se exige: la novedad puede salir de cualquier
  sección con cita (Límites, Evidencia, Novedades, el matiz de un estudio). El
  validador de la investigación exige el campo nuevo solo en notas con
  `revisado` ≥ 2026-10-25 (como `DESDE_AUDIENCIA`). Se pide en `pedidos.md` que
  la corrida del 2026-10-25 priorice actualizar las referencias de los cuatro
  ejes.
- **Si el juez no aprueba ningún hook** (todos < 8): una ronda más de 8 a 10
  candidatos, que cuenta para `reescriturasMax`; si tampoco, la pieza se quita y
  queda el hueco (igual que hoy con el lector frío). El candidato es el paquete
  completo de portada: `title` + `subtitle`, y en reels también `resultado`. El
  hook publicado es exactamente el que eligió el juez; el validador lo compara.
- **Riesgo del score léxico.** Antes del merge se calcula el score de tres
  piezas de ejemplo escritas con las guías nuevas. Si alguna cae bajo 75 solo
  por el hook (falta de «gratis»/«sin»/«no»), en esta misma PR se amplía la
  lista de tensión del hook en `src/score/virality.ts` con palabras de lo que
  está en juego para este público («tu jefe», «tu equipo», «error», «revisa»).
  Si no hace falta, el score no se toca.
- **Aplicar los cambios en la base**: procedimiento manual, no un paso nuevo del
  instalador. Tras el merge, el constructor prepara el diff de `config.json` y
  `alcance.json` de la base, el usuario lo aprueba y se commitea. La plantilla
  `config.json` del repo se actualiza en la misma PR.

## Lo que queda al constructor

- El texto exacto de las dos guías (con los pares mal → bien de la semana
  2026-10-19 y los patrones de arriba).
- Cómo valida `validar.mjs` los candidatos y la respuesta del juez (forma del
  JSON, cuántos campos exige), y cómo genera el mensaje del juez.
- Los ajustes al ejemplo y al esqueleto de `plan.json` del manual, y al
  `--self-test`.
- Los ajustes a la orientación de duración y palabras por escena para 35 s.
- Tests nuevos que cubran: la pregunta 8 en el criterio, la exigencia de
  candidatos y juez, el tope de cuerpo de carrusel y el tope de 35 s.

## Terminado

- `npm run typecheck && npm test` en 0, con los tests nuevos.
- `node kb-plantilla/_calendario/validar.mjs --self-test` en ✓.
- PR abierta desde `claude/calidad-contenido` con las entradas de `reglas.json`.
- Después del merge y con el visto bueno del usuario: instaladores corridos y
  `config.json` / `alcance.json` de la base actualizados antes del sábado
  2026-10-24 en la noche.

## Efecto sobre otras decisiones en curso

El 2026-11-02 está prevista la evaluación del pivote de formato de reels del
2026-10-17. Con este paquete entrando el 2026-10-26, esa evaluación tendrá una
semana contaminada: conviene evaluarla con las semanas del 2026-10-19 y
anteriores, o moverla.
