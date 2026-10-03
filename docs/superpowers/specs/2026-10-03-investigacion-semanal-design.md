# Investigación semanal de la base (kb) — diseño

Fecha: 2026-10-03 · Estado: borrador para revisión

## Objetivo

La base `ia-es-kb` es la base de conocimiento personal del usuario: hoy guarda
fichas de posts de Instagram (vía Telegram y DMs) agrupadas en temas. El
objetivo es que además se **enriquezca sola**: una vez por semana, un agente
investiga en la web lo que la base menciona y deja notas verificadas, con
fuentes. Esa información debe:

1. Poder consultarse **por DM de Instagram** (y Telegram) con el `ask` actual.
2. Servir más adelante como contexto para que Claude Code cree o mejore apps
   (proyecto 2, fuera de alcance aquí; este diseño deja la base lista para eso).

La base puede contener **cualquier tema** (no solo IA/automatización), así que la
investigación se adapta al tipo de cosa investigada.

## Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Dónde corre la investigación | Tarea programada de Claude en la nube (plan Max) | Costo extra 0; mejor juicio que un pipeline fijo para temas de cualquier dominio |
| Qué temas | Los que recibieron fichas desde su última revisión + los que llevan > 30 días sin revisar; tope 5 por corrida | Costo y tiempo acotados |
| Qué se investiga | Ficha técnica, cómo se implementa/aplica, novedades, alternativas (según el tipo) | Pedido del usuario |
| Formato | Una nota por referencia en `referencias/`, enlazada desde los temas | Se investiga una vez aunque aparezca en varios temas; fácil de abrir para Claude Code |
| Resumen semanal | El agente lo escribe en el repo; el bot lo reenvía por Telegram tras el pull | No hay token de Telegram en la nube |

## Estructura de la base

```
ia-es-kb/
├── fuentes/                 fichas (las escribe el bot, sin cambios)
├── temas/                   páginas de tema (el bot escribe su zona kb:auto;
│                            el agente escribe el bloque kb:research)
├── referencias/             NUEVO · una nota por cosa investigada
├── _investigacion/          NUEVO
│   ├── INSTRUCCIONES.md     manual del agente (versionado)
│   ├── validar.mjs          validador de formato (node, sin dependencias)
│   ├── registro.md          historial de corridas
│   └── resumenes/AAAA-MM-DD.md   resumen de cada corrida (lo reenvía el bot)
└── CLAUDE.md                NUEVO · cómo navegar la base (para agentes)
```

Zonas de escritura (regla dura, evita conflictos):

- **Bot:** `fuentes/`, `_adjuntos/`, zona `kb:auto` de `temas/*.md`. Nunca toca
  `referencias/`, `_investigacion/` ni el bloque `kb:research`.
- **Agente:** `referencias/`, `_investigacion/`, `CLAUDE.md` y el bloque
  `kb:research` de `temas/*.md`. Nunca toca `fuentes/` ni la zona `kb:auto`.

### Nota de referencia (`referencias/<slug>.md`)

Frontmatter obligatorio:

```yaml
tipo: software | producto | libro | metodo | persona | lugar | concepto | otro
nombre: n8n
temas: ["[[Automatización con IA]]"]
revisado: 2026-10-12
fuentes:
  - https://n8n.io/pricing
  - https://docs.n8n.io/api/
tags: [kb/referencia]
```

Cuerpo:

- Secciones fijas: `## Qué es`, `## Datos clave`, `## Novedades` (cada novedad
  con su fecha).
- Secciones según `tipo` (las define `INSTRUCCIONES.md`), por ejemplo:
  - software/producto: `## API / integración`, `## Cómo se implementa`, `## Alternativas`, `## Precio y límites`
  - metodo: `## Cómo se aplica`, `## Evidencia`, `## Variantes`
  - libro: `## Ideas centrales`, `## Autor`, `## Recepción`
- Cada afirmación verificable lleva su fuente como `[n]`, donde n es la
  posición en `fuentes` (1 = la primera). Lo que no tiene fuente no se escribe.
- `## Mis notas` al final: zona del usuario, el agente la conserva intacta.

### Bloque de investigación en el tema

Fuera de la zona `kb:auto` (que `renderTopic` ya preserva), justo después de ella:

```markdown
<!-- kb:research:start -->
## Investigación
_Revisado 2026-10-12_

Estado del tema en 2-4 frases.

### Novedades
- 2026-10-08 · … [fuente](https://…)

### Referencias
- [[n8n]] — automatización de flujos, tiene API y self-hosting
<!-- kb:research:end -->
```

### Registro y resúmenes

- `_investigacion/registro.md`: una línea por tema investigado:
  `- 2026-10-12 · Automatización con IA · 3 referencias (2 nuevas)`. El agente
  lo usa para saber cuándo se revisó cada tema por última vez.
- `_investigacion/resumenes/2026-10-12.md`: qué temas, qué cambió y las 3
  novedades más relevantes, en ≤ 1000 caracteres (cabe en un mensaje).

## Ciclo semanal (agente en la nube)

Domingo 04:00 hora de Chile. El prompt de la tarea solo dice: «Sigue
`_investigacion/INSTRUCCIONES.md`». El manual indica:

1. Clonar `ia-es-kb` (rama principal).
2. **Elegir temas**: para cada `temas/*.md`, tomar la fecha de su última revisión
   en `registro.md` (nunca revisado = elegible) y ver con `git log` si
   `fuentes/` recibió fichas de ese tema después. Prioridad: con fichas nuevas
   (más fichas primero), luego > 30 días sin revisar. Tope 5. Si no hay
   elegibles, termina sin commit.
3. **Por tema**: leer sus fichas → elegir referencias que valga la pena
   investigar (repetidas en varias fichas o centrales en el tema; tope 8 por
   tema) → reutilizar la nota si ya existe (actualizar, no duplicar; buscar por
   `nombre` normalizado) → investigar en la web según `tipo` → escribir las
   notas y el bloque `kb:research`.
4. Correr `node _investigacion/validar.mjs`. Lo que falle se corrige o se
   descarta (nunca se sube una nota inválida).
5. Escribir `registro.md` y el resumen, commit
   (`investigación: <temas>`) y push. Si el push falla por cambios del bot:
   `git pull --rebase` y reintentar (las zonas no se pisan).

Reglas del manual: solo fuentes primarias u oficiales cuando existan; fechas
absolutas; no inventar precios ni capacidades; en español; marcar
`estado: descontinuado` si la herramienta ya no existe.

### `validar.mjs`

Revisa `referencias/*.md`, los bloques `kb:research` y el resumen más reciente:

- Frontmatter con `tipo` (del conjunto permitido), `nombre`, `revisado`
  (AAAA-MM-DD válida), `fuentes` (≥ 1 URL http/https).
- Existen `## Qué es` y `## Datos clave`.
- Cada `[n]` del cuerpo apunta a una fuente existente.
- Bloques `kb:research` bien cerrados y con `## Investigación`.
- Ningún cambio fuera de las zonas del agente: compara contra el commit con
  que partió la corrida (`git diff --name-only <inicio>`) y verifica que la
  zona `kb:auto` de cada tema tocado no cambió.
- Resumen ≤ 1000 caracteres.

Sale con código ≠ 0 y una lista de errores por archivo.

## Cambios en el bot (este repo)

1. **Pull periódico** (`store.ts` + `bot.ts`): cada 1 h, `git pull --rebase` en
   la base, dentro de la cadena serial de escritura del bot (nunca a mitad de
   un guardado). Si `HEAD` cambió: reindexar y revisar resúmenes nuevos.
   Si falla, se avisa con el manejador de errores de sincronización existente;
   la base local queda como estaba.
2. **Índice** (`indexer.ts`): además de las fichas, indexa
   - `referencias/*.md` como documentos `kind = "referencia"`
     (id `ref:<slug>`), con trozos por sección `##`; `Mis notas` se indexa
     igual que en las fichas;
   - el bloque `kb:research` de cada tema como documento
     `kind = "investigacion"` (id `tema:<slug>`).
   El reindex incremental por hash y la limpieza de lo que ya no existe
   funcionan igual que para fichas.
3. **`ask`** (`ask.ts`): las fuentes llevan su tipo. En el contexto, cada fuente
   se rotula ("ficha guardada" vs. "investigación, revisada AAAA-MM-DD"). El
   prompt instruye: cuando la respuesta sale de investigación, decirlo
   («según la investigación del 12-oct…»). La numeración `[n]` sigue siendo
   única (no se introduce `[Rn]`). En la lista de fuentes del mensaje, las de
   investigación se muestran como «🔎 n8n (investigado 12-oct)».
4. **Reenvío del resumen**: tras un pull, por cada archivo nuevo en
   `_investigacion/resumenes/` que no esté marcado en SQLite
   (`research_notified`), se envía su contenido con `notifyAdmin` y se marca.
   El primer arranque marca los existentes sin enviarlos.
5. **Alerta de silencio**: en el chequeo diario existente, si la última fecha de
   `registro.md` tiene > 8 días (y el registro existe), se avisa una vez por
   Telegram: «La investigación semanal no corre desde …».
6. **`renderTopic`**: sin cambios de código; una prueba garantiza que el bloque
   `kb:research` sobrevive a la regeneración del tema.

## Manejo de errores

| Falla | Efecto |
|---|---|
| El agente no corre o falla a medias | Sin push → la base queda igual; alerta de silencio a los 8 días |
| Nota inválida | `validar.mjs` la rechaza; no se sube |
| Conflicto de push del agente | `pull --rebase` y reintento (zonas disjuntas) |
| Pull del bot con conflicto | `rebase --abort`, aviso; la base local queda intacta |
| Pull durante un guardado | Espera en la cadena serial del bot y corre al terminar el guardado |
| Resumen ilegible o vacío | Se marca como notificado y se registra un warning |

## Pruebas

En `test/kb.ts` (mismo estilo que las existentes):

- Trozos de una nota de referencia por sección; `Mis notas` incluido.
- Extracción del bloque `kb:research` de un tema (y ausencia sin marcadores).
- `renderTopic` sobre un tema con bloque `kb:research` lo deja intacto.
- `groupSources`/contexto de `ask` rotula fuentes de investigación.
- Detección de resúmenes nuevos vs. ya notificados (función pura).
- Cálculo de la alerta de silencio a partir de `registro.md` (función pura).
- `validar.mjs`: casos válidos e inválidos (sin fuente, `[n]` fuera de rango,
  `tipo` desconocido, fecha inválida, bloque sin cerrar).

Prueba de punta a punta antes de activar la tarea semanal:

1. Correr el agente a mano sobre 1 tema real en una rama de `ia-es-kb`.
2. Revisar las notas con el usuario; ajustar `INSTRUCCIONES.md`.
3. Merge → el bot hace pull → pregunta por DM de Instagram que solo se
   responda con lo investigado → la respuesta lo cita como investigación.
4. Activar la tarea semanal.

## Puesta en marcha

- Conectar GitHub en claude.ai con acceso al repo privado `fnvasque/ia-es-kb`
  (clonar y push desde la nube).
- Crear la tarea programada semanal (domingo 04:00 America/Santiago).
- Desplegar el bot con `scripts/deploy-to-server.sh`.

## Fuera de alcance

- Conectar Claude Code a la base para desarrollar (proyecto 2).
- Investigación a pedido por DM («investiga X»).
- Investigar desde el bot con la API de OpenAI (opción descartada).
