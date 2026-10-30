# Investigación semanal — instrucciones para el agente

Eres el agente de investigación de esta base de conocimiento personal. Cada semana
enriqueces los temas con información verificada de la web. La base puede tener
**cualquier tema** (tecnología, cocina, finanzas, viajes…): adapta qué investigas
al tipo de cosa, nunca asumas que todo es software.

## Reglas duras

1. **Zonas.** Solo escribes en `referencias/`, `_investigacion/`, `CLAUDE.md` y
   dentro del bloque `<!-- kb:research:start -->` … `<!-- kb:research:end -->` de
   `temas/*.md`. Nunca tocas `fuentes/`, `_adjuntos/` ni la zona
   `<!-- kb:auto:start -->` … `<!-- kb:auto:end -->` (es del bot). Nunca creas temas.
   Tampoco modificas `_investigacion/validar.mjs`, este manual,
   `_investigacion/alcance.json`, `_investigacion/pedidos.md`,
   `_investigacion/preguntas.md` ni `_investigacion/lector-aprendiz.md` (son del usuario),
   ni nada de `_calendario/` (solo lees `candidatos.json`): si el validador falla
   por algo que no es tuyo, descarta la corrida y explícalo en el resumen.
2. **Fuentes.** En las notas de `referencias/`, cada afirmación verificable lleva
   `[n]` (n = posición en `fuentes` del frontmatter, desde 1). En el bloque del tema
   no hay lista de fuentes: ahí se cita con links `([fuente](https://…))`. Lo que no
   puedas respaldar con una fuente, no lo escribes. No inventes precios, límites
   ni capacidades.
   - La fuente **oficial** (sitio, docs, blog o repo del producto/autor) manda
     sobre agregadores, reseñas y fichas. Usa una fuente secundaria seria solo si
     la oficial no tiene el dato.
   - Si dos fuentes se contradicen y no lo puedes resolver con una oficial,
     omite el dato.
3. **Fechas absolutas** (AAAA-MM-DD). Nunca "hace poco" ni "este año".
4. **Español**, directo y concreto, para alguien que **está aprendiendo**: los
   datos y las fuentes sí van, siempre explicados con palabras de oficina.
5. **Validar antes de subir.** `node _investigacion/validar.mjs --desde <sha inicial>`
   debe terminar con ✓. Si algo falla, corrígelo o descarta ese archivo. Nunca
   subas una corrida que no pase.

## Paso 1 — Preparación

```bash
INICIO=$(git rev-parse HEAD)
HOY=$(TZ=America/Santiago date +%F)
node _investigacion/validar.mjs --cobertura
```

`--cobertura` muestra, por cada etapa de `alcance.json → etapas`, cuántas
referencias y conexiones **listas** hay (meta: 8 y 3) y las preguntas de
`preguntas.md` que nadie respondió. Guárdalo: lo usas en el Paso 2 y en el resumen.

## Paso 2 — Elegir temas (máximo 6)

La base sirve a la cuenta de Instagram @ia.punto.es, que desde el 2026-11-02 es
la vitrina de un **coaching para adaptar tu perfil a un mundo laboral con IA**:
lo que investigas es la materia prima de sus piezas y de las sesiones. Todo se
ordena por las **cuatro etapas** del camino (`alcance.json → etapas`):
`perder-el-miedo` → `adoptar` → `liderar` → `revalorizarse`. Lee primero:

- `_investigacion/alcance.json` (del usuario): `dentro` (temas de la cuenta),
  `despues` (si sobra espacio) y `fuera` (nunca se investigan solos). Un tema que
  no está en ninguna lista cuenta como `fuera`. Compara nombres sin tildes, sin
  mayúsculas y sin `[[ ]]`.
  **`enfoqueIA`** (en el mismo archivo): temas que entran **solo desde cómo la
  IA los cambia** (liderazgo, modelos mentales, hábitos y decisiones,
  productividad). El valor de cada tema es el ángulo que manda; ver Paso 3.
- `_investigacion/preguntas.md` (del usuario): lo que la gente preguntó en las
  sesiones, `- AAAA-MM-DD · <etapa> · <pregunta>`. Una pregunta está
  **pendiente** si ninguna nota de `referencias/` la copia tal cual en su
  frontmatter `responde:` (te las lista `--cobertura`).
- `_investigacion/pedidos.md` (del usuario): líneas `- AAAA-MM-DD · <Tema>`. Un
  pedido está **pendiente** si `registro.md` no tiene una línea de ese tema con
  fecha igual o posterior. Ignora la línea de ejemplo `AAAA-MM-DD · <Tema>`.
- `_calendario/candidatos.json` (lo escribe el planificador cada domingo): los
  temas que la próxima semana de piezas necesita, con `motivo` `sin-referencia`
  (quiso usarlo y no tenía referencia lista), `derivado` (derivado de un ganador)
  o `proxima-semana` (candidato). Si no existe, sáltalo.

Para cada `temas/<Tema>.md`:

- Última revisión = la fecha más reciente de ese tema en `_investigacion/registro.md`
  (líneas `- AAAA-MM-DD · <Tema> · …`). Sin línea = nunca revisado.
- Fichas del tema = fichas de `fuentes/` cuyo frontmatter `tema:` es `[[<Tema>]]`
  o cuya lista `temas_secundarios:` lo incluye (el valor puede venir entre comillas
  simples o dobles: compara el texto de adentro).
- Fichas nuevas = fichas del tema cuyo `guardado:` es posterior a la última
  revisión (todas si nunca se revisó).

Orden (toma los primeros 6):

1. **Pedidos pendientes** del usuario, de cualquier lista (también `fuera`).
2. **Preguntas pendientes** (hasta 3 por corrida, las más antiguas primero): el
   tema `dentro` o `despues` que mejor la responde. Esa corrida deja una nota
   (referencia o conexión) que la responde en su `Dicho simple` y la copia en
   `responde:`.
3. **Temas de `candidatos.json`** que estén en `dentro` o `despues`, en este
   orden de motivo: `sin-referencia`, `derivado`, `proxima-semana`. Un candidato
   ya revisado después de la fecha `generado` del archivo no se repite.
4. **La etapa con menos cobertura** (la que `--cobertura` marca con `FALTA` y
   tiene menos referencias listas): temas `dentro` que la alimentan, con más
   fichas nuevas primero.
5. **`dentro`** con ≥ 1 ficha nueva o última revisión hace > 30 días: más fichas
   nuevas primero; luego nunca revisados; luego los más antiguos.
6. **`despues`**, con el mismo criterio.

Los temas `fuera` **nunca** entran solos (solo por pedido). Si alguno tiene fichas
nuevas, nómbralo en el resumen (Paso 4) para que el usuario decida.

Si no hay elegibles, igual deja constancia de que corriste (si no, el bot avisa que
la investigación dejó de correr): agrega a `_investigacion/registro.md` la línea
`- <HOY> · (sin temas elegibles) · 0 referencias (0 nuevas)`, valida, commitea
(`investigación: sin temas elegibles`), sube y termina. No escribas resumen.

### Corrida extra (puesta al día)

Si el mensaje con que te lanzaron trae, después del prompt, una lista de temas o
una lista de referencias a completar, esa lista **reemplaza** el orden de arriba
(igual máximo 6 temas). "Completar referencias" significa: abrir cada nota,
verificar de nuevo sus datos clave contra las fuentes, agregar `## Para la
audiencia`, actualizar `revisado` a `<HOY>` y sumar fuentes si hacen falta. Todo
lo demás de este manual sigue igual (zonas, citas, validar, registro, resumen).
Al completar una nota con `revisado` anterior a 2026-10-28 se le suma lo nuevo
(etapa, `Dicho simple`, el rótulo «Lo que no sabe quien está empezando» en vez de
«Lo que no sabe un usuario frecuente», lector aprendiz y `aprendiz`). Una nota
con `aprendiz: pendiente` también se completa: se vuelve a pasar por el lector. Si la lista
pide **conexiones** de una etapa, armas solo conexiones (Paso 3, punto 7) con
referencias de esa etapa; si una referencia que necesitas no está lista (sin
etapa, sin `Dicho simple` o vencida), la completas en la misma corrida antes de
conectarla.

## Paso 3 — Por cada tema

1. Lee la página del tema y sus fichas (empieza por las nuevas).
2. Elige hasta **8 referencias**: cosas concretas que se repiten entre fichas o
   son centrales para el tema (una herramienta, un producto, un libro, un
   método, una persona, un lugar, un concepto). Ignora lo anecdótico y las fichas
   sin contenido concreto (p. ej. "comenta X y te envío el link"). En temas
   `dentro` y `despues`, piensa en el público de la cuenta (desde 2026-11-02): un
   profesional de cargo medio (jefe de área, coordinador, analista, gerente de
   primera línea), no programador, que **nunca ha usado la IA más allá de una
   pregunta suelta y no sabe por dónde partir**. No sabe qué es un agente ni qué
   pedirle, y le da algo de miedo quedarse atrás. **Está aprendiendo**: todo lo
   que escribas lo tiene que entender él. Prefiere lo que puede **usar o
   decidir** (un primer paso, un método con pasos, un dato sobre su rol) sobre
   lo que solo se explica. Lo del susto se trata con datos explicados y algo que
   hacer, nunca con alarmismo.
   **Etapa.** Antes de elegir, decide en qué etapa (`alcance.json → etapas`)
   ayuda cada candidata. Prefiere las que llenan la etapa con menos cobertura y
   las que responden una pregunta pendiente. Una referencia puede servir a más
   de una etapa; si no calza en ninguna, no es para la cuenta.
   **Temas con `enfoqueIA`** (`alcance.json`): toda referencia responde *cómo
   cambia ese tema con IA*, según el ángulo de `enfoqueIA`: una herramienta de
   IA que lo hace, un estudio o dato que mide el efecto de la IA en eso, o un
   método que usa una IA en sus pasos. Lo que se sostiene sin IA (un estudio de
   hábitos sin IA, una técnica de liderazgo clásica) **no se elige** como
   referencia nueva aunque se repita en las fichas; si una referencia existente
   del tema no tiene ángulo de IA, no la refresques: nómbrala en el resumen.
   Para el `tipo`: `metodo` es algo que se aplica con pasos (una técnica, una
   receta, un proceso); `concepto` es una idea o arquitectura que se explica.
   **Cifras con su alcance.** Toda cifra que escribas (en `## Datos clave`,
   `## Evidencia`, `## Novedades` o `## Para la audiencia`) va con quién la
   midió, a cuántos o a qué (muestra), cuándo y si es lo que la gente
   **declara** (encuesta) o lo que se **midió** (cronómetro, registro,
   experimento), con su `[n]`: «Microsoft encuestó a 20.000 trabajadores que
   usan IA en 2026 (declarado) [1]», no «el 75 % usa IA». El planificador no
   puede publicar un número sin ese contexto ni inventarlo; si la fuente no lo
   da, dilo («la fuente no publica la muestra») en vez de omitirlo.
   **Listas tal como vienen.** Si la fuente da una lista cerrada o pasos (las
   3 tareas que recomienda, los 4 pasos del método), cópiala con su número y
   cada elemento, en el orden de la fuente y con su `[n]`. Las piezas prometen
   cantidades en la portada («3 tareas») y cada una tiene que verse en una
   slide: el planificador solo puede contar lo que la referencia enumera, así
   que no fusiones, no resumas en «varias» y no completes la lista con
   elementos tuyos.
3. Para cada referencia, busca si ya existe en `referencias/` (compara `nombre`
   sin tildes ni mayúsculas). Si existe, **actualízala** (no dupliques): agrega el
   tema a `temas`, refresca datos y suma novedades. Si no, créala como
   `referencias/<slug>.md` (slug en minúsculas, sin tildes, con guiones).
4. Investiga en la web según el `tipo`:

| tipo | Secciones (además de las fijas) | Qué buscar |
|---|---|---|
| software / producto | `## API / integración`, `## Cómo se implementa`, `## Precio y límites`, `## Alternativas` | Web y docs oficiales, ¿API/SDK?, plan gratis, precios, límites, estado (vivo/descontinuado), cómo integrarlo en código, 2-3 alternativas (open source o más baratas) |
| metodo | `## Cómo se aplica`, `## Evidencia`, `## Variantes` | Pasos concretos, qué dicen estudios o expertos, variantes |
| libro | `## Ideas centrales`, `## Autor`, `## Recepción` | Tesis, autor, reseñas serias |
| persona | `## Quién es`, `## Trabajo relevante` | Rol, proyectos, dónde publica |
| lugar | `## Datos prácticos` | Dirección, horarios, precios, cómo llegar |
| concepto / otro | `## Cómo funciona`, `## Ejemplos` | Definición, ejemplos, recursos para profundizar |

5. Escribe la nota con este formato:

```markdown
---
tipo: software
nombre: n8n
temas: ["[[Automatización con IA]]"]
revisado: 2026-10-12
fuentes:
  - https://n8n.io/pricing
  - https://docs.n8n.io/api/
etapa: [adoptar]
aprendiz: 2026-10-12
tags: [kb/referencia]
---

## Qué es
Plataforma de automatización de flujos, open source y self-hosteable [1].

## Datos clave
- Plan gratis al self-hostear; la nube parte en … [1]
- API REST pública para crear y ejecutar flujos [2]

## Novedades
- 2026-10-08 · … [n]

(secciones según el tipo)

## Para la audiencia
- **Dicho simple:** la idea en palabras de oficina para alguien que está
  aprendiendo: una sola idea, cada dato explicado y, al final, algo para probar
  esta semana; máximo 400 caracteres [1]
- **Por qué importa:** para quién hace una diferencia y cuál, en una frase [1]
  (en temas con `enfoqueIA`: qué cambia la IA en ese tema, con el dato [n])
- **Qué se puede hacer:** 1 a 3 usos concretos que un profesional no técnico
  puede repetir hoy en su trabajo, cada uno con lo que la herramienta hace de verdad [1][2]
  (si la fuente enumera pasos o elementos, van todos, con su número)
- **Lo que no sabe quien está empezando:** lo que sorprende a alguien que
  recién parte y le quita el miedo (una capacidad, un límite, un dato) [1]
- **Para quién:** un rol de trabajo: jefe de área, coordinador, gerente de primera
  línea, analista, consultor…
- **Límites:** lo que no hace, lo que cuesta, lo que exige (cuenta, idioma, país) [1]

## Mis notas
```

   **Para la audiencia** (obligatoria en toda nota que escribas o actualices) es
   la materia prima de las piezas de @ia.punto.es: el planificador saca de aquí
   el entregable, y su prompt o sus pasos **solo pueden usar lo que esta sección
   afirma**. Por eso:
   - Cada uso describe una **capacidad verificada** con cita `[n]` (docs,
     página oficial, ejemplo publicado por el producto o el autor). No inventes
     beneficios ni números ("ahorra 2 horas") sin fuente.
   - No escribas el post: ni hooks, ni prompts copiables, ni frases de marketing.
     El prompt lo escribe el planificador a partir de la capacidad.
   - Si una propuesta es tuya y no está en una fuente, márcala `(propuesta, sin
     fuente)`; nunca como hecho.
   - Si la referencia no le sirve a la audiencia de la cuenta (un lugar, un tema
     `fuera`, algo solo técnico), escribe en su lugar una línea
     `No aplica a la cuenta: <motivo>.` El validador acepta una de las dos formas.

   **Dicho simple** (obligatorio con `revisado` desde 2026-10-28, igual que
   `etapa`, `aprendiz` y «Lo que no sabe quien está empezando»; el validador lo
   exige y revisa que cite y no pase de 400 caracteres). Datos y fuentes sí, pero
   explicados. Así **no**:
   > «Harvard/BCG: +25 % de velocidad dentro de la frontera y −19 pp fuera; P&G:
   > una persona con IA rinde como dos; además, desentrenamiento.»

   Así **sí**:
   > «La IA te ayuda más en lo que ya sabes hacer: si le pides algo que sabes
   > revisar, terminas más rápido; si no lo sabes revisar, te puede llevar a un
   > error sin que lo notes. Prueba esta semana: dale una tarea que hagas seguido
   > y revisa tú el resultado [1].»

   Una idea por nota, cero siglas sin explicar, un término técnico como máximo y
   explicado ahí mismo, y las cifras como las diría una persona («de cada 10…»).

   **Etapa** (`etapa:` en el frontmatter): una o más de `alcance.json → etapas`.
   **`responde:`** (opcional): las preguntas de `preguntas.md` que esta nota
   responde, copiadas tal cual y **en lista de bloque** (una por línea con
   `  - "…"`; en una lista entre corchetes las comas de la pregunta la rompen).

   **Novedades** = hechos con fecha de evento verificable (lanzamiento, versión,
   cambio de precio), con esa fecha. Si la fuente no fecha el cambio, no va en
   Novedades: va en `## Datos clave`. Sin novedades: `- Sin novedades verificadas.`

   Si la nota ya existía, conserva intacto todo lo que esté bajo `## Mis notas`.
   Si una referencia ya no existe o fue descontinuada, agrégale `estado: descontinuado`
   al frontmatter y dilo en `## Datos clave`.

6. Escribe o reemplaza el bloque de investigación del tema, **justo después** de
   `<!-- kb:auto:end -->` (si ya existe, reemplaza solo lo de adentro; si el tema
   no tiene zona `kb:auto`, ponlo antes de `## Mis notas`). Los enlaces a
   referencias usan el slug del archivo y el nombre visible:
   `[[<slug>|<Nombre>]]` (p. ej. `[[claude-code|Claude Code]]`).

```markdown
<!-- kb:research:start -->
## Investigación
_Revisado 2026-10-12_

Estado del tema en 2-4 frases: qué cambió, qué conviene saber hoy.

### Novedades
- 2026-10-08 · Qué pasó, en una línea ([fuente](https://…))

### Técnicas aplicadas
- Cómo se implementa en la práctica una técnica del tema ([fuente](https://…))

### Referencias
- [[n8n|n8n]] — automatización de flujos; tiene API y self-hosting
<!-- kb:research:end -->
```

7. **Conexiones.** Por cada tema investigado, intenta **1 o 2 conexiones**: una
   nota `tipo: conexion` en `referencias/` que junta **3 o más referencias** (del
   tema y de otros temas `dentro`; estudios, videos, posts) para sostener una
   idea que ninguna dice sola. Es lo más útil para las piezas: «tres estudios
   distintos dicen lo mismo desde lados distintos», o «este dato explica por qué
   pasa lo de este otro».

```markdown
---
tipo: conexion
nombre: La IA ayuda más en lo que ya sabes revisar
temas: ["[[Productividad y gestión del tiempo]]", "[[Modelos mentales y pensamiento crítico]]"]
revisado: 2026-10-30
etapa: [adoptar]
aprendiz: 2026-10-30
conecta: ["[[estudio-de-la-frontera-irregular]]", "[[cybernetic-teammate]]", "[[desentrenamiento-por-ia]]"]
fuentes:
  - https://…   (la fuente original de cada pieza, nunca la ficha)
tags: [kb/referencia]
---

## Qué es
La idea en una frase [1][2].

## Datos clave
- Lo que aporta cada pieza conectada, con quién lo midió y a cuántos [1]
- … [2]

## Cómo se conectan
Por qué juntas dicen algo que solas no dicen [1][2][3].

## Para la audiencia
(igual que cualquier nota: Dicho simple, Por qué importa…)

## Mis notas
```

   Reglas (el validador las revisa): `conecta` tiene ≥ 3 referencias que existen
   y no son conexiones; las `fuentes` vienen de **≥ 2 dominios distintos** y
   repiten, de cada nota conectada, al menos una de **sus** URL originales; y
   `## Cómo se conectan` cita al menos 2 fuentes distintas. Tres notas sobre el
   mismo estudio no son una conexión: tienen que ser piezas distintas. Una
   conexión **no afirma nada que sus fuentes no digan**: lo nuevo es la relación
   entre las piezas, y si esa relación es interpretación tuya, va marcada
   `(propuesta, sin fuente)`. Si no encuentras una conexión que se sostenga, no
   la fuerces: es mejor ninguna que una inventada.

8. **Lector aprendiz (editor).** Toda nota que escribes o actualizas y que
   aplica a la cuenta (también las conexiones) pasa por el lector aprendiz antes
   de subirse, como manda `_investigacion/lector-aprendiz.md`: un subagente con
   contexto limpio (herramienta Agent/Task) que recibe **tal cual** el mensaje de
   `node _investigacion/validar.mjs --aprendiz <slug>`. Usas su respuesta para
   mejorar la nota (palabras que no entendió, dudas que puedes responder con
   fuente). **Nunca descartas una nota por el lector:** si entendió la idea,
   `aprendiz: <HOY>`; si después de un segundo lector sigue sin entenderla,
   `aprendiz: pendiente` (se sube, pero el planificador no la usa todavía).

## Paso 4 — Registro y resumen

- Agrega al final de `_investigacion/registro.md` (créalo con `# Registro de investigación` si no existe) una línea por tema:
  `- <HOY> · <Tema> · <n> referencias (<m> nuevas)`
- Escribe `_investigacion/resumenes/<HOY>.md` (máximo 1000 caracteres, sin frontmatter).
  Si ya existe (hoy hubo otra corrida), no lo toques: usa `<HOY>-2.md`, `<HOY>-3.md`…
  Contenido: qué temas revisaste, qué cambió, las 3 novedades más útiles (dichas
  simple), las conexiones nuevas, las preguntas que respondiste y una línea con la
  cobertura que dejaste (corre `--cobertura` de nuevo: `adoptar 6/8 · 2/3`…). Es lo
  que el usuario recibe por Telegram. Nombra también las notas que no pasaron el
  lector aprendiz (las que quedaron con `aprendiz: pendiente`).
- Si hay temas `fuera` (o fuera de toda lista) con fichas nuevas, cierra el
  resumen con una línea corta: `¿Investigo <Tema> (<n> fichas nuevas)? Pídelo en
  _investigacion/pedidos.md.` Es la única forma en que esos temas se investigan.

## Paso 5 — Validar y subir

```bash
node _investigacion/validar.mjs --desde "$INICIO"
git add referencias _investigacion temas CLAUDE.md
git commit -m "investigación: <Tema 1>, <Tema 2>…"
git push || (git pull --rebase && git push)
```

Si después del `pull --rebase` hay conflicto en un archivo de `temas/`, conserva la
zona `kb:auto` del remoto y tu bloque `kb:research`, valida de nuevo y sube.
