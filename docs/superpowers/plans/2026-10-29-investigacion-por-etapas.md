# Investigación por etapas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la investigación semanal escriba para quien está aprendiendo, clasifique por las cuatro etapas del coaching, conecte referencias entre sí, atienda las preguntas de las sesiones y se pueda medir su cobertura, para luego llenar el banco con una tanda intensiva.

**Architecture:** todo vive en la plantilla `kb-plantilla/_investigacion/` (manual + validador sin dependencias) y se instala en la base con `scripts/kb-research-install.sh`. El validador gana un contexto opcional (etapas, slugs, preguntas) que `main` arma desde la base; las funciones puras siguen probándose desde `test/kb.ts`. La rutina de la nube gana la herramienta `Task` para el lector aprendiz.

**Tech Stack:** Node (ESM, sin dependencias) para el validador; tests en TypeScript con `tsx` (`test/kb.ts`, helper `check`).

**Spec:** `docs/superpowers/specs/2026-10-29-investigacion-por-etapas-design.md`

## Global Constraints

- Etapas (ids exactos, en este orden): `perder-el-miedo`, `adoptar`, `liderar`, `revalorizarse`.
- `DESDE_ETAPAS = "2026-10-28"` (día anterior a la instalación).
- Rótulos de `## Para la audiencia` desde `DESDE_ETAPAS`: `Dicho simple`, `Por qué importa`, `Qué se puede hacer`, `Lo que no sabe quien está empezando`, `Para quién`, `Límites`. Antes de la fecha, las reglas actuales sin cambios.
- `MAX_DICHO = 400` caracteres (texto después del rótulo, en una línea).
- Conexión: `tipo: conexion`, `conecta` ≥ 3 slugs distintos que existen y no son conexiones, `fuentes` de ≥ 2 dominios distintos (sin `www.`), sección `## Cómo se conectan`.
- Meta de cobertura por etapa: `META_REFERENCIAS = 8`, `META_CONEXIONES = 3`; «lista» = aplica a la cuenta, `revisado` ≤ 60 días respecto de hoy, con `etapa`, `Dicho simple` y `aprendiz` = `revisado`.
- Validador sin dependencias; ninguna regla nueva invalida notas con `revisado` < `DESDE_ETAPAS`.
- Archivos protegidos nuevos (el agente no los toca): `_investigacion/lector-aprendiz.md`, `_investigacion/preguntas.md`.
- Todo texto para el usuario en español. Puerta: `npm run typecheck && npm test`.

## Review Focus

1. Nota vieja (`revisado` 2026-10-25) tocada por el bot o el usuario sin cambiar `revisado`: debe seguir válida (no exigir etapa ni Dicho simple). → test en Tarea 1.
2. `conecta` con `[[slug|Nombre]]` o con comillas: se acepta igual que `[[slug]]`. → test en Tarea 2.
3. `preguntas.md` con la línea de ejemplo `AAAA-MM-DD · …` o vacío: no cuenta como pregunta pendiente. → test en Tarea 3.
4. `alcance.json` instalado sin clave `etapas` (base vieja): el validador no revienta; con `etapas` ausente, no valida ids de etapa. → test en Tarea 1.
5. Una conexión que se conecta a otra conexión o a sí misma: error claro. → test en Tarea 2.

---

### Task 1: Etapa, Dicho simple, rótulo nuevo y aprendiz en el validador

**Files:**
- Modify: `kb-plantilla/_investigacion/validar.mjs` (constantes, `validateReferencia`, `validateAudiencia`, `validateAlcance`)
- Modify: `kb-plantilla/_investigacion/validar.d.mts`
- Modify: `kb-plantilla/_investigacion/alcance.json`
- Test: `test/kb.ts` (sección «validador del agente de investigación»)

**Interfaces:**
- Produces: `DESDE_ETAPAS: string`, `ETAPAS: string[]` (los 4 ids), `ROTULO_DICHO = "Dicho simple"`, `ROTULO_EMPIEZA = "Lo que no sabe quien está empezando"`, `MAX_DICHO = 400`.
- Produces: `type Contexto = { etapas?: string[]; slugs?: Set<string>; preguntas?: string[] }`; `validateReferencia(text: string, ctx?: Contexto): string[]` (sin ctx: no valida existencia de ids/slugs/preguntas, sí la forma).
- Produces: `dichoSimple(body: string): string | undefined` (texto del rótulo sin el prefijo).

- [ ] **Step 1: tests que fallan.** Con un `REF_ETAPAS` = `REF_OK` con `revisado: 2026-10-30`, `etapa: [adoptar]`, `aprendiz: 2026-10-30` y los seis rótulos nuevos (Dicho simple con `[1]`):
  - `validateReferencia(REF_ETAPAS, { etapas: ETAPAS })` → `[]`.
  - sin `etapa` → error que menciona `etapa`; con `etapa: [aprender]` y ctx → error que menciona `aprender`; sin ctx → no hay error por el id.
  - sin `aprendiz`, o `aprendiz: 2026-10-29` → error que menciona `aprendiz`.
  - Dicho simple sin `[n]` → error; con 401 caracteres → error que menciona `400`.
  - con el rótulo viejo «Lo que no sabe un usuario frecuente» en vez del nuevo → error que menciona «quien está empezando».
  - «No aplica a la cuenta: …» con `revisado: 2026-10-30` y sin `etapa` ni `aprendiz` → `[]`.
  - Review Focus 1: `REF_OK` con `revisado: 2026-10-25` y el rótulo viejo → `[]` (regla vieja intacta).
  - `alcance.json` de la plantilla: `dentro` incluye «Desarrollo de habilidades y carrera profesional» e «Ingeniería de agentes de IA»; `Object.keys(a.etapas)` = `ETAPAS`; `enfoqueIA["Desarrollo de habilidades y carrera profesional"]` existe; `validateAlcance` → `[]`.
  - `validateAlcance` con `etapas: { "X Y": "" }` → error; Review Focus 4: sin `etapas` → `[]`.
- [ ] **Step 2:** `npx tsx test/kb.ts` → FALLA en los nuevos checks.
- [ ] **Step 3: implementar.** `validateAudiencia(body, revisado)`: si `revisado >= DESDE_ETAPAS`, la lista de rótulos es la nueva (reemplaza el de novedad), más el control de `dichoSimple` (cita y largo). `validateReferencia`: si `revisado >= DESDE_ETAPAS` y la audiencia no es «No aplica», exige `etapa` (string o lista no vacía; ids ∈ `ctx.etapas` si viene) y `aprendiz === revisado`. `alcance.json`: mover los dos temas de ninguna lista a `dentro`, agregar `enfoqueIA` de Desarrollo de habilidades («qué habilidades suben o bajan de valor cuando la IA hace parte del trabajo, y cómo se desarrollan») y la clave `etapas` con una línea por id (textos del spec, sección Objetivos 1). Actualizar `.d.mts`.
- [ ] **Step 4:** `npx tsx test/kb.ts` y `npm run typecheck` → PASAN.
- [ ] **Step 5:** commit `investigación: etapa, dicho simple y lector aprendiz en el validador`.

### Task 2: Conexiones

**Files:** `validar.mjs`, `validar.d.mts`, `test/kb.ts`

**Interfaces:**
- Consumes: `Contexto.slugs` (Tarea 1).
- Produces: `TIPOS` incluye `"conexion"`; `slugDeEnlace(s: string): string` (`"[[a-b|A B]]"` → `"a-b"`).

- [ ] **Step 1: tests que fallan** con `CONEXION_OK` (tipo conexion, `conecta` de 3 slugs, fuentes de 2 dominios, secciones Qué es / Datos clave / Cómo se conectan / Para la audiencia nueva):
  - `validateReferencia(CONEXION_OK, { slugs: new Set(["a","b","c"]) })` → `[]`.
  - 2 slugs → error `≥ 3`; un slug fuera de `slugs` → error con ese slug; fuentes `https://www.x.com/1` y `https://x.com/2` → error de dominios; sin `## Cómo se conectan` → error.
  - Review Focus 2: `conecta: ["[[a|A]]", "'[[b]]'", "[[c]]"]` → `[]`.
  - Review Focus 5: `conecta` incluye el slug propio (`ctx` pasa también `slugPropio`) o un slug de conexión (no está en `slugs`) → error.
- [ ] **Step 2:** correr → FALLA.
- [ ] **Step 3: implementar** las reglas dentro de `validateReferencia` cuando `tipo === "conexion"`; `Contexto` suma `slugPropio?: string`. `main` arma `slugs` = referencias cuyo tipo no es conexion.
- [ ] **Step 4:** tests y typecheck → PASAN.
- [ ] **Step 5:** commit `investigación: notas de conexión entre referencias`.

### Task 3: Preguntas, lector aprendiz, cobertura y archivos protegidos

**Files:**
- Modify: `validar.mjs`, `validar.d.mts`, `test/kb.ts`
- Create: `kb-plantilla/_investigacion/lector-aprendiz.md`, `kb-plantilla/_investigacion/preguntas.md`

**Interfaces:**
- Produces: `parsePreguntas(text: string): string[]` (líneas `- AAAA-MM-DD · <etapa> · <pregunta>` con fecha válida, sin el `- `); `responde:` validado contra `ctx.preguntas`.
- Produces: `mensajeAprendiz(nota: string, lector: string): string` — `lector` es el texto de `lector-aprendiz.md`; devuelve la sección `## Para el lector` + `Dicho simple` y `Qué se puede hacer` sin `[n]`, sin nombre, tema ni fuentes, entre `===` y `=== FIN ===`.
- Produces: `cobertura(root: string, hoy: string): { etapas: { etapa: string; referencias: number; conexiones: number; falta: boolean }[]; preguntasPendientes: string[] }`.
- CLI: `--aprendiz <slug>` imprime `mensajeAprendiz`; `--cobertura` imprime una línea por etapa (`adoptar · 5/8 referencias · 1/3 conexiones · FALTA`) y las preguntas pendientes.

- [ ] **Step 1: tests que fallan:**
  - `parsePreguntas` ignora la línea de ejemplo `AAAA-MM-DD · …` y líneas mal formadas (Review Focus 3); devuelve la línea válida tal cual.
  - nota con `responde: ["2026-10-30 · adoptar · ¿qué es un agente?"]` y `ctx.preguntas` sin esa línea → error; con ella → `[]`.
  - `mensajeAprendiz` no contiene `[1]`, el `nombre`, el tema ni ninguna URL; contiene el Dicho simple y «=== FIN ===».
  - `cobertura` sobre una base temporal (`mkdtempSync`) con 1 referencia lista de `adoptar`, 1 vieja (> 60 días), 1 conexión lista y `preguntas.md` con 1 pregunta respondida y 1 pendiente → `adoptar` = 1 referencia, 1 conexión, `falta: true`; `preguntasPendientes` = la no respondida.
  - `zoneErrors` marca `_investigacion/lector-aprendiz.md` y `_investigacion/preguntas.md` como del usuario.
  - `lector-aprendiz.md` de la plantilla tiene `## Para el lector` con las tres preguntas del spec y formato JSON.
- [ ] **Step 2:** correr → FALLA.
- [ ] **Step 3: implementar**; `lector-aprendiz.md` sigue el estilo de `_calendario/lector-frio.md` (perfil del público nivel cero, 3 preguntas, JSON `{ "1": …, "2": …, "3": … }`, criterio de paso para el agente y tope de 3 intentos). `preguntas.md` con el formato y la línea de ejemplo, como `pedidos.md`.
- [ ] **Step 4:** tests y typecheck → PASAN.
- [ ] **Step 5:** commit `investigación: preguntas de sesiones, lector aprendiz y cobertura por etapa`.

### Task 4: Manual, CLAUDE.md, instalador y planificador

**Files:**
- Modify: `kb-plantilla/_investigacion/INSTRUCCIONES.md`, `kb-plantilla/CLAUDE.md`, `scripts/kb-research-install.sh`
- Modify: `kb-plantilla/_calendario/INSTRUCCIONES.md` (Paso 3), `kb-plantilla/_calendario/guia-redaccion.md:157`, `kb-plantilla/_calendario/reglas.json`
- Test: `test/kb.ts`

- [ ] **Step 1: tests que fallan:** el manual menciona `--aprendiz`, `--cobertura`, `preguntas.md`, `conexion`, `Dicho simple` y «Lo que no sabe quien está empezando»; ya no dice «ya paga Claude o ChatGPT»; `reglas.json` tiene una regla `investigacion-por-etapas` con `desde` `2026-11-02`; el instalador copia `lector-aprendiz.md` y crea `preguntas.md` solo si no existe (`grep` sobre el script).
- [ ] **Step 2:** correr → FALLA.
- [ ] **Step 3: redactar.** Manual: zonas (archivos protegidos nuevos), Paso 2 con el orden nuevo (pedidos → preguntas → candidatos → etapa con menos cobertura según `--cobertura` → resto), Paso 3 con el público nuevo, etapa, Dicho simple (con el ejemplo bueno del spec y el malo como contraejemplo), conexiones (1–2 por tema, no afirmar nada que las fuentes no digan) y lector aprendiz (subagente con Agent/Task, 3 intentos, `aprendiz: <HOY>`), «completar referencias» con el rótulo nuevo, resumen con la cobertura. `CLAUDE.md`: describe `referencias/` con el público nuevo y las conexiones. Planificador: en Paso 3 preferir etapas `perder-el-miedo`/`adoptar` y conexiones para `por-donde-partir` y partir del Dicho simple; `guia-redaccion.md` acepta los dos rótulos. `npm run test` del calendario no debe romperse.
- [ ] **Step 4:** `npm run typecheck && npm test` → PASAN.
- [ ] **Step 5:** commit `investigación: manual por etapas, instalador y planificador`.

### Task 5: Revisión, PR, merge, instalación y rutina

- [ ] **Step 1:** `/codex:adversarial-review` sobre la rama; atender hallazgos reales.
- [ ] **Step 2:** push de `claude/investigacion-coaching` y PR a `main`; merge cuando pase la revisión y la puerta.
- [ ] **Step 3:** instalar: `scripts/kb-research-install.sh` sobre un clon fresco de `ia-es-kb` (no `knowledge/`), y copiar `alcance.json` de la plantilla una vez (autorizado). Esperado: `✓ Investigación válida.` y push.
- [ ] **Step 4:** `RemoteTrigger update` de `trig_018UQ9su9JCUQNeuYY9vS1kC`: `allowed_tools` + `Task`, y el prompt menciona el lector aprendiz con subagentes Agent/Task y `--cobertura`. Verificar con `get`.

### Task 6: Tanda intensiva

- [ ] **Step 1:** lista de la corrida 1 = referencias citadas en `_calendario/*/` (rutas `referencias/…`), completada hasta 30 con las de temas `dentro` de `revisado` más reciente; agrupar en ≤ 6 temas.
- [ ] **Step 2:** `RemoteTrigger run` con el mensaje «Corrida extra (puesta al día): completar referencias: …».
- [ ] **Step 3:** al terminar: log de la corrida, `validar.mjs` y `--cobertura` en un clon fresco, lectura propia de 3 notas al azar contra los anti-objetivos.
- [ ] **Step 4:** siguiente corrida con lo que falte (los dos temas nuevos, luego conexiones por etapa); repetir hasta la meta o 5 corridas; cortar el sábado 2026-10-31 23:00 de Chile.
- [ ] **Step 5:** informe final con la cobertura por etapa y lo que quedó corto.
