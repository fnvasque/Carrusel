# Pivote a vitrina de coaching — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dejar el planificador, el validador y el bot listos para que la semana 2026-11-02 salga con
3 piezas de las series `por-donde-partir` y `lo-que-construi`, señal `dm` y cierre «PARTIR», y para
que se cuenten los DMs «PARTIR».

**Architecture:** el validador (`kb-plantilla/_calendario/validar.mjs`, JS puro) aprende tres cosas
desde el config: un mix de 3, series configurables y el cierre PARTIR. Los tipos de `src/` solo
suman la señal `dm`. El bot detecta «PARTIR» en DMs de desconocidos con una función pura, registra
un hash en `_metricas/dms.jsonl` y avisa por Telegram. El manual y las guías se reescriben para la
voz nueva.

**Tech Stack:** Node + tsx, `node:assert` con el `check()` propio de cada archivo de test, zod en
`src/calendario/plan.ts`, grammy en el bot.

**Spec:** `docs/superpowers/specs/2026-10-28-pivote-coaching-design.md`

## Global Constraints

- Rama `claude/pivote-coaching`; nunca push a `main`. Commits en español, con la línea
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm run typecheck && npm test` deben salir 0 al cerrar cada tarea.
- No se editan tests para que pasen. Un test existente se cambia solo si fija una regla que esta
  spec cambia (mix de 6, series viejas), y se anota en la PR.
- No se toca `knowledge/` desde la PR, ni `src/calendario/draft.ts`, `src/templates/types.ts` o
  `src/theme.ts` (los pilares no cambian).
- Valores exactos:
  - `series` = `["por-donde-partir", "lo-que-construi"]`;
  - `cta` = `{ "palabra": "PARTIR", "desde": "2026-11-02" }`;
  - `paquete` = `{ "desde": "2026-11-02", "semanas": ["2026-11-02", "2026-11-09"], "motivo": "paquete pivote-coaching" }`;
  - texto base del cierre: «Escríbeme PARTIR y te cuento por dónde empezar en tu caso».
- Sin `config.series` ni `config.cta`, el validador se comporta exactamente como hoy.
- El bot nunca guarda el texto ni el IGSID de un DM de un desconocido, y nunca le responde.

## Review Focus

1. **«PARTIR» dentro de otra palabra.** «compartir» o «repartir» en un `Cta` o en un DM no cuentan
   como cierre ni como pedido. Tests en las tareas 2 y 4.
2. **«partir» en minúscula en el caption:** no cumple el cierre (la palabra va en mayúsculas para
   que el lector la copie). Test en la tarea 2.
3. **Un config de la base sin `series` ni `cta`** (si se instala la plantilla y el usuario aún no
   edita el config): el validador valida como hoy y no se cae. Test en las tareas 1 y 2.
4. **Una falla al escribir o subir `dms.jsonl`** (git push rechazado o la base ocupada): `onDm` no
   lanza, registra en el log y el aviso de Telegram sale igual. Test en la tarea 4.
5. **La misma persona escribe PARTIR dos veces el mismo día:** se cuenta una vez; al día siguiente,
   otra vez. Test en la tarea 4.

---

### Task 1: Validador — mix de 3 y series desde el config

**Files:**
- Modify: `kb-plantilla/_calendario/validar.mjs`:
  - `validarConfig`, ~l. 1754: mínimo del mix, `mix[i].serie`, `config.series`;
  - `validarPieza`, ~l. 978: series;
  - `validarPlan`, ~l. 1599-1640: el calce del mix con la serie.
- Test: `test/calendario/validar.ts`

**Interfaces:**
- Produces: `export function seriesDe(config): string[]`. Devuelve `config.series` si es una lista
  de slugs no vacía y, si no, `SERIES_CALIDAD`.
- Produces: el calce del mix prefiere, en este orden, hora+formato+arquetipo+serie, luego
  formato+arquetipo+serie y luego las reglas actuales.

- [ ] **Step 1: Escribir los tests que fallan** en `test/calendario/validar.ts`, con el `check()`
  del archivo:
  - `validarConfig` con un mix de 3 entradas (lun reel tutorial 09:00 `por-donde-partir`, mié reel
    atemporal 09:00 `lo-que-construi`, vie carrusel lista 13:00 `por-donde-partir`) y
    `series: ["por-donde-partir","lo-que-construi"]` → `[]`.
  - `validarConfig` con un mix de 2 entradas → un error que contiene `"mix debe tener de 3 a"`.
  - `validarConfig` con `mix[0].serie = "otra"` y `series` presente → un error que contiene
    `"mix[0].serie"`.
  - `seriesDe({})` → `SERIES_CALIDAD`; `seriesDe({ series: ["por-donde-partir"] })` →
    `["por-donde-partir"]`.
  - `validarPieza` de una pieza del 2026-11-04 con `serie: "hazlo-con-ia"`, con el config de 3 →
    un error que contiene `"por-donde-partir, lo-que-construi"`.
  - Desde `paquete.desde`, `validarPieza` de una pieza sin `serie` → un error
    `"falta serie"`. Esto aplica también a carruseles, pero solo si `config.series` existe.
  - `validarPlan`: con la pieza del miércoles con `serie: "por-donde-partir"`, el error contiene
    `"serie"` y `"lo-que-construi"`.
- [ ] **Step 2: Correr y ver que fallan**
  - Run: `npx tsx test/calendario/validar.ts`
  - Expected: FAIL en los checks nuevos.
- [ ] **Step 3: Implementar** `seriesDe` y usarlo en lugar de `SERIES_CALIDAD`.
  - El mínimo del mix pasa a 3 y el texto del error a `mix debe tener de 3 a …`.
  - `mix[i].serie` es opcional y, si viene, debe estar en `seriesDe(config)`.
  - «falta serie» solo se exige con `config.series` presente y `dia >= paquete.desde`.
- [ ] **Step 4: Correr `npm run typecheck && npm test`**
  - Expected: 0. Si falla un test viejo que fija el mínimo de 6, cambia solo su expectativa de
    texto y anótalo para la PR.
- [ ] **Step 5: Commit**
  `git commit -am "calendario: mix desde 3 piezas y series configurables en el validador"`

### Task 2: Señal `dm` y cierre PARTIR

**Files:**
- Modify: `kb-plantilla/_calendario/validar.mjs`:
  - `SENALES` (l. 55), `GESTO_PASTILLA` y `SUGERIDA_PASTILLA` (l. 1003-1009);
  - `siglasProhibidas` (l. 439), `validarCaption` (l. 567) y `validarBorrador` (l. 1182).
- Modify: `src/calendario/plan.ts:14` y `:109` (tipo `Senal` y enum zod con `"dm"`).
- Modify: `src/insights/summary.ts:45` y `src/calendario/bucle.ts:61`. Ahí `"dm"` se compara como
  `"retencion"` con `export const senalMedible = (s: Senal): Senal => (s === "dm" ? "retencion" : s)`,
  en `plan.ts`.
- Test: `test/calendario/validar.ts`, `test/insights.ts` y `test/calendario/bucle.ts`.

**Interfaces:**
- Consumes: `seriesDe` (Task 1).
- Produces: `export function ctaDe(config): { palabra: string, desde: string } | null` y
  `export function contienePalabraCta(texto: string, palabra: string): boolean`. La comparación es
  por palabra completa y en mayúsculas exactas, sobre el texto sin tildes.
- Produces: el tipo `Senal` incluye `"dm"`, y `senalMedible` está exportada desde
  `src/calendario/plan.ts`.

- [ ] **Step 1: Escribir los tests que fallan**
  - `contienePalabraCta("Escríbeme PARTIR y te cuento", "PARTIR")` → `true`.
  - `contienePalabraCta("para compartir", "PARTIR")` → `false`.
  - `contienePalabraCta("escríbeme partir", "PARTIR")` → `false`.
  - Un borrador del 2026-11-02 con `senal: "dm"`:
    - con la pastilla `"Guárdalo"` → error `"no pide el gesto de la señal dm"`;
    - con `"Escríbeme PARTIR"` → sin ese error.
  - `reglasDeTexto` sobre un `Cta` con título «Escríbeme PARTIR» → sin error de sigla `PARTIR`; el
    mismo texto en un slide que no es `Cta` → con el error.
  - Una pieza del 2026-11-02 cuyo caption no tiene «PARTIR» → error `"el caption debe pedir PARTIR"`.
    La misma pieza el 2026-10-30 → sin ese error.
  - Un borrador del 2026-11-02 sin «PARTIR» en el título ni en la pastilla del `Cta` → error
    `"el Cta debe pedir PARTIR"`.
  - Con un config sin `cta` → ninguno de los dos errores.
  - En `test/calendario/bucle.ts`, una medición con `senal: "dm"` entra en `comparables` igual que
    `"retencion"`.
- [ ] **Step 2: Correr y ver que fallan**
  - Run: `npx tsx test/calendario/validar.ts && npx tsx test/calendario/bucle.ts`
  - Expected: FAIL en los checks nuevos.
- [ ] **Step 3: Implementar**
  - `SENALES` suma `"dm"`.
  - `GESTO_PASTILLA.dm = ["escrib"]` y `SUGERIDA_PASTILLA.dm = "Escríbeme PARTIR"`.
  - `siglasProhibidas` recibe además la palabra del `cta` vigente y la deja pasar en el `Cta`.
  - Los chequeos de caption y `Cta` corren solo si `ctaDe(config)` existe y `dia >= cta.desde`.
  - En `summary.ts` y `bucle.ts`, `SENALES` suma `"dm"` y la comparación usa `senalMedible`.
- [ ] **Step 4: Correr `npm run typecheck && npm test`**
  - Expected: 0.
- [ ] **Step 5: Commit**
  `git commit -am "calendario: señal dm y cierre PARTIR exigido desde cta.desde"`

### Task 3: Config, ejemplo, manual, guías, lector frío y reglas

**Files:**
- Modify: `kb-plantilla/_calendario/config.json`:
  - el mix de la spec con `serie`, `series`, `cta` y `paquete` (Global Constraints);
  - `hookVideoMaxSemana: 0`;
  - `pilaresNota` y `mixNota`, que mencionan el pivote del 2026-10-28.
- Modify: `kb-plantilla/_calendario/validar.mjs:1963`. `EJEMPLO` pasa a una semana 2026-11-02 de
  3 piezas con `senal: "dm"`, series nuevas, cierre PARTIR, `experimento` `{ variable: null,
  motivo: "paquete pivote-coaching" }` y pilar `trabajo`.
- Modify: `kb-plantilla/_calendario/INSTRUCCIONES.md`:
  - sección nueva «Propósito de la cuenta (desde 2026-11-02)» después del título;
  - Paso 3 (l. 470), con la pregunta guía y los ángulos por serie de la spec;
  - Paso 4 (l. 514), con la tabla de 3 y el «paquete pivote-coaching», que vence el 2026-11-15;
  - Paso 5, con la voz en primera persona y la regla dura 11 (cierre PARTIR, texto base);
  - Paso 2, con las metas del paquete;
  - el «Esqueleto» y el «Ejemplo completo», igual que `EJEMPLO`.
- Modify: `kb-plantilla/_calendario/guia-hooks.md` y `guia-redaccion.md`: una sección «Desde
  2026-11-02», con 3 hooks de ejemplo en primera persona y lo que ya no va.
- Modify: `kb-plantilla/_calendario/lector-frio.md`: el perfil del lector en «Para el lector», con
  el texto de la spec.
- Modify: `kb-plantilla/_calendario/reglas.json`: la entrada `pivote-coaching` de la spec, tal cual.
- Test: el test que ya existe compara `EJEMPLO` con el «Ejemplo completo» y corre `--self-test`.

**Interfaces:**
- Consumes: `seriesDe`, `ctaDe`, la señal `dm` (Tasks 1-2).

- [ ] **Step 1: Editar `config.json` y `EJEMPLO`**, y correr
  `node kb-plantilla/_calendario/validar.mjs --self-test` con el config de la plantilla.
  - Expected: sale 0.
- [ ] **Step 2: Comprobar que una pieza mala se rechaza.** Copiar `EJEMPLO` en el scratchpad,
  quitarle «PARTIR» al caption de una pieza y validarlo.
  - Expected: el error `"el caption debe pedir PARTIR"`.
- [ ] **Step 3: Reescribir las secciones del manual, las guías y el lector frío.** El texto que
  queda vigente no menciona `hazlo-con-ia`, `criterio`, `lo-probe-por-ti` ni el mix de 6, salvo en
  notas históricas fechadas.
  - Run: `grep -n "hazlo-con-ia\|mix de 6\|calidad-contenido" kb-plantilla/_calendario/INSTRUCCIONES.md`
  - Expected: solo líneas con una fecha anterior al 2026-11-02.
- [ ] **Step 4: Correr `npm run typecheck && npm test`**
  - Expected: 0.
- [ ] **Step 5: Commit**
  `git commit -am "calendario: manual, guías y ejemplo del pivote a coaching (series, PARTIR, mix de 3)"`

### Task 4: Bot — contar los DMs «PARTIR»

**Files:**
- Modify: `src/kb/inbox.ts`, con dos funciones puras nuevas.
- Create: `src/kb/dms.ts` (registro en `_metricas/dms.jsonl`).
- Modify: `src/kb/bot.ts:578`, en `onDm`, en la rama del remitente no autorizado.
- Test: `test/kb.ts`

**Interfaces:**
- Produces, en `inbox.ts`:
  - `export function esPedidoPartir(ev: DmEvent, palabra = "PARTIR"): boolean`. Trabaja sobre el
    texto normalizado (sin tildes, en minúsculas, sin puntuación) y busca la palabra completa.
  - `export function hashRemitente(igsid: string, secret: string): string`. Es un HMAC-SHA256 en
    hex, truncado a 16 caracteres.
- Produces, en `dms.ts`:
  - `export function lineaDm(fechaIso: string, remitente: string): string` → JSON
    `{"fecha","palabra":"PARTIR","remitente"}` y salto de línea.
  - `export function yaContado(contenido: string, remitente: string, dia: string): boolean`, donde
    `dia` es AAAA-MM-DD en hora de Chile.
  - `export async function registrarPartir(remitente: string, ahora = new Date()): Promise<"nuevo" | "repetido">`.
    Lee y agrega a `join(kbDir(), "_metricas/dms.jsonl")` y hace commit con `commitPaths`, con el
    mensaje `metricas: DM PARTIR`.

- [ ] **Step 1: Escribir los tests que fallan** en `test/kb.ts`:
  - `esPedidoPartir` → `true` para «partir», «PARTIR!», «Partir 🙏» y «quiero partir con la IA»;
    `false` para «repartir», «compartir», un texto vacío y un DM sin texto.
  - `hashRemitente("123", "s")` tiene 16 caracteres, es estable y no contiene `"123"`.
  - `lineaDm(...)` no contiene el IGSID ni ningún texto del DM.
  - `yaContado` → `true` el mismo día de Chile y `false` al día siguiente. Prueba
    `2026-11-03T02:30Z`, que en Chile todavía es el 2 de noviembre.
- [ ] **Step 2: Correr y ver que fallan**
  - Run: `npx tsx test/kb.ts`
  - Expected: FAIL «esPedidoPartir is not a function».
- [ ] **Step 3: Implementar** las funciones y conectarlas en `onDm`.
  - Si el remitente no está en `igAllowed` y `esPedidoPartir(ev)` es verdadero:
    `registrarPartir(hashRemitente(ev.senderId, appSecret))`.
  - Si sale `"nuevo"`: `notifyAdmin("📩 Alguien escribió PARTIR por DM en Instagram: respóndele en la app.")`.
  - Todo va en `try/catch`. Si falla el registro, va un `console.error` y el aviso de Telegram sale
    igual.
  - Nunca se responde por DM.
  - `appSecret` es el `META_APP_SECRET` que ya se lee en l. 677.
- [ ] **Step 4: Test de la falla de escritura.** Exporta
  `export async function manejarPartir(ev: DmEvent, deps: { registrar, avisar, secret })` desde
  `dms.ts`, para que `onDm` solo la llame.
  - El test le pasa un `registrar` que lanza un error y verifica que `avisar` se llamó y que la
    función no lanzó.
  - Run: `npm run typecheck && npm test`
  - Expected: 0.
- [ ] **Step 5: Commit**
  `git commit -am "kb: contar DMs PARTIR de desconocidos sin guardar texto ni id y avisar por Telegram"`

### Task 5: PR, revisión y despliegue (operación)

- [ ] **Step 1:** `git push -u origin claude/pivote-coaching` y abrir la PR contra `main`. El cuerpo
  lista los tests viejos que cambiaron y por qué, y cierra con la línea de Claude Code.
- [ ] **Step 2:** Felipe corre `/codex:adversarial-review` y se atienden los hallazgos. Hace falta
  porque el cambio toca la publicación.
- [ ] **Step 3 (después del merge):**
  - PRIMERO, en `knowledge/_calendario/config.json`, aplicar a mano los campos de la Task 3: mix,
    `series`, `cta`, `paquete` y `hookVideoMaxSemana: 0`. Se conserva lo propio de la base. Hacerlo
    en la misma sesión que la instalación: el instalador corre `--self-test` y falla con el config
    viejo, y Obsidian commitea la bóveda cada pocos minutos (una instalación a medias podría subirse).
  - DESPUÉS, correr `scripts/kb-calendario-install.sh`.
  - Commit y push en la base.
  - Run: `node knowledge/_calendario/validar.mjs --self-test`
  - Expected: 0.
- [ ] **Step 4:** desplegar el bot en GCP con el procedimiento de `deploy/`. Después, una persona
  que no sigue a la cuenta le escribe «PARTIR».
  - Expected: un aviso en Telegram y una línea en `_metricas/dms.jsonl`.
  - Si no llega al webhook, se anota que la meta 3 se cuenta a mano.
- [ ] **Step 5:** desactivar la tarea `calendario-insertar-piezas-2026-11-02` (scheduled-tasks
  `update_scheduled_task`, deshabilitada).
- [ ] **Step 6:** en las 4 memorias reemplazadas, agregar la línea «Reemplazado por
  [[pivote-coaching-2026-10-28]] desde 2026-11-02» y actualizar sus entradas en `MEMORY.md`.
- [ ] **Step 7:** todo esto antes del **sábado 2026-10-31**. Si no se alcanza, plan B: planificar a
  mano `knowledge/_calendario/2026-11-02/plan.json` con el config nuevo.
