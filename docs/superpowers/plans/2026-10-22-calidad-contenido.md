# Calidad del contenido — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el planificador escriba para el público nuevo (profesional de cargo medio que ya paga ChatGPT o Claude), con prueba de novedad, juez de hooks, guía de redacción, series reenfocadas, reels de 35 s y carruseles densos.

**Architecture:** Casi todo vive en la plantilla de la base (`kb-plantilla/`): manuales, lector frío, guías nuevas y los dos validadores (`.mjs`, sin dependencias). Las reglas nuevas se activan por fecha (`DESDE_CALIDAD = "2026-10-26"`) para que las semanas pasadas sigan validando. En el código TS solo cambian `src/calendario/lector-causas.ts` y, si hace falta, `src/score/virality.ts`.

**Tech Stack:** Node ESM (`validar.mjs`), TypeScript con `tsx`, tests con `check()` de `test/_check.ts` y `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-10-22-calidad-contenido-design.md`

## Global Constraints

- Idioma: comentarios, textos y commits en español; identificadores como estén.
- Puerta: `npm run typecheck && npm test` en 0 y `node kb-plantilla/_calendario/validar.mjs --self-test` en ✓ al final de cada tarea.
- No editar ni borrar tests existentes para que pasen.
- Fecha de activación: `DESDE_CALIDAD = "2026-10-26"` (calendario) y `DESDE_NOVEDAD = "2026-10-25"` (investigación). Semanas anteriores validan como hoy.
- Semanas del paquete (sin experimento propio): `2026-10-26` y `2026-11-02`.
- Series válidas desde `DESDE_CALIDAD`: `hazlo-con-ia`, `criterio`, `lo-probe-por-ti`. `gratis-vs-pago` deja de ser válida.
- Topes: `duracionMaxSegundos` = 35 (plantilla `config.json`), `cuerpoMaxPalabrasCarrusel` = 50, `bulletMaxPalabras` sigue en 12, `hookUmbral` sigue en 8.
- Hooks: 8 a 10 candidatos por pieza, de al menos 3 patrones; `hook.score` = nota del juez.
- No tocar `knowledge/` desde el repo salvo con los instaladores, después del merge y con visto bueno del usuario (Tarea 9).
- La lista `FEAR` de `src/score/virality.ts` no cambia.
- Rama: `claude/calidad-contenido`. Nunca push a `main`.

## Review Focus

1. **Semanas pasadas** (`dia` < 2026-10-26) con `serie: "gratis-vs-pago"`, sin `hook.candidatos` y con experimento: deben seguir validando sin errores nuevos → test en Tarea 2 y Tarea 3.
2. **Hook editado después del juez**: el `title`/`subtitle` del `Hook` del borrador difiere del candidato elegido → error que nombra ambos textos. Test en Tarea 2.
3. **Semana 2026-11-09** (fuera del paquete): vuelve a exigir experimento con variable → test en Tarea 3.
4. **`parametros.duracionMaxSegundos: 60`** en una pieza de semana del paquete → error (no se pisa el tope) → test en Tarea 3.
5. **Body de 45 palabras**: pasa en carrusel, falla en reel → test en Tarea 5.

---

### Task 1: Investigación para el público nuevo

**Files:**
- Modify: `kb-plantilla/_investigacion/INSTRUCCIONES.md` (Paso 3: «persona no técnica» → el público nuevo; plantilla de `## Para la audiencia` con el rótulo nuevo y **Para quién** con roles de trabajo)
- Modify: `kb-plantilla/_investigacion/validar.mjs` (`validateAudiencia`)
- Modify: `kb-plantilla/_investigacion/alcance.json` (sincronizar con la base y aplicar el corte)
- Test: `test/kb.ts`

**Interfaces:**
- Produces: `export const DESDE_NOVEDAD = "2026-10-25"`; `validateAudiencia(body: string, revisado?: string): string[]`; rótulo exacto `Lo que no sabe un usuario frecuente`.

- [ ] **Step 1: Tests que fallan** en `test/kb.ts`:
  - `validateAudiencia(cuerpoSinRotuloNuevo, "2026-10-25")` incluye un error que contiene `Lo que no sabe un usuario frecuente`.
  - `validateAudiencia(cuerpoSinRotuloNuevo, "2026-10-24")` devuelve `[]`, igual que hoy.
  - `validateAudiencia(cuerpoConRotuloNuevo, "2026-10-25")` devuelve `[]`.
  - `validateAlcance(readFileSync("kb-plantilla/_investigacion/alcance.json"))` devuelve `[]`, y el `fuera` incluye `Creación de contenido para redes sociales`, `Monetización con Inteligencia Artificial`, `Finanzas personales con IA`, `Producción de contenido automatizado` y `Herramientas de desarrollo open source`.
- [ ] **Step 2:** `npx tsx test/kb.ts`. Esperado: fallan los cuatro.
- [ ] **Step 3: Implementar.** `validateAudiencia` exige el rótulo nuevo solo si `revisado >= DESDE_NOVEDAD`; el llamador (línea ~96) le pasa `data.revisado`. `alcance.json` de la plantilla = el de la base (`knowledge/_investigacion/alcance.json`, solo lectura) con el corte del spec: Marketing → `despues`; Liderazgo, Modelos mentales y Psicología en `dentro`; Avances en `dentro`; Emprendimiento en `despues`; `enfoqueIA` de Liderazgo y Productividad suma «qué pasa con tu rol y tus habilidades cuando la IA hace parte del trabajo». Manual: el texto nuevo del Paso 3 y la plantilla de la nota.
- [ ] **Step 4:** `npx tsx test/kb.ts` → PASS; `npm run typecheck` → 0.
- [ ] **Step 5: Commit** `investigacion: público profesional y campo «lo que no sabe un usuario frecuente»`.

### Task 2: Hook con candidatos y juez (validador)

**Files:**
- Modify: `kb-plantilla/_calendario/validar.mjs` (`erroresDePieza`, `erroresDeBorrador`, `main`, y una función nueva junto a `imprimirLector`)
- Create: `kb-plantilla/_calendario/guia-hooks.md` (solo la sección `## Para el juez` en esta tarea; el resto en la Tarea 6)
- Test: `test/calendario/validar.ts`

**Interfaces:**
- Produces:
  - `export const DESDE_CALIDAD = "2026-10-26"`
  - `export const PATRONES_HOOK = ["en-juego", "error-comun", "dato-contrario", "antes-despues", "pregunta-del-jefe", "resultado"]`
  - Forma de `pieza.hook` desde `DESDE_CALIDAD`: `{ categoria, texto, score, candidatos: Array<{ patron: string, title: string, subtitle?: string, resultado?: string }>, juez: { elegido: number, nota: number, respuestas: string } }`
  - `export function erroresDeHookJuez(p: object, borrador?: object): string[]`
  - `export function mensajeJuez(seccion: string, candidatos: object[]): string` (enumera los candidatos `1.`, `2.`… con title / subtitle / resultado; no incluye patrón, tema ni entregable)
  - CLI: `node _calendario/validar.mjs --juez <semana> <id>` imprime `=== MENSAJE PARA EL SUBAGENTE JUEZ (pégalo tal cual) === … === FIN ===`, leyendo `## Para el juez` de `guia-hooks.md`.

- [ ] **Step 1: Tests que fallan** (`check("hook-juez: …")`), con una pieza de `dia: "2026-10-27"`:
  - 7 candidatos → error que contiene `8 a 10 candidatos`.
  - 9 candidatos de 2 patrones → error que contiene `al menos 3 patrones`.
  - Patrón `"gancho"` → error que contiene `PATRONES_HOOK` o la lista de patrones.
  - `juez.nota` 9 y `hook.score` 8 → error `hook.score debe ser la nota del juez`.
  - `hook.texto` distinto de `candidatos[juez.elegido].title` → error.
  - Borrador cuyo `Hook.props.title` o `subtitle` difiere del candidato elegido → error que cita los dos textos (Review Focus 2).
  - La misma pieza con `dia: "2026-10-20"` y sin `candidatos`/`juez` → sin errores de hook (Review Focus 1).
  - `mensajeJuez(seccion, cands)` contiene `1. ` y el `title` de cada candidato, y no contiene `patron` ni el valor del patrón.
- [ ] **Step 2:** `npx tsx test/calendario.ts`. Esperado: fallan los nuevos.
- [ ] **Step 3: Implementar.** `erroresDePieza` llama a `erroresDeHookJuez(p)` cuando `p.dia >= DESDE_CALIDAD`; `erroresDeBorrador` compara el `Hook` contra el candidato elegido con la misma condición. El CLI sigue el patrón de `imprimirLector`. `## Para el juez` en `guia-hooks.md`: perfil del público nuevo y, por candidato, tres preguntas (¿pararías el pulgar?, ¿te importa para tu trabajo?, ¿qué crees que te llevas?); respuesta solo JSON `{ "elegido": n, "nota": 0-10, "porCandidato": {...} }`.
- [ ] **Step 4:** `npx tsx test/calendario.ts` → PASS; `--self-test` → ✓.
- [ ] **Step 5: Commit** `calendario: hook elegido por un juez separado entre 8 a 10 candidatos`.

### Task 3: Series nuevas y semanas del paquete sin experimento

**Files:**
- Modify: `kb-plantilla/_calendario/validar.mjs` (`erroresDePieza` serie; `validarPlan` experimento ~l.1408; `erroresDeParametros`)
- Test: `test/calendario/validar.ts`

**Interfaces:**
- Consumes: `DESDE_CALIDAD` (Tarea 2).
- Produces: `export const SERIES_CALIDAD = ["hazlo-con-ia", "criterio", "lo-probe-por-ti"]`; `export const SEMANAS_PAQUETE = ["2026-10-26", "2026-11-02"]`; `export const MOTIVO_PAQUETE = "paquete calidad-contenido"`.

- [ ] **Step 1: Tests que fallan:**
  - Pieza `dia: "2026-10-28"`, `serie: "gratis-vs-pago"` → error que lista `SERIES_CALIDAD`; con `"criterio"` → sin error; con `dia: "2026-10-21"` y `"gratis-vs-pago"` → sin error.
  - Plan de la semana `2026-10-26` con `experimento: { variable: null, motivo: "paquete calidad-contenido" }` → sin error de experimento.
  - Plan de `2026-10-26` con `experimento: { variable: "hook", … }` → error que contiene `paquete calidad-contenido`.
  - Plan de `2026-11-09` con `experimento: null` → `plan: falta experimento` (Review Focus 3).
  - Pieza de `2026-11-03` con `parametros: { duracionMaxSegundos: 60 }` → error; lo mismo con `ritmoReel` (Review Focus 4).
- [ ] **Step 2:** `npx tsx test/calendario.ts` → fallan los nuevos.
- [ ] **Step 3: Implementar.** La semana del plan es su lunes (el mismo valor que ya usa `validarPlan`). El mensaje de la serie actualiza los ejemplos del texto de error.
- [ ] **Step 4:** `npx tsx test/calendario.ts` → PASS.
- [ ] **Step 5: Commit** `calendario: series para el público nuevo y semanas del paquete sin experimento`.

### Task 4: Lector frío con el público nuevo y pregunta 8

**Files:**
- Modify: `kb-plantilla/_calendario/lector-frio.md` (perfiles completo y con prisa = público nuevo; pregunta 8 literal del spec; formato de respuesta con `"8"`; criterio 8: el completo bloquea «nada nuevo» o algo que la pieza no enseña, el con prisa bloquea solo «nada nuevo»; «con prisa cuentan 1, 2, 5, 7 y 8»)
- Modify: `src/calendario/lector-causas.ts` (`CAUSAS`)
- Test: `test/calendario/lector-causas.ts`, `test/calendario/validar.ts`

**Interfaces:**
- Produces: causa `{ id: "nada-nuevo", pregunta: 8, descripcion: "El lector ya sabía lo que la pieza enseña", claves: [/nada nuevo/, /ya (lo )?sabia/, /ya lo conocia/] }`.

- [ ] **Step 1: Tests que fallan:**
  - `causasDeFallo("v1: el lector completo respondió nada nuevo en P8")` incluye `"nada-nuevo"`.
  - `seccionDelLector(readFileSync("kb-plantilla/_calendario/lector-frio.md"))` contiene `cargo medio`, `ya paga` y `8. ¿Qué aprendiste que no sabías`; no contiene `no técnico, viendo esto`.
- [ ] **Step 2:** `npx tsx test/calendario.ts` → fallan.
- [ ] **Step 3: Implementar** los textos y la causa (si `seccionDelLector` no se exporta, exportarla).
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `lector frío: público profesional y prueba de novedad (P8)`.

### Task 5: Carruseles densos y reels de 35 s

**Files:**
- Modify: `kb-plantilla/_calendario/validar.mjs` (`PUERTA_DEFECTO`, `validarConfig`, `reglasDeTexto` ~l.469)
- Modify: `kb-plantilla/_calendario/config.json` (`puerta.duracionMaxSegundos.valor` 20 → 35 con nota fechada 2026-10-22; nuevo `puerta.cuerpoMaxPalabrasCarrusel: { valor: 50, respaldo: "supuesto", nota: "2026-10-22: entrevistas, carruseles llevan la profundidad" }`)
- Test: `test/calendario/validar.ts`

**Interfaces:**
- Produces: clave de puerta `cuerpoMaxPalabrasCarrusel` (número > 0; por defecto = `cuerpoMaxPalabras`).

- [ ] **Step 1: Tests que fallan:**
  - `reglasDeTexto(borradorConBody45, config, "carrusel")` no contiene `puerta.cuerpoMaxPalabras`; con `"reel"` sí (Review Focus 5).
  - Body de 51 palabras en carrusel → error que contiene `cuerpoMaxPalabrasCarrusel`.
  - `validarConfig` de la plantilla → sin errores; con `cuerpoMaxPalabrasCarrusel: { valor: 0 }` → error.
  - Reel de ~30 s (`duracionReel` entre 25 y 35) con la config de la plantilla → `erroresDeRetencion` vacío.
- [ ] **Step 2:** fallan.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** PASS; `--self-test` ✓.
- [ ] **Step 5: Commit** `puerta: carruseles hasta 50 palabras de cuerpo y reels hasta 35 s`.

### Task 6: Guías y manual del planificador

**Files:**
- Modify: `kb-plantilla/_calendario/guia-hooks.md` (completa; ver spec §4: qué está en juego, los patrones de `PATRONES_HOOK` con un par malo/bueno cada uno, sacados de `knowledge/_calendario/2026-10-19/`; la regla 8 sigue)
- Create: `kb-plantilla/_calendario/guia-redaccion.md` (spec §5: idea completa por escena, números con contexto, la voz explica, la prueba del «¿y?», pares mal → bien de la semana 2026-10-19, checklist final)
- Modify: `kb-plantilla/_calendario/INSTRUCCIONES.md`:
  - el párrafo de audiencia (l.12-14);
  - la regla 8: el resultado puede ser profesional;
  - el Paso 4: la tabla de series del spec §7, sin «en 20 s», y la suspensión del experimento en `SEMANAS_PAQUETE` con `MOTIVO_PAQUETE`;
  - el Paso 5: orden obligatorio con la guía de redacción antes del lector y el hook por candidatos + `--juez` (reemplaza la autoevaluación de 4 criterios);
  - «Tope de duración del reel» y las reglas prácticas para 35 s;
  - los carruseles con `cuerpoMaxPalabrasCarrusel`;
  - el esqueleto y el ejemplo de `plan.json` con `candidatos` y `juez`;
  - los ejemplos de «gratis» en hooks cambiados por ejemplos del público nuevo.
- Modify: `scripts/kb-calendario-install.sh` (copiar y agregar `guia-hooks.md` y `guia-redaccion.md` a `cp` y a `ADD`)
- Modify: `kb-plantilla/CLAUDE.md` (listar las dos guías entre los archivos del usuario)
- Test: `test/calendario/validar.ts`

- [ ] **Step 1: Tests que fallan:**
  - El manual contiene `guia-redaccion.md`, `guia-hooks.md`, `--juez` y `criterio`, y no contiene `gratis-vs-pago`.
  - `scripts/kb-calendario-install.sh` contiene `guia-hooks.md` y `guia-redaccion.md` dos veces cada uno (en `cp` y en `ADD`).
  - `guia-hooks.md` tiene un encabezado `## ` por cada valor de `PATRONES_HOOK` y la sección `## Para el juez`.
  - El `EJEMPLO` embebido valida sin errores con `validarSemana`. Si el ejemplo cae en una fecha ≥ `DESDE_CALIDAD`, lleva `candidatos` y `juez`.
- [ ] **Step 2:** fallan.
- [ ] **Step 3: Escribir** los textos. Español neutro, tuteo, sin jerga.
- [ ] **Step 4:** PASS; `--self-test` ✓.
- [ ] **Step 5: Commit** `calendario: guías de hooks y redacción, manual para el público nuevo`.

### Task 7: El score léxico no castiga los hooks nuevos

**Files:**
- Create: `test/calendario/fixtures/calidad/` con `reel-hazlo.json`, `reel-criterio.json` y `carrusel-denso.json` (borradores escritos con las guías, sin «gratis» en el hook)
- Test: `test/calendario/validar.ts` (o el archivo donde ya se prueba `virality`)
- Modify (solo si el test falla por el hook): `src/score/virality.ts`, en la lista de tensión del hook (`ENEMY` o equivalente)

- [ ] **Step 1: Test** `check("score: piezas de calidad-contenido ≥ 75")`: `scoreReel` de los dos reels y `scoreCarousel` del carrusel, cada uno `>= 75`.
- [ ] **Step 2:** correrlo. Si pasa, saltar al Step 4.
- [ ] **Step 3: Solo si falla por puntos del hook:** agregar a la lista de tensión `"tu jefe"`, `"tu equipo"`, `"error"`, `"revisa"`. No tocar `FEAR`. Si falla por otra cosa, corregir el fixture, no el score.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `score: verificado con piezas del público nuevo` (agregar `+ tensión del hook` al mensaje si se tocó `virality.ts`).

### Task 8: `reglas.json` y puerta final

**Files:**
- Modify: `kb-plantilla/_calendario/reglas.json`
- Test: el test existente de reglas (`test/calendario/reglas.ts`) debe seguir pasando.

- [ ] **Step 1:** Agregar siete entradas con `desde: "2026-10-26"` y `fuente: "PR claude/calidad-contenido; spec 2026-10-22-calidad-contenido-design.md"`:
  - `publico-profesional-ia` (`null`)
  - `lector-novedad-p8` (`null`)
  - `hook-juez` (`null`)
  - `guia-redaccion` (`null`)
  - `reel-35s` (`reel`)
  - `carrusel-denso` (`carrusel`)
  - `series-publico-profesional` (`reel`)

  Cada una lleva la `descripcion` de su punto del spec.
- [ ] **Step 2:** `npm run typecheck && npm test` → 0; `node kb-plantilla/_calendario/validar.mjs --self-test` → ✓.
- [ ] **Step 3:** Probar contra las semanas reales: `node kb-plantilla/_calendario/validar.mjs --probar kb-plantilla/_calendario/config.json` y validar `knowledge/_calendario/2026-10-19` con el validador nuevo. Esperado: las semanas pasadas no tienen errores nuevos.
- [ ] **Step 4: Commit** `reglas: registra el paquete calidad-contenido desde 2026-10-26`. Abrir la PR (cuerpo con el resumen y el enlace al spec).

### Task 9: Aplicar en la base (después del merge, con visto bueno del usuario)

No es código. Se hace a mano y cada paso se le muestra al usuario antes de commitear en `knowledge/`:

- [ ] `scripts/kb-calendario-install.sh` y `scripts/kb-research-install.sh`.
- [ ] En `knowledge/_calendario/config.json` (el instalador no lo pisa): `duracionMaxSegundos` 35 y `cuerpoMaxPalabrasCarrusel` 50. Mostrar el diff.
- [ ] `knowledge/_investigacion/alcance.json` = la plantilla de la Tarea 1. Mostrar el diff.
- [ ] `knowledge/_investigacion/pedidos.md`: pedir que la corrida del 2026-10-25 priorice actualizar las referencias de los cuatro ejes e investigar estudios sobre empleo y habilidades frente a la IA.
- [ ] Hacerlo antes del sábado 2026-10-24 en la noche. Si no alcanza, cambiar `DESDE_CALIDAD` a `2026-11-02`, `SEMANAS_PAQUETE` a `["2026-11-02", "2026-11-09"]` y los `desde` de `reglas.json`, en una PR aparte.
