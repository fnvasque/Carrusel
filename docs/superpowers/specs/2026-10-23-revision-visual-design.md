# Revisión visual de lo renderizado en el Mac — diseño

Fecha: 2026-10-23 · Rama: `claude/revision-visual` · Se ejecuta en un worktree aparte.

## Intención y por qué

En las entrevistas del 2026-10-22, el usuario oyó que el wording era malo. También ha visto
piezas publicadas con **malos espaciados** y con **imagen y texto que no funcionan juntos**. El
filtro de calidad (lector frío, juez y guías) solo lee texto, porque el planificador escribe en la
nube antes de que el Mac renderice. Hoy nadie mira la pieza tal como se publica.

Revisando 3 carruseles y 4 reels ya renderizados (2026-10-23) aparecieron seis problemas:

1. **Las tildes chocan con la línea de arriba.** En «Guárdalo para tu próximo video»
   (`sab-reel-narra-sin-tu-voz`, Cta) la tilde de PRÓXIMO pisa la R de PARA y se lee «PABA».
   Causa: el titular display va en Anton mayúscula con `line-height` 0.98–1.0 (Hook, Cta, Clip,
   Step, Screen, Prompt).
2. **Espacio antes de la puntuación.** Sale «SEEDANCE ,» (`vie-pm-reel-kling-vs-seedance`). La
   hipótesis: en el reel, `SplitText` (`src/reel/runtime.js` ~l.256) separa el `highlight` y la coma,
   que están en nodos distintos (`src/templates/highlight.tsx`). No hay test del DOM después de
   SplitText.
3. **Dos textos encimados en una transición.** El reel de Kling tiene un cuadro con «$400 vs
   $1.100» y el titular anterior visibles a la vez. La salida de una escena y la entrada de la
   siguiente se solapan durante `T.transition` (0,3 a 0,5 s, `timing.ts`).
4. **Una escena muestra solo el número.** El «3» de un Step queda solo cerca de 2 s antes de su
   heading. El stagger del código no explica ese hueco: hay que reproducirlo.
5. **Composición cargada arriba.** El contenido queda en el tercio superior y la mitad de abajo
   vacía. Parte de eso es la zona segura de Instagram (`REEL_SAFE_BOTTOM` = 440), y parte no.
6. **Fondo que compite con el texto o no tiene que ver con la pieza.** Ejemplos: una persona en
   una pieza oscura en «Narra videos sin tu voz», una mano robótica difusa en «6 preguntas» y un
   subtítulo sobre la zona más cargada de la foto en Kling.

El usuario pidió que **la pieza se corrija y que el sistema aprenda**. Tras el challenge
adversarial aceptó hacerlo **por fases**:
- los problemas 1 a 5 son errores del motor y se arreglan en el código, con comprobaciones exactas;
- el problema 6 es de gusto: lo mira un revisor con IA, primero solo como aviso, y se mide cuánto
  acierta antes de dejarlo corregir.

## Metas

- Ninguna pieza publicada con los problemas 1 a 4, y los 5 casos reales de arriba corregidos.
- Comprobaciones exactas en el render que atrapen esos errores si vuelven: tests y QA del Mac.
- Un revisor visual que avise por Telegram del problema 6, con registro de aciertos para decidir la
  fase 3 con datos.
- Que lo encontrado quede registrado para el bucle: problemas por tipo y por semana.

## No metas

- Que el revisor con IA bloquee piezas o regenere imágenes (fase 3, decisión futura con datos).
- Rediseñar las plantillas o la identidad visual.
- Revisar audio, voz o música.
- Carruseles animados (es otro proyecto y otro worktree).

## Anti-metas (sería un fracaso aunque funcione)

- **Días vacíos por falsos positivos.** Ninguna comprobación nueva bloquea una pieza sin haber
  pasado limpia sobre el corpus de piezas reales (ver Restricciones).
- **Gasto en APIs sin tope.** El revisor visual tiene un tope de llamadas por pieza y por semana.
  Nunca regenera fondos.
- **Mover texto a la zona que tapa Instagram** para «equilibrar» la composición.
- **Más reglas en el manual del planificador por casos sueltos.** Una propuesta de regla exige al
  menos 3 casos del mismo tipo en 2 semanas distintas.

## Restricciones

- **El render corre en el Mac** (`src/calendario/render.ts`, launchd cada hora) y solo toma piezas
  cuya hora aún no llegó. Nunca renderiza tarde. Cualquier comprobación nueva entra en ese flujo y
  respeta ese plazo.
- **Clasificación de errores en `render.ts`:**
  - `ErrorContenido` deja `render.json` en `fallido`, es terminal y hoy no avisa desde el Mac.
  - Un error de entorno avisa por Telegram y se reintenta.
- **Clave disponible en el Mac:** solo `OPENAI_API_KEY` (`Carrusel-render/.env`). No hay clave de
  Anthropic ni de OpenRouter.
- **Corpus de regresión:** los borradores de `knowledge/_calendario/2026-10-05`, `2026-10-12` y
  `2026-10-19` (solo lectura). Los renders publicados están en
  `~/Documents/Claude/Carrusel-render/output/calendario/<semana>/<id>/`.
- **Puerta:**
  - `npm run typecheck && npm test` siempre;
  - además `npm run test:reel`, porque esto toca render y reels (Chromium y ffmpeg; no correr
    `playwright install`).
- **Riesgo:** esto no toca la publicación en Meta, pero sí decide qué se publica. Pide
  `/codex:adversarial-review` antes del merge de la fase 1 (AGENTS.md: cambios de riesgo).
- **`reglas.json`:** una entrada por fase que cambie la puerta, con `desde` = primer día publicado
  con ella.

## Lo decidido (por el usuario)

- Hacerlo **por fases**, en el orden 1 → 2 → 3, con la fase 3 sujeta a los datos de la fase 2.
- Una pieza con un problema visual **se corrige**; el sistema **aprende** de lo que encuentra.

### Fase 1 — Arreglar el motor y comprobar exacto

**Arreglos:**
- **Tildes:** que ninguna tilde ni la Ñ de una línea en mayúscula toque la tinta de la línea de
  arriba, en todas las plantillas con titular Anton.
- **Puntuación:** después de `SplitText`, ningún espacio entre una palabra y la puntuación que la
  sigue, tanto en el post como en el reel.
- **Transición:** que en ningún momento haya dos textos de escenas distintas visibles a la vez y
  encimados.
- **Número solo:** reproducir el «3» solo y corregir la causa, de modo que ningún número de paso
  quede visible sin su heading más que un instante.
- **Zonas seguras:** sumar al test de layout el límite superior (`REEL_SAFE_TOP`), además del
  inferior que ya existe. Que la franja de QA de `qa.ts` (~l.166) salga de las constantes de
  `layout.ts` y no de números repetidos.

**Comprobaciones exactas, que corren en el render:**
- En **carruseles**, sobre el DOM de cada slide.
- En **reels**, sobre el DOM en varios instantes de la timeline: el estado final de cada escena,
  la mitad de cada transición y los primeros 0,3 s de cada escena.

Cada una produce un motivo legible (por ejemplo `visual: tilde de «PRÓXIMO» pisa la línea
anterior en Cta`).

**Si una comprobación falla en una pieza:**
- La corrección de fondo va en el motor, como se describe arriba. No hay arreglos pieza por pieza.
- La única corrección automática por pieza es la que ya existe: si con el interlineado nuevo un
  titular ya no cabe, `fitDisplaySize` lo achica dentro de su margen.
- Si aun así una comprobación falla, la pieza queda `fallido` con su motivo y **el Mac avisa por
  Telegram**. Eso último es nuevo: hoy un `fallido` del Mac no avisa.

**Activación:** las comprobaciones bloquean solo cuando el corpus de regresión de 3 semanas
renderiza limpio. Hasta entonces, en ese mismo desarrollo, avisan y no bloquean.

### Fase 2 — Revisor visual, solo como aviso

- **Cuándo corre:** después de que la pieza pasa la fase 1 y el QA.
- **Qué mira:**
  - en un carrusel, la portada y cada slide con fondo de imagen;
  - en un reel, la portada y los cuadros en 0 s, 1 s y el estado final de cada escena con fondo
    de imagen o clip.
- **Lo que evalúa:** una lista fija de dos preguntas.
  - ¿El fondo compite con el texto, o deja alguna parte del texto difícil de leer?
  - ¿El fondo tiene que ver con lo que dice la pieza?

  Responde un JSON con un veredicto por imagen y una frase.
- **Qué hace con un «no»:** la pieza se publica igual. El Mac manda a Telegram (`sendPhoto`) la
  imagen con la observación del revisor y **dos botones inline** (decisión del usuario):
  «Tenía razón» y «No». Esto obliga a cambiar el bot del servidor. El flujo:
  - **Mac:** manda el aviso con `callback_data` `cal-visual:<semana>:<id>:<n>:si|no`. Si no cabe en
    64 bytes, usa la huella del id, igual que el botón Saltar que ya existe
    (`callbackSaltar`, `src/calendario/telegram.ts` ~l.258).
  - **Bot del servidor** (`src/calendario/telegram.ts`, desplegado en Docker según
    `deploy/README.md`): atiende ese callback, responde al toque («Anotado») y agrega una línea a
    `_calendario/<semana>/visual-respuestas.jsonl` en la base. Es un archivo solo del bot.
  - **Mac:** escribe su propio `_calendario/<semana>/visual.json` con los veredictos del revisor.
    Cada archivo tiene un solo escritor, así que no hay conflictos en git.
  - **Despliegue:** el cambio del bot se despliega en el servidor después del merge, con el
    procedimiento de `deploy/README.md`. Ese paso lo confirma el usuario.
- **Registro:** el bucle cruza `visual.json` con `visual-respuestas.jsonl` por pieza e imagen e
  informa la precisión semanal del revisor: la fracción de «Tenía razón» sobre los avisos
  respondidos.
- **Duración:** 2 a 3 semanas, o hasta tener 30 avisos con respuesta del usuario.

### Fase 3 — Corrección automática acotada (decisión futura)

Solo si en la fase 2 el revisor acierta al menos el 80 % de las veces en lo que marca, con 30
avisos o más: ante un «no», quitar el fondo de esa slide y re-renderizar con el fondo liso. Nunca
regenerar la imagen ni bloquear la pieza. Esta fase no se implementa ahora; el diseño solo la deja
prevista.

### Aprendizaje

- **Registro común:** las fases 1 y 2 escriben sus hallazgos en el mismo registro, por tipo
  (`tilde`, `puntuacion`, `transicion`, `numero-solo`, `zona`, `fondo-compite`, `fondo-ajeno`).
- **Qué hace el bucle semanal con eso:**
  - un tipo de fase 1 que reaparece después del arreglo indica un error de código: avisa;
  - un tipo de fase 2 con al menos 3 casos en 2 semanas propone una regla en `aprendizajes.md`.
    Ejemplo: «sin fondos con personas en piezas de herramienta». La aplica el usuario.

## Decisiones del diseñador (revisables)

- **Modelo del revisor:** uno de visión de OpenAI con la `OPENAI_API_KEY` que ya está en el Mac,
  para no agregar secretos. Si después se quiere Claude, hay que sumar una clave al `.env` del
  render.
- **Topes del revisor:** máximo 12 imágenes por pieza y 120 por semana. Si se pasa, salta el
  revisor y anota «sin revisar».
- **Archivos del registro:**
  - `_calendario/<semana>/visual.json`: lo escribe el Mac, que lo sube junto con `render.json`.
  - `_calendario/<semana>/visual-respuestas.jsonl`: lo escribe el bot del servidor.

  El bucle lee los dos.
- **Fase 1 en una sola PR y fase 2 en otra.** La fase 2 depende de la infraestructura de cuadros
  de la fase 1.
- Los arreglos 1 a 4 usan como casos de prueba los borradores reales donde aparecieron.

### Resueltas tras la revisión del constructor (decisiones del diseñador)

- **Un fallo visual de la fase 1 se puede reintentar.** No es `fallido` terminal. Se trata como un
  error de entorno:
  - la pieza sigue `planificado`;
  - el Mac avisa por Telegram **una sola vez por pieza y motivo** (llevar registro para no repetir
    cada hora);
  - se reintenta en cada corrida.

  Si se arregla el código antes de la hora, la pieza sale. Si llega la hora sin arreglo, queda
  `saltado`, como hoy, pero con aviso previo. Así un falso positivo o un error del motor ya
  corregido no mata la pieza.
- **Sin «modo aviso» en producción para la fase 1.** El bloqueo entra directo, y la PR no se puede
  mergear hasta que se cumpla esto:
  - se re-renderizan en local todos los borradores de las 3 semanas del corpus, con un script
    nuevo que use el mismo `renderPieza` sin subir nada;
  - con el motor ya arreglado, dan 0 violaciones;
  - las excepciones (piezas con contenido realmente imposible de encajar) van listadas en la PR con
    su motivo.
- **Umbrales de partida, que el constructor calibra con el corpus:**
  - Encime en una transición: dos textos de escenas distintas con opacidad ≥ 0,3 cada uno y una
    intersección ≥ 10 % del área del menor.
  - Número solo: el número con opacidad ≥ 0,8 mientras su heading está bajo 0,2 durante más de
    0,4 s.
  - Las comprobaciones leen el DOM en los instantes elegidos (`__reel.seek` + `evaluate`). No sacan
    capturas extra, así que casi no alargan el render.
- **El interlineado global del titular Anton se puede cambiar.** Los tests de layout miden límites,
  no posiciones exactas. Si uno falla porque un texto ya no cabe, es un problema real: se resuelve
  con `fitDisplaySize`, no editando el test. Si un test fija un `line-height` literal, se reporta.
- **El revisor de la fase 2 no bloquea la subida.** Corre después de que la pieza queda
  `renderizado`, en el mismo ciclo o en el siguiente.
- **Topes y presupuesto del revisor:** 12 imágenes por pieza, 120 por semana y un máximo de
  US$5 por semana. El contador va en los archivos de la semana. Si se pasa el tope, la pieza queda
  «sin revisar».

## Lo que queda al constructor

- La técnica exacta para medir el choque de tildes. Puede ser rectángulos de línea más métricas de
  la fuente, o píxeles de un render aislado. Lo que se pide es que «GUÁRDALO / PARA TU / PRÓXIMO
  VIDEO» de la plantilla Cta falle antes del arreglo y pase después.
- Cómo cambiar la transición: salida antes de la entrada, o desplazamiento sin encime. Debe
  conservar los tiempos totales de `timing.ts` o actualizar sus tests.
- La causa del número solo, una vez reproducida.
- El texto del aviso y cómo se marca en el mensaje que ya se respondió, por ejemplo editando los
  botones.

## Terminado

- **Fase 1:**
  - `npm run typecheck && npm test && npm run test:reel` en 0, con tests nuevos para cada arreglo y
    cada comprobación;
  - el corpus de 3 semanas renderiza sin violaciones;
  - las 5 piezas citadas, re-renderizadas, ya no muestran el problema;
  - revisión adversarial antes del merge;
  - entrada en `reglas.json`.
- **Fase 2:**
  - el revisor corre en el Mac en modo aviso;
  - los avisos llegan por Telegram con su respuesta guardada;
  - el bucle muestra la precisión;
  - topes respetados y testeados;
  - entrada en `reglas.json`.
