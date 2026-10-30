# Investigación por etapas para el coaching — diseño

Fecha: 2026-10-29. Sale de un ejercicio de foresight sobre la investigación, hecho en conversación con
Felipe y continuación del pivote del 2026-10-28 (`informes/foresight-instagram-2026-10-28.md`,
`docs/superpowers/specs/2026-10-28-pivote-coaching-design.md`). Lo que dijo Felipe va como
**decisión**; lo demás es criterio de quien escribe este diseño y va marcado *(propuesta)*.

## Por qué

La cuenta pasó a ser una vitrina de coaching. Las personas de la red de Felipe le piden que las
acompañe a **adaptar su perfil a un mundo laboral con IA**: adoptar las herramientas, liderar y
cambiar los modelos mentales (decisión). La investigación semanal, en cambio, sigue armada para el
modelo anterior:

- Recorre temas sueltos (máximo 6 por semana) y escribe para «un profesional de cargo medio que ya
  paga Claude o ChatGPT». El público nuevo está en nivel cero: no sabe por dónde partir y le da miedo.
- Guarda **referencias aisladas** (una nota por estudio, herramienta o método) y no cruza lo que
  dicen varias fuentes.
- Lo que la gente pregunta en las sesiones no vuelve a la investigación.
- Dos temas con material acumulado y que calzan con el coaching están fuera del alcance:
  «Desarrollo de habilidades y carrera profesional» (28 fichas) e «Ingeniería de agentes de IA» (26).

Felipe quiere **mucha información para generar contenido, que lo publicado sea útil de verdad y que
la base conecte puntos entre estudios, videos y posts** (decisión). Le importa mucho que la
investigación quede bien (decisión).

## Objetivos

1. Que la investigación respalde un **camino de cuatro etapas**, el mismo que recorrería una
   persona en coaching (decisión: «exactamente»):
   1. `perder-el-miedo`: qué es un agente, pedirle a la IA que te diga cómo ayudarte, la primera
      tarea que conviene delegar.
   2. `adoptar`: qué partes del trabajo absorbe la IA y cuáles no, con casos de oficina contados
      enteros.
   3. `liderar`: cómo cambia coordinar un equipo cuando ejecutar sale barato.
   4. `revalorizarse`: qué habilidades suben de valor a cinco años.
2. Que cada hallazgo lo **entienda una persona que está aprendiendo** (decisión). Los datos y las
   fuentes sí van, siempre que se expliquen bien (decisión).
3. Que la base **conecte puntos**: notas que juntan varias referencias de fuentes distintas y
   sostienen una idea que ninguna dice sola.
4. Que lo que se pregunte en las sesiones vuelva al ciclo como pedido de investigación.
5. Llenar hoy el banco de las cuatro etapas con una **tanda intensiva**, y después mantenerlo con la
   rutina semanal (decisión: «un mix», «una tanda intensiva hoy»).

## No objetivos

- No cambia lo que se publica ni su volumen (3 piezas por semana del pivote).
- No cambia el bot del servidor ni el render.
- No lee el texto de los DMs: el conteo de «PARTIR» no guarda texto (PR anterior, a propósito). Las
  preguntas entran a mano, por Felipe.
- No reescribe todas las referencias existentes (175): solo las de temas `dentro` que se usen.

## Anti-objetivos (fracasaría aunque funcione)

- Notas que solo un experto entiende: siglas, porcentajes apilados, jerga sin explicar. El ejemplo
  que Felipe rechazó por «bien complejo»: «Harvard/BCG +25 % dentro de la frontera y −19 pp fuera +
  P&G + desentrenamiento». La versión que sí sirve: «La IA te ayuda más en lo que ya sabes hacer: si
  le pides algo que sabes revisar, terminas más rápido; si no lo sabes revisar, te puede llevar a un
  error sin que lo notes. Prueba esta semana: dale una tarea que hagas seguido y revisa tú el
  resultado».
- Conexiones inventadas: una idea que no se sostiene con lo que dicen las fuentes citadas.
- Volumen sin calidad: notas que pasan el validador pero no dejan nada que hacer.
- Romper lo que ya funciona: las zonas del agente, las citas `[n]`, el validador con `--desde`, el
  planificador del domingo 06:00.

## Diseño

### 1. Alcance (archivo del usuario, cambio autorizado por Felipe)

`kb-plantilla/_investigacion/alcance.json`:

- «Desarrollo de habilidades y carrera profesional» e «Ingeniería de agentes de IA» pasan a `dentro`
  (decisión).
- *(propuesta)* «Desarrollo de habilidades y carrera profesional» entra con `enfoqueIA` («qué
  habilidades suben o bajan de valor cuando la IA hace parte del trabajo, y cómo se desarrollan»),
  para que no se llene de consejos de carrera sin IA. «Ingeniería de agentes de IA» entra sin
  `enfoqueIA`: siempre es IA, pero se investiga explicado para alguien que no programa y respalda la
  serie «Lo que construí».
- *(propuesta)* Clave nueva `etapas`: los cuatro ids de arriba, cada uno con una descripción de una
  línea que el agente usa para clasificar.

Como `alcance.json` no se sobrescribe al instalar (es del usuario), la instalación de esta PR lo
copia de forma explícita una vez, con la autorización de Felipe.

### 2. Etapa en cada referencia

- *(propuesta)* Frontmatter nuevo `etapa:` en `referencias/*.md`: uno o más ids de
  `alcance.json → etapas` (`etapa: [adoptar, liderar]`).
- Obligatorio desde `DESDE_ETAPAS` (la fecha de instalación) en toda nota que aplica a la cuenta.
  Las que dicen «No aplica a la cuenta» no lo llevan. El validador revisa que los ids existan.

### 3. «Dicho simple» y el público nuevo

- El perfil de público del Paso 3 del manual pasa a ser el del planificador desde el 2026-11-02: una
  persona de cargo medio, no programadora, que nunca usó la IA más allá de una pregunta suelta, no
  sabe por dónde partir y siente algo de miedo de quedarse atrás.
- `## Para la audiencia` suma un primer rótulo `- **Dicho simple:** …` desde `DESDE_ETAPAS`. Es la
  idea en palabras de oficina, para alguien que está aprendiendo: una sola idea, cada dato explicado
  («de cada 10 consultores, …»), cero siglas sin explicar y al final una acción para esa semana. Va
  con su `[n]`. El validador revisa que exista, que cite y que tenga ≤ 400 caracteres *(propuesta de
  tope)*.
- El rótulo «Lo que no sabe un usuario frecuente» deja de calzar con el nivel cero. Desde
  `DESDE_ETAPAS` se reemplaza por «Lo que no sabe quien está empezando»: algo que sorprende a quien
  parte y le quita el miedo. Las notas con `revisado` anterior siguen válidas con el rótulo viejo.
  *(propuesta)* `guia-redaccion.md` del planificador, que cita el rótulo viejo, se actualiza para
  aceptar los dos.
- El resto de los rótulos (`Por qué importa`, `Qué se puede hacer`, `Para quién`, `Límites`) se
  mantiene.

### 4. Lector aprendiz (evaluador separado)

Es el mismo principio del lector frío del planificador: el que escribe no se pone nota.

- Archivo nuevo del usuario, `_investigacion/lector-aprendiz.md` (protegido, igual que el manual).
  Contiene el perfil del público de arriba y cuatro preguntas:
  1. ¿Qué entendiste, en tus palabras?
  2. ¿Qué harías esta semana después de leerlo?
  3. ¿Qué palabra o frase del texto no entendiste?
  4. ¿Qué te faltaría saber para hacerlo de verdad? (no bloquea; ajuste del 2026-10-29 tras la
     primera corrida, donde las 17 notas se cayeron por dudas prácticas como «dónde se abre Gemini»
     aunque las respuestas 1 y 2 mostraban que se habían entendido)
  Respuesta en JSON, como el lector frío.
- `node _investigacion/validar.mjs --aprendiz <slug>` imprime el mensaje exacto para el subagente:
  el perfil, las preguntas y solo el texto de `Dicho simple` y `Qué se puede hacer`, sin `[n]`,
  nombre de archivo ni tema.
- Criterio de paso, que evalúa el agente: (1) coincide con la idea de la nota, (2) nombra una acción
  concreta, (3) no nombra una palabra del texto que no entendió. Si no pasa, se reescriben esos rótulos, hasta 3
  intentos. Al tercero que falla, la nota no se sube (se descarta lo escrito en esa corrida) y se
  nombra en el resumen.
- Registro: frontmatter `aprendiz: <HOY>` (la fecha en que pasó). Desde `DESDE_ETAPAS` el validador
  exige `aprendiz` igual a `revisado` en toda nota que aplica a la cuenta. Es autodeclarado, igual
  que `lectorFrio.resultado` del planificador.
- La rutina de la nube necesita la herramienta `Task` en `allowed_tools`, como la tiene el
  planificador. Hoy solo tiene Bash, Read, Write, Edit, Glob, Grep, WebSearch y WebFetch. Se agrega
  con `RemoteTrigger update`, y el prompt de la rutina menciona el lector aprendiz con subagentes
  usando Agent/Task.

### 5. Conexiones

- *(propuesta)* Tipo nuevo `conexion` en `TIPOS`, guardado en `referencias/`. Así cuenta como
  «referencia lista» para el planificador sin tocar su validador, ni las zonas, ni el bot (que ya
  indexa `referencias/`).
- Frontmatter extra: `conecta: ["[[slug-a]]", "[[slug-b]]", "[[slug-c]]"]`, con **≥ 3** referencias
  que existen en `referencias/` y no son a su vez conexiones. Sus `fuentes` vienen de **≥ 2 dominios
  distintos** (que de verdad cruce fuentes, no tres páginas del mismo sitio).
- Secciones: `## Qué es` (la idea en una frase), `## Datos clave` (qué aporta cada pieza conectada,
  con `[n]`), `## Cómo se conectan` (por qué juntas dicen algo que solas no dicen) y
  `## Para la audiencia` (con `Dicho simple`, etapa y lector aprendiz como cualquier nota).
- Puede conectar estudios, videos, posts y fichas: lo que dice un video o un post se cita con su URL
  original en `fuentes`, nunca a través de la ficha.
- Regla del manual: una conexión no afirma nada que sus fuentes no digan. La idea nueva es la
  relación entre las piezas; si es interpretación propia, va marcada `(propuesta, sin fuente)`, como
  hoy.
- Cada corrida, por cada tema investigado, intenta 1 o 2 conexiones con las referencias del tema y
  de otros temas `dentro`.

### 6. Preguntas de las sesiones

- Archivo nuevo del usuario, `_investigacion/preguntas.md` (protegido, se instala solo si no
  existe, como `pedidos.md`). Una línea por pregunta: `- AAAA-MM-DD · <etapa> · <pregunta tal como
  la hicieron>`, sin nombres de personas.
- Una pregunta está **pendiente** si ninguna nota de `referencias/` la lista en el frontmatter
  `responde:` (la línea copiada tal cual). El agente atiende hasta 3 preguntas pendientes por
  corrida, con una referencia o una conexión que la responda. La respuesta va en `Dicho simple`.
- Validador: cada línea de `responde:` existe tal cual en `preguntas.md`.

### 7. Nuevo orden de la rutina semanal (Paso 2 del manual)

1. Pedidos pendientes (como hoy).
2. Preguntas pendientes de `preguntas.md`: sus temas.
3. `candidatos.json` del planificador (como hoy).
4. **La etapa con menos cobertura** (ver la sección 8): temas `dentro` que la alimentan, con
   fichas nuevas primero.
5. El resto de `dentro` y `despues`, como hoy.

El máximo sigue siendo 6 temas y 8 referencias por tema.

### 8. Cobertura por etapa

`node _investigacion/validar.mjs --cobertura` imprime por etapa: referencias listas (aplican a la
cuenta, `revisado` ≤ 60 días, con `etapa`, `Dicho simple` y `aprendiz`), conexiones listas y
preguntas pendientes, y marca las etapas que no llegan a la meta. La usan la rutina (Paso 2.4) y la
tanda intensiva para decidir qué falta.

*(propuesta)* Meta por etapa: **≥ 8 referencias listas y ≥ 3 conexiones listas.**

### 9. Tanda intensiva de hoy

- Usa la «corrida extra» que el manual ya admite: la misma rutina de la nube, lanzada con
  `RemoteTrigger run` y una lista de temas o de referencias a completar en el mensaje. Corre con
  las mismas reglas (zonas, citas, lector aprendiz, validador, push a `main`).
- Loop desde esta sesión: lanzar una corrida, esperar que termine, revisar el resultado (log de la
  corrida, `validar.mjs` en un clon fresco, `--cobertura`, y una lectura propia de 3 notas al azar
  con la vara de los anti-objetivos), armar la lista de la siguiente corrida con lo que falte, y
  repetir.
- Primera corrida: **completar** las referencias listas que más se usan de los temas `dentro`
  (sumarles etapa, Dicho simple y lector aprendiz). Siguientes: temas nuevos (los dos que entran al
  alcance) y luego conexiones por etapa.
- Termina cuando todas las etapas llegan a la meta de cobertura, o a las **5 corridas** *(propuesta
  de tope)*, lo que pase primero. Si una corrida falla o no sube, se diagnostica antes de lanzar la
  siguiente.
- Riesgo de choque: la rutina semanal es el domingo 2026-11-01 a las 04:00 y el planificador a las
  06:00. La tanda tiene que terminar antes.

### 10. Planificador (cambio mínimo)

*(propuesta)* En `kb-plantilla/_calendario/INSTRUCCIONES.md`, Paso 3: para `por-donde-partir`
preferir referencias con etapa `perder-el-miedo` o `adoptar`, y conexiones cuando las haya. Al
redactar, partir del `Dicho simple`. Lleva su entrada en `kb-plantilla/_calendario/reglas.json`
(`desde` 2026-11-02, igual que el resto del paquete del pivote, para que el bucle no lo mida como
un experimento aparte).

## Restricciones

- Zonas del agente sin cambios: `referencias/`, `_investigacion/` (salvo los archivos protegidos),
  `CLAUDE.md` y los bloques `kb:research`.
- Archivos protegidos nuevos: `_investigacion/lector-aprendiz.md` y `_investigacion/preguntas.md`.
- El validador sigue sin dependencias (node a secas). Todo cambio con fecha de corte para no
  invalidar notas viejas.
- Puerta de calidad: `npm run typecheck && npm test`, con tests nuevos en `test/kb.ts` para cada
  regla nueva del validador.
- Riesgo: la PR toca la rutina que escribe en la base y cambia su prompt y sus herramientas. Pide
  `/codex:adversarial-review` antes del merge (AGENTS.md).
- Instalación con `scripts/kb-research-install.sh` (que pasa a copiar también `lector-aprendiz.md`
  y a crear `preguntas.md` si no existe), más la copia explícita de `alcance.json` de esta vez.

## Respuestas a la revisión del diseño

- **Orden:** primero la PR, la revisión adversarial, el merge y la instalación; después la tanda.
  La tanda no corre con código sin mergear *(decisión de quien escribe)*. Si al sábado 2026-10-31 a
  las 23:00 (hora de Chile) no terminó, se corta y el domingo sigue la rutina normal: no se pausa la
  rutina del domingo.
- **Cuáles son las «más usadas»:** las referencias que citan los calendarios de `_calendario/<semana>/`
  (rutas `referencias/…` en `plan.json` y en los borradores). Si son menos de 30, se completa la
  lista con las referencias de temas `dentro` de `revisado` más reciente *(decisión de quien
  escribe)*.
- **Completar una nota vieja** es lo que el manual ya define: volver a verificar sus datos clave
  contra las fuentes, sumar etapa, `Dicho simple`, lector aprendiz y el rótulo nuevo «Lo que no sabe
  quien está empezando» en lugar del viejo, y subir `revisado` a `<HOY>`.
- **`DESDE_ETAPAS`** es el día anterior a la instalación, por la misma razón que `DESDE_AUDIENCIA`:
  las corridas nocturnas fechan con la hora de Chile.
- **Los dos temas nuevos** existen como páginas en `temas/` («Desarrollo de habilidades y carrera
  profesional.md» e «Ingeniería de agentes de IA.md»), con 28 y 26 fichas.

## Qué queda para quien construye

- Redactar el manual nuevo y `lector-aprendiz.md` siguiendo este diseño y el estilo del manual
  actual.
- Cómo el validador encuentra el `Dicho simple` y lo recorta para el mensaje del lector.
- El formato exacto de salida de `--cobertura`.
- Actualizar `kb-plantilla/CLAUDE.md`, que describe `referencias/` con el público viejo.

## Cómo se sabe que quedó bien

- `npm run typecheck && npm test` en verde, con tests que cubren: etapa, Dicho simple, el rótulo
  nuevo con fecha de corte, conexion (≥ 3 `conecta` existentes, ≥ 2 dominios), `aprendiz`,
  `responde:`, los archivos protegidos nuevos, `--aprendiz` y `--cobertura`.
- Una corrida real de la rutina después de instalar, que pasa el validador y deja al menos una
  conexión y una nota con lector aprendiz aprobado.
- Al cierre de la tanda: `--cobertura` muestra las cuatro etapas en la meta, o el resumen dice cuál
  quedó corta y por qué.
