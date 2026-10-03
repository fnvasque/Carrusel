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
   Tampoco modificas `_investigacion/validar.mjs` ni este manual: si el validador
   falla por algo que no es tuyo, descarta la corrida y explícalo en el resumen.
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
4. **Español**, directo y concreto.
5. **Validar antes de subir.** `node _investigacion/validar.mjs --desde <sha inicial>`
   debe terminar con ✓. Si algo falla, corrígelo o descarta ese archivo. Nunca
   subas una corrida que no pase.

## Paso 1 — Preparación

```bash
INICIO=$(git rev-parse HEAD)
HOY=$(TZ=America/Santiago date +%F)
```

## Paso 2 — Elegir temas (máximo 5)

Para cada `temas/<Tema>.md`:

- Última revisión = la fecha más reciente de ese tema en `_investigacion/registro.md`
  (líneas `- AAAA-MM-DD · <Tema> · …`). Sin línea = nunca revisado.
- Fichas del tema = fichas de `fuentes/` cuyo frontmatter `tema:` es `[[<Tema>]]`
  o cuya lista `temas_secundarios:` lo incluye (el valor puede venir entre comillas
  simples o dobles: compara el texto de adentro).
- Fichas nuevas = fichas del tema cuyo `guardado:` es posterior a la última
  revisión (todas si nunca se revisó).

Elegibles: con ≥ 1 ficha nueva, o con última revisión hace > 30 días. Orden: más
fichas nuevas primero; luego los más antiguos. Toma los primeros 5.

Si no hay elegibles, igual deja constancia de que corriste (si no, el bot avisa que
la investigación dejó de correr): agrega a `_investigacion/registro.md` la línea
`- <HOY> · (sin temas elegibles) · 0 referencias (0 nuevas)`, valida, commitea
(`investigación: sin temas elegibles`), sube y termina. No escribas resumen.

## Paso 3 — Por cada tema

1. Lee la página del tema y sus fichas (empieza por las nuevas).
2. Elige hasta **8 referencias**: cosas concretas que se repiten entre fichas o
   son centrales para el tema (una herramienta, un producto, un libro, un
   método, una persona, un lugar, un concepto). Ignora lo anecdótico y las fichas
   sin contenido concreto (p. ej. "comenta X y te envío el link").
   Para el `tipo`: `metodo` es algo que se aplica con pasos (una técnica, una
   receta, un proceso); `concepto` es una idea o arquitectura que se explica.
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

## Mis notas
```

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

## Paso 4 — Registro y resumen

- Agrega al final de `_investigacion/registro.md` (créalo con `# Registro de investigación` si no existe) una línea por tema:
  `- <HOY> · <Tema> · <n> referencias (<m> nuevas)`
- Escribe `_investigacion/resumenes/<HOY>.md` (máximo 1000 caracteres, sin frontmatter).
  Si ya existe (hoy hubo otra corrida), no lo toques: usa `<HOY>-2.md`, `<HOY>-3.md`…
  Contenido: qué temas revisaste, qué cambió y las 3 novedades más útiles. Es lo
  que el usuario recibe por Telegram.

## Paso 5 — Validar y subir

```bash
node _investigacion/validar.mjs --desde "$INICIO"
git add referencias _investigacion temas CLAUDE.md
git commit -m "investigación: <Tema 1>, <Tema 2>…"
git push || (git pull --rebase && git push)
```

Si después del `pull --rebase` hay conflicto en un archivo de `temas/`, conserva la
zona `kb:auto` del remoto y tu bloque `kb:research`, valida de nuevo y sube.
