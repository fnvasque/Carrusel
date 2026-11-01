# Piezas que se entienden — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (ejecución inline; el
> usuario autorizó ejecutar sin esperar). Pasos con `- [ ]`.

**Goal:** que el planificador escriba piezas entendibles: guion de pasos al lector, P9 de corrido,
banco momento × capacidad, hasta 20 palabras por escena, `ensenar` sin voz, validador que mide
lo que se renderiza.

**Architecture:** reglas en `kb-plantilla/_calendario/*.md`; comprobaciones mecánicas en
`validar.mjs` (helpers puros exportados + uso en `validarBorrador`/`validarSemana`); causa nueva en
`src/calendario/lector-causas.ts`; instalador copia `momentos.md` si falta.

**Tech Stack:** Node ESM (`validar.mjs`), TypeScript + `tsx`, tests con `check()` de `test/_check.ts`.

**Spec:** `docs/superpowers/specs/2026-10-31-piezas-que-se-entienden-design.md`

## Global Constraints

- `DESDE_ENTENDER = "2026-11-09"` para guion y momento/capacidad; 4c y 4d para toda semana.
- No tocar `src/reel/timing.ts`, `config.json` (plantilla ni base), `lecturaPalabrasPorSegundo`, `duracionMaxSegundos`.
- No editar ni borrar tests existentes para que pasen; si uno cae por un cambio intencional, decirlo.
- Español en comentarios, commits y textos. Identificadores como estén.
- Terminado = `npm run typecheck && npm test` en 0 + `node kb-plantilla/_calendario/validar.mjs --self-test` en 0.

## Review Focus

1. Semana en paquete con `voz: true` (si se reconecta la voz): el pace sigue siendo `puerta.ritmoReel` → test en Tarea 1.
2. Config sin `voz` (undefined): se comporta como con voz (narración alarga) → test en Tarea 1.
3. `momentos.md` ausente en la base: error claro, no excepción → test en Tarea 3.
4. Semanas previas con `plan.json` ilegible o sin piezas: se ignoran sin romper → test en Tarea 3.
5. Pieza de `lo-que-construi` sin momento/capacidad: válida → test en Tarea 3.

---

### Tarea 1: ritmo vigente y narración sin voz (4c, 4d)

**Files:** Modify `kb-plantilla/_calendario/validar.mjs` (`segundosEscenas`, `duracionReel`, `erroresDeRetencion`, uso en ~615); Test `test/calendario/validar.ts`.

**Interfaces — Produces:** `ritmoVigente(config): Pace` (`"ensenar"` si `config.voz === false`, si no `puerta(config,"ritmoReel")`); `segundosEscenas(slides, pace = "ensenar", conVoz = true)`; `duracionReel(borrador, config?)` (sin voz si `config?.voz === false`).

- [ ] Tests: `ritmoVigente` con voz false → "ensenar"; con voz "em_alex" → valor de la puerta; paquete + voz false: borrador `ensenar` sin error de pace y `gancho` con error que nombra «ensenar»; `segundosEscenas(slides,"ensenar",false)` no se alarga por `narracion` larga; con `true` sí; `duracionReel(b, {voz:false})` < `duracionReel(b)` con narración larga.
- [ ] Correr: fallan.
- [ ] Implementar; texto de error del paquete: «… no coincide con el ritmo vigente "X" (sin voz, ensenar; con voz, puerta.ritmoReel)».
- [ ] Correr `npx tsx test/calendario/validar.ts`: pasan.

### Tarea 2: guion por pieza

**Files:** `validar.mjs` (`DESDE_ENTENDER`, `erroresDeGuion`, llamado en `validarBorrador`); test.

**Produces:** `export const DESDE_ENTENDER = "2026-11-09"`; `erroresDeGuion(pieza, borrador): string[]`.

- [ ] Tests: dia ≥ 2026-11-09 sin `guion` → error «falta guion»; largo ≠ slides → error con ambos números; entrada de 1 palabra o > 20 → error; dia 2026-11-02 sin guion → sin error.
- [ ] Implementar y correr.

### Tarea 3: banco momento × capacidad

**Files:** Create `kb-plantilla/_calendario/momentos.md`; `validar.mjs` (`leerBanco`, `erroresDeMomento`, uso en `validarSemana`); `scripts/kb-calendario-install.sh`; test.

**Produces:** `leerBanco(md: string): { momentos: Set<string>, capacidades: Map<string, string[]> }` (lista vacía = sin respaldo); `erroresDeMomento(pieza, banco | undefined, previos: Array<{semana, piezas}>): string[]`.

- [ ] Tests: parseo de `momentos.md` real (12 momentos, 8 capacidades, 3 sin respaldo); pieza `por-donde-partir` ≥ 11-09 sin momento → error; momento inexistente → error; capacidad sin respaldo → error; respaldo ausente de `origen.referencias` → error; misma combinación en una semana previa a ≤ 28 días → error, a 35 días → ok; dos piezas iguales en la semana → error (en `validarSemana`); `lo-que-construi` sin momento → ok; banco undefined → error «falta _calendario/momentos.md: corre scripts/kb-calendario-install.sh»; semana previa con plan roto → ignorada.
- [ ] Implementar; `validarSemana` lee `join(dir,"..","momentos.md")` y los `plan.json` de las carpetas hermanas con fecha < semana (solo si `raiz` no es null).
- [ ] Instalador: copiar `momentos.md` solo si no existe y sumarlo a `ADD` en ese caso.
- [ ] Correr tests.

### Tarea 4: lector frío P9 y causa `sin-hilo`

**Files:** `kb-plantilla/_calendario/lector-frio.md`; `src/calendario/lector-causas.ts`; tests `test/calendario/validar.ts`, `test/calendario/lector-causas.ts`.

- [ ] Tests: el mensaje de `--lector` (vía `seccionDelLector`) contiene «9. Cuéntaselo en dos frases» y `"9"` en el JSON; nota `v1: el completo no supo qué haría primero (P9); se reescribió…` → causa `sin-hilo`.
- [ ] Editar `lector-frio.md` (pregunta, JSON, criterio 9 en frase aparte, reescritura desde guion) y `CAUSAS` (`{id:"sin-hilo", pregunta:9, …}` antes de `otro`).
- [ ] Correr tests.

### Tarea 5: textos de reglas

**Files:** `INSTRUCCIONES.md`, `guia-redaccion.md`, `guia-hooks.md`, `reglas.json` (+ test de reglas si exige forma).

- [ ] Aplicar la sección «Cambios por archivo» de la spec: voz (todas las menciones listadas), Paso 1/3/4/5/6/7/8, ejemplo de plan.json con `momento`, `capacidad`, `guion`, «hasta 20», «El hilo», tabla de plantillas, chequeo 7 y 12, entrada de `reglas.json`.
- [ ] `wc -l INSTRUCCIONES.md` ≤ 2174.
- [ ] `--self-test` en 0; `npm run typecheck && npm test` en 0.
- [ ] Commit.
