# `/caso` — contar cómo logré un proyecto complejo

**Fecha:** 2026-11-01 · **Estado:** diseño para aprobar

## Intención

Felipe hace proyectos complejos con IA en otras carpetas (por ejemplo el video LGTM, un proyecto de
video en otra carpeta, o la página de un producto propio como tunomi).
Normalmente parte sin saber cómo hacerlo: busca referencias, las estudia, prueba, itera y llega al
resultado. **Ese camino es el contenido.** Hoy reconstruirlo a mano cuesta: hay que acordarse de qué
referencias se usaron, qué falló, cuántas versiones hubo.

Queremos un comando que se corre **en cualquier proyecto** y rearma esa historia desde lo que quedó
guardado (conversaciones con Claude, git, archivos), y de ahí produce:

1. **Un carrusel o reel** para @ia.punto.es: el problema, 3–4 momentos clave, el resultado y la
   invitación al coaching.
2. **Un PDF paso a paso** que Felipe manda cuando alguien se lo pide. Su lector quiere **repetir lo
   mismo en su proyecto** y **entender cómo trabaja Felipe para aplicarlo**.

Encaja con el pivote a coaching: la cuenta es vitrina, y un caso real contado paso a paso es la
mejor prueba de «te ayudo a partir».

## Metas

- Reconstruir la historia de un logro sin preguntarle a Felipe lo que ya está en los registros.
- PDF que alguien que está aprendiendo pueda seguir: qué se hizo, qué se le pidió a la IA (prompt
  real, limpio y corto), con qué herramienta, qué salió, qué falló.
- Mostrar el **método** de Felipe además de los pasos: lo que se repite entre proyectos (partir de
  una referencia, analizarla a fondo antes de crear, iterar por versiones, revisión independiente).
- Números del proyecto sacados solos (tiempo, sesiones, mensajes, versiones, renders, líneas de
  código, subagentes, tokens), como la tabla que Felipe ya pidió a mano para un proyecto anterior.
- Que el carrusel/reel se vea como el resto de las piezas (mismas plantillas, marca y juez).

## No-metas

- No publica nada solo. No toca el calendario automático (que publica sin intervención).
- No es un registrador que corre *durante* el proyecto; trabaja con lo que ya quedó guardado.
- No lee lo que pasó fuera de Claude (Suno, apps del navegador) salvo lo que haya en archivos.
- Proyectos de Codex: fuera por ahora.

## Anti-metas (falla aunque funcione)

- **Que se filtre algo sensible** en el PDF, el carrusel o una imagen: claves y tokens, datos
  personales, cualquier cosa que lleve a los clientes de Felipe (nombres, empresas, rubros muy
  específicos, montos, URLs), nombres reales de personas, rutas y nombres de archivos internos.
- Que el texto lo entienda solo un desarrollador (ver regla de contenido para aprendices).
- Que se genere el PDF o la pieza sin que Felipe haya aprobado la historia.
- Firmar con el nombre de Felipe (se firma como @ia.punto.es + «Te ayudo a partir…»).

## Flujo (decidido con Felipe)

1. Felipe corre `/caso` dentro de la carpeta del proyecto (o le pasa la carpeta) y dice **qué logro**
   quiere contar («el video que hice en Blender»).
2. La herramienta junta los rastros y arma la **historia limpia en texto**.
3. **Felipe la lee y la aprueba** (o pide cambios). Gate obligatorio.
4. Solo entonces genera el PDF y el carrusel/reel.

## Fuentes de los rastros (observado en proyectos reales)

- **Conversaciones de Claude Code:** `~/.claude/projects/<carpeta-codificada>/*.jsonl` (la ruta
  con `/`, espacios y `_` cambiados por `-`), más las carpetas de worktrees del mismo proyecto
  (un proyecto puede tener ~30 `…--claude-worktrees-…`). Traen los mensajes del usuario, las respuestas, las
  herramientas usadas, subagentes y tokens.
- **Git** si existe (hay proyectos sin git).
- **Archivos del proyecto:** documentos de análisis (`analisis.md`), versiones (`letra_v2`,
  `letra_v3`, `guion_v1`…), referencias (`ref/`), salidas (`out/*.png`, `*.mp4`).

**Importante:** una carpeta de conversaciones puede mezclar proyectos distintos. La
de un proyecto de video tiene ese video junto con otros modelos 3D sin relación. Hay que
**elegir qué sesiones pertenecen al logro** (por tema, fechas y archivos tocados) y mostrarle a
Felipe cuáles se usaron. Las conversaciones pueden ser enormes (la principal de un proyecto real pesa 62 MB):
hay que resumirlas por partes, no meterlas enteras a un modelo.

## La historia (el texto que Felipe aprueba)

Un Markdown en español simple, con:

- **Punto de partida:** qué quería y qué no sabía.
- **Referencias:** qué buscó y qué sacó de cada una.
- **Pasos:** para cada uno, qué hizo, el prompt real (limpio y corto), la herramienta, qué salió y
  qué falló o se rehízo.
- **El método:** el patrón de trabajo que se ve en este caso.
- **Números del proyecto.**
- **Imágenes candidatas** (de `out/` u otras), cada una marcada como revisada o no.
- **Qué se tapó:** lista de lo que el filtro reemplazó, para que Felipe confirme.
- **Sesiones usadas** y cuáles se descartaron.

## Privacidad (decidido: tapar de más antes que de menos)

Doble filtro, antes de que Felipe vea la historia:

1. **Automático (determinista):** claves y tokens con formas conocidas, correos, teléfonos, RUT,
   rutas absolutas, nombres de archivos internos, URLs que no sean de herramientas públicas.
2. **Revisión del texto completo por un modelo:** reemplaza clientes, empresas y personas por roles
   genéricos («el gerente», «una persona de tecnología», «un cliente del rubro financiero»).

Las imágenes también pasan por el filtro: si muestran algo que no se puede tapar, no se usan. Las
herramientas públicas (Claude, Suno, Blender, three.js) sí se nombran: son parte de lo que el
lector necesita para repetirlo.

## Salidas

- **PDF:** paso a paso con el método, los números y la firma. Detalles técnicos en un recuadro
  aparte para quien los quiera. Lo que falló va incluido: muestra que iterar es normal.
- **Carrusel o reel:** versión corta del mismo caso con las plantillas de Carrusel, que pasa por el
  juez y las reglas de redacción que ya existen.

## Decisiones del builder (mis propuestas, Felipe puede cambiarlas)

- **Forma:** skill global `~/.claude/skills/caso/` (para correrlo desde cualquier proyecto) que
  llama al código versionado y con tests dentro de Carrusel (p. ej. `src/caso/`, `npm run caso`).
- **Dónde queda el resultado:** en una carpeta del proyecto contado (p. ej. `<proyecto>/caso/`),
  con `historia.md`, `caso.pdf` y la pieza. *Supuesto:* conviene revisar que esa carpeta no entre
  a un repo público del proyecto.
- **PDF:** con Playwright/Chromium, como el render actual (`page.pdf`), sin nuevas dependencias.
- **Carrusel/reel:** el `.ts` de la pieza se escribe en `<proyecto>/caso/` (nunca en
  `carousels/`, porque el repo Carrusel es **público** en GitHub) y se renderiza con `npm run
  generate <ruta>` o el flujo de reels. **Cambio sobre lo conversado:** dije que «entra al
  calendario como borrador», pero el calendario publica solo; por eso queda fuera del calendario y
  Felipe lo programa a mano si quiere. Ningún texto del caso entra al repo Carrusel; los tests usan
  transcripciones inventadas.
- **Quién hace el trabajo del modelo:** la propia sesión de Claude Code que corre `/caso` (con
  subagentes para trozar sesiones grandes). Así el texto sin tapar no sale a otro proveedor
  (DeepSeek, OpenAI) y no hacen falta claves ni gasto en APIs. El código de `src/caso/` hace solo
  lo determinista: encontrar y trozar sesiones, contar números, el filtro automático, armar PDF y
  pieza; eso es lo que tiene tests.
- **Imágenes:** la sesión las mira (es multimodal) y descarta las que muestren algo sensible; las
  que quedan van marcadas en `historia.md` y Felipe las confirma al aprobar.
- **Juez:** usa las plantillas existentes (Hook, Screen, Step, Stat, Cta…), sin plantilla nueva. El
  juez y `scoreDraft` **informan**, no bloquean: la pieza queda fuera de la puerta del calendario y
  Felipe decide.
- **Reel en la primera versión (decidido por Felipe).** Se generan carrusel y reel del mismo caso.
  El reel sigue la configuración actual (sin voz mientras `config.voz` sea false) y usa como medios
  las imágenes y videos aprobados del propio proyecto (p. ej. `out/*.png`, tramos de `out/*.mp4`
  en un slide `Clip`). No se genera video con IA nuevo por defecto (cuesta dinero).
- **Aprobación:** queda atada a un hash del contenido de `historia.md`. Si Felipe la edita después,
  se vuelve a pasar el filtro automático y hay que aprobar de nuevo antes de generar.

## Lo que queda al builder

Cómo se codifica la carpeta de conversaciones, cómo se trozan y resumen las sesiones, el formato
interno de la historia, el diseño visual del PDF dentro de la marca ia.es, los patrones exactos del
filtro automático y los tests (con transcripciones de ejemplo inventadas, nunca reales).

## Terminado

`npm run typecheck && npm test` en 0, con tests nuevos para: elegir sesiones de una carpeta mixta,
el filtro automático (claves, rutas, correos, RUT) y que no se genere nada sin historia aprobada.
Como toca reels, también `npm run test:reel`. Prueba real: correr `/caso` sobre un proyecto real y que Felipe
apruebe la historia, el PDF, el carrusel y el reel.
