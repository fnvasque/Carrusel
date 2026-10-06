# Calendario automático, métricas y bucle de feedback — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Este plan está pensado para **varios subagentes en paralelo** (por olas) y con **revisores adversariales** en las tareas de riesgo. Lee primero "Orquestación". Steps con checkbox (`- [ ]`).

**Goal:** Medir los posts de @ia.punto.es desde la API de Meta, publicar solo un calendario semanal de 2 carruseles + 4 reels (+1 story por pieza) y cerrar el bucle métricas → planificación.

**Architecture:** Tres máquinas con una sola responsabilidad cada una: el **agente de la nube** planifica y escribe borradores en `ia-es-kb/_calendario/<semana>/`; el **Mac** renderiza (Chromium + ffmpeg), pasa el QA del archivo, sube por `rsync` al servidor y anota el render; el **bot del servidor** (Google, 24/7) sirve los archivos, publica a la hora, mide y avisa por Telegram. Todo estado durable vive en git (`ia-es-kb`) y en SQLite del servidor, con **un solo escritor por archivo**.

**Tech Stack:** TypeScript (Node ≥ 22.5, `node:sqlite`, `node:http`, `tsx`), React SSR + Playwright/Chromium, ffmpeg/ffprobe, grammY, Graph API de Meta v26, `zod` (ya es dependencia), `launchd` (Mac), Docker Compose (servidor).

**Spec:** `docs/superpowers/specs/2026-10-06-calendario-metricas-feedback-design.md` — es la autoridad. Cada implementador y cada revisor la lee completa antes de empezar.

## Desviaciones de la spec (aprobar al revisar el plan)

1. **Un escritor por archivo en `_calendario/<semana>/`.** La spec dice que el Mac y el bot escriben el campo `estado` de `plan.json`. Con tres escritores (agente, Mac, bot) sobre el mismo archivo y `pull --rebase` en dos máquinas, un conflicto deja la base atascada (hoy `pushWithRebase` aborta y el commit queda local para siempre). El plan lo parte en tres archivos:
   - `plan.json` — solo el agente (nunca se modifica después de creado).
   - `render.json` — solo el Mac: `{ [id]: { estado: "renderizado" | "fallido", medios?, motivo?, en } }`.
   - `estado.json` — solo el bot: `{ [id]: { estado, motivo?, containerId?, mediaId?, permalink?, publicadoEn?, story? } }`.
   - El estado efectivo es una función pura `estadoEfectivo(plan, render, estado)` (Task 1). `/calendario`, el scheduler y el agente la usan.
2. **`registro.jsonl` solo lo escribe el bot.** El "latido" del agente cuando no hay nada publicable pasa a ser un `plan.json` con `piezas: []` y `motivo`. La alerta de silencio mira si existe la carpeta de la semana (la spec ya lo dice así en "Manejo de errores").
3. **`_metricas/bucle.json`** (lo escribe el bot, Task 12): pesos con encogimiento, ganadores del 20 %, derivados pendientes y diagnóstico mensual, ya calculados. El agente lo **lee** en vez de recalcular estadística en la nube (cálculo determinista y testeado; el agente sigue decidiendo).
4. **Publicación por `graphPostForm`** (form-urlencoded), no JSON: es el formato documentado para `/media` y `/media_publish`. Se agrega en Task 10.

Si alguna no se aprueba, el cambio está confinado a Task 1 (`estadoEfectivo`), Task 8 (escritura del Mac), Task 10 (escritura del bot) y `INSTRUCCIONES.md`.

## Global Constraints

- Zona del calendario: `America/Santiago`. Toda hora de `plan.json` es local de esa zona. Conversión solo con `src/calendario/time.ts` (Task 1); prohibido `new Date("AAAA-MM-DDTHH:MM")` sin zona.
- Mix fijo: Lun reel tutorial · Mar carrusel lista/guía · Mié reel compartible · Jue reel demo · Vie carrusel opinión/mito · Sáb reel formato atemporal · Dom descanso.
- Carrusel ≤ 10 slides (límite de la API). JPEG 1080×1350 `-q:v 2`. Reel MP4 h264 1080×1920 30 fps **con audio**. Story JPEG 1080×1920.
- Plantillas permitidas en borradores: `Hook, Lead, Step, Prompt, MythReality, Stat, Cta` (más `StoryCover`, que solo usa el motor, nunca el agente).
- Fondos `ai`: tope 3 por semana, solo en `Hook` o `Cta`, siempre con `brandStyle` (nunca `brandStyle: false`).
- Score léxico ≥ 75 (`THRESHOLD` de `src/score/virality.ts`). No se cambian los pesos de `virality.ts`.
- Instantáneas: 24 h, 72 h, 7 d, 14 d, 21 d, 28 d, tolerancia ± 1 h. Comparación entre piezas: siempre la de 7 d.
- Umbral de tasas: `reach < 50` → conteos absolutos; `≥ 50` → tasas. Vive en `config.json` (`umbralAlcanceTasas: 50`).
- Peso de tema/arquetipo: solo con ≥ 3 piezas medidas; encogimiento hacia la media global. Ganador = 20 % superior de su señal (7 d).
- Separación mínima entre piezas: 20 h. Horas permitidas 08:00–23:00 Chile, redondeo a :00/:30. Hora por defecto 14:00 lun–sáb.
- Story: 60 min después del publish de su pieza, solo si la pieza quedó `publicado`.
- Reel: sondeo de `status_code` cada 15 s, tope 10 min. URL caída: 3 reintentos en 30 min y luego `fallido`. Errores de Meta (contenido, permiso, cuota): `fallido` sin reintento, mensaje con `translateGraphError`.
- Una pieza sin render a su hora → `saltado` con motivo; **nunca se publica tarde**.
- Medios: `GET /media/<MEDIA_PUBLIC_TOKEN>/<semana>/<id>/<archivo>` desde `/data/media`; se borran 7 días después del publish.
- `CALENDARIO_MODO`: `auto` (publica) o `aviso` (todo menos los POST a Meta). Sin la variable, el scheduler no arranca.
- Zonas de escritura: agente → `_calendario/<semana>/plan.json` y borradores, `experimentos.md`, `aprendizajes.md`; Mac → `_calendario/<semana>/render.json`; bot → `_metricas/**`, `_calendario/registro.jsonl`, `_calendario/<semana>/estado.json`; usuario → `config.json`.
- Nunca se imprime ni se registra un token (Meta, Telegram, `MEDIA_PUBLIC_TOKEN`). En logs, las URLs de medios se muestran con el token como `***`.
- Comentarios, mensajes y textos de Telegram en español, con el estilo del código vecino. Sin dependencias npm nuevas.
- Al cerrar cada tarea: `npm run typecheck` y `npm test` en verde. Las tareas que tocan render además `npm run test:reel` (en el Mac).
- Entorno del Mac para render: `export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/Users/felipevasquez/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell`; nunca `playwright install`. Para fondos `ai`: `set -a; source /Users/felipevasquez/Documents/Claude/Carrusel/.env; set +a` (sin imprimir la clave).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Reinicio o red caída en medio de un publish** (después de `media_publish` pero antes de guardar `media_id`): no debe aparecer un segundo post. Test en Task 10 (`publish: fallo de red tras media_publish no duplica`).
2. **Cambio de hora de Chile** (primer domingo de septiembre: 00:00 no existe; primer domingo de abril: 23:00–24:00 del sábado ocurre dos veces): ninguna pieza se publica dos veces ni se pierde. Tests en Task 1 y Task 10.
3. **Ruta de medios hostil** (`..`, `%2e%2e`, token equivocado, archivo fuera de `/data/media`, symlink): 404 sin filtrar si existe. Test en Task 9.
4. **Cuenta chica / datos raros de Meta** (métrica que desaparece, `reach = 0`, `online_followers` ausente con 4 seguidores, página siguiente vacía): nunca falla la instantánea completa ni divide por cero. Tests en Tasks 2, 3 y 12.
5. **Borrador que engaña al validador** (`hashtags` en otra línea, 11 slides con uno vacío, fondo `ai` en un `Step`, `lectorFrio.resultado: "OK"`, `highlight` que no está en el título): `validar.mjs` lo rechaza. Tests en Task 5.

---

## Orquestación

### Roles de subagente

| Rol | Modelo sugerido | Qué recibe | Qué entrega | Qué NO puede hacer |
|---|---|---|---|---|
| **Implementador** | sonnet | la spec, la sección "Global Constraints" y SOLO su tarea | código + tests en verde + commit en su worktree | tocar archivos fuera de su lista `Files` |
| **Revisor de spec** | sonnet | spec, tarea, diff | lista de requisitos de la tarea no cumplidos (o "ok") | editar código |
| **Adversario** | opus | spec, tarea, diff, su "Mandato adversarial" | **tests que fallan** en `test/adversarial/<tarea>.ts` + un párrafo por hallazgo (entrada → salida esperada → salida real) | editar `src/` ni los tests del implementador; reportar algo sin test que lo reproduzca |
| **Integrador** (tú, sesión principal) | — | resultados | merge de worktrees en orden, resolución de conflictos triviales (runners de tests, `package.json`) | reescribir el trabajo de un implementador |

### Protocolo adversarial (tareas marcadas ⚔️)

1. El implementador termina y commitea.
2. El adversario (contexto limpio, `isolation: "worktree"` sobre el commit del implementador) lee la spec y el diff, ataca según su mandato y escribe tests en `test/adversarial/<tarea>.ts` con el arnés `check` de `test/_check.ts`. Corre `npx tsx test/adversarial/<tarea>.ts` y entrega **solo los tests que fallan** con su explicación. Si todo pasa, entrega "sin hallazgos" con la lista de ataques intentados (mínimo 8).
3. El implementador recibe los tests fallidos y arregla `src/` hasta que pasan, sin tocar los tests del adversario salvo que demuestre (por escrito, citando la spec) que el test exige algo que la spec no pide. El integrador decide esa disputa.
4. Máximo 3 rondas. Los tests adversariales que quedan en verde se conservan: `test/adversarial/*.ts` entra a `npm test` (Task 1 crea el runner).
5. Un hallazgo sin test reproducible no cuenta.

### Olas (dependencias)

```
Ola A (paralelo):  T1 base · T2 cliente insights · T5 plantilla kb · T6 motor · T9 servidor de medios
Ola B (paralelo):  T3 instantáneas (T1,T2) · T7 QA del archivo (T6) · T10 publicación (T1)
Ola C:             T4 métricas en el bot (T3)  →  T8 render del Mac (T1,T6,T7)  →  T11 calendario en el bot (T4,T9,T10)
Ola D:             T12 bucle (T3,T11)  ·  T13 docs y despliegue (todo)
Final:             revisión adversarial de rama completa + ensayo en modo aviso (Task 14)
```

- Cada tarea de una ola corre en su propio worktree (`isolation: "worktree"`). El integrador fusiona en el orden de la lista.
- `src/kb/bot.ts` lo tocan T4, T11 y T12: **nunca en paralelo**, por eso están en serie.
- Conflictos esperados y triviales: `test/insights.ts` / `test/calendario.ts` (una línea `import` por tarea), `package.json` (`scripts`). El integrador los resuelve conservando ambas líneas.
- Fases de la spec: Fase 1 (métricas) = T1–T4, fusionable sola. Fase 2 = T5–T11. Fase 3 = T12. Fase 0 = Task 0 (usuario) + T13.

---

### Task 0: Prerrequisitos manuales (los hace el usuario, no un subagente)

- [ ] Token de System User con `instagram_content_publish` además de los permisos actuales; `META_ACCESS_TOKEN` actualizado en el `.env` del servidor y del Mac.
- [ ] Perfil listo (nombre con keyword, bio de una frase con CTA, foto, destacadas).
- [ ] 2-3 pistas libres de derechos en `promo/audio/` (`.mp3` o `.m4a`); el nombre de archivo es lo que el agente usará en `audio`.
- [ ] `SERVER_HOST=usuario@ip` de la máquina de **Google** en el `.env` del Mac; `ssh $SERVER_HOST true` funciona sin contraseña.
- [ ] Generar `MEDIA_PUBLIC_TOKEN` (`openssl rand -hex 32`) y anotar `MEDIA_PUBLIC_BASE=https://<dominio-ngrok>` (sin barra final). Mismos valores en ambos `.env`.

---

### Task 1: Base compartida — tiempo, tipos del calendario, tablas, arnés de tests

**Files:**
- Create: `src/calendario/time.ts`, `src/calendario/plan.ts`, `test/_check.ts`, `test/calendario.ts`, `test/insights.ts`, `test/adversarial/index.ts`, `test/calendario/time.ts`, `test/calendario/plan.ts`
- Modify: `src/kb/db.ts` (tablas nuevas), `package.json` (`test`)

**Interfaces — Produces:**
```ts
// src/calendario/time.ts
export const ZONA = "America/Santiago";
export interface LocalParts { dia: string; hora: string; weekday: number /* 0=dom … 6=sáb */ }
export function localParts(at: Date, zone?: string): LocalParts;
export function zonedToUtc(dia: string, hora: string, zone?: string): Date;
export function weekMonday(at: Date, zone?: string): string;          // "AAAA-MM-DD" del lunes de la semana local
export function addDays(dia: string, n: number): string;             // aritmética de calendario en UTC
// src/calendario/plan.ts
export type Formato = "reel" | "carrusel";
export type Senal = "guardados" | "envios" | "comentarios" | "retencion";
export type Estado = "planificado" | "renderizado" | "programado" | "publicado" | "saltado" | "fallido";
export interface Pieza { id; dia; hora; formato: Formato; arquetipo; senal: Senal; tema; pilar; hook: {categoria; texto; score}; emocion; entregable; fraseAmigo; lectorFrio: {intentos; resultado; notas}; origen: {fichas: string[]; referencias: string[]}; derivadoDe: string | null; caption; borrador; estado: Estado; parametros?: Record<string, unknown> }
export interface Plan { semana: string; zona: string; experimento: {variable; hipotesis; piezas: string[]} | null; piezas: Pieza[]; motivo?: string }
export interface Medios { urls: string[]; cover?: string; story?: string; duracionMs?: number }
export interface RenderEntry { estado: "renderizado" | "fallido"; medios?: Medios; motivo?: string; en: string }
export interface EstadoEntry { estado: Estado; motivo?: string; containerId?: string; mediaId?: string; permalink?: string; publicadoEn?: string; story?: { estado: Estado; mediaId?: string; motivo?: string } }
export const PlanSchema: z.ZodType<Plan>;
export function parsePlan(text: string): Plan;                      // lanza Error con ruta del campo inválido
export function estadoEfectivo(p: Pieza, render?: RenderEntry, estado?: EstadoEntry): Estado;
export function calendarioDir(): string;                            // join(kbDir(), "_calendario")
export function semanaDir(semana: string): string;
export async function leerSemana(semana: string): Promise<{ plan: Plan; render: Record<string, RenderEntry>; estado: Record<string, EstadoEntry> } | undefined>;
export async function listarSemanas(): Promise<string[]>;           // carpetas AAAA-MM-DD ordenadas
// test/_check.ts
export function check(name: string, fn: () => void): void;
export async function checkAsync(name: string, fn: () => Promise<void>): Promise<void>;
export function done(): void;                                       // imprime totales y process.exit(1) si hubo fallas
```
Tablas SQLite (en `db.ts`, `CREATE TABLE IF NOT EXISTS`, **sin** subir `SCHEMA_VERSION`, porque al subirla se borran tablas y estas no son derivables):
```sql
CREATE TABLE IF NOT EXISTS insights (media_id TEXT NOT NULL, ventana TEXT NOT NULL, tomada_en TEXT NOT NULL,
  reach INTEGER, saved INTEGER, shares INTEGER, likes INTEGER, comments INTEGER, views INTEGER,
  avg_watch_ms INTEGER, total_watch_ms INTEGER, PRIMARY KEY (media_id, ventana));
CREATE TABLE IF NOT EXISTS publicaciones (pieza_id TEXT NOT NULL, tipo TEXT NOT NULL /* 'post' | 'story' */,
  paso TEXT NOT NULL, container_id TEXT, children TEXT, media_id TEXT, intentos INTEGER NOT NULL DEFAULT 0,
  actualizado TEXT NOT NULL, error TEXT, PRIMARY KEY (pieza_id, tipo));
CREATE TABLE IF NOT EXISTS calendario_estado (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
```

- [ ] **Step 1: Arnés de tests.** `test/_check.ts` con `check`, `checkAsync`, `done` (copiar la lógica de `test/smoke.ts:30-55`). `test/calendario.ts` y `test/insights.ts` son runners: importan los módulos de `test/calendario/*.ts` / `test/insights/*.ts` (cada uno registra sus `check` al importarse) y llaman `done()`. `test/adversarial/index.ts` importa dinámicamente todo `test/adversarial/*.ts` salvo él mismo y llama `done()`.
  `package.json`: `"test": "tsx test/smoke.ts && tsx test/kb.ts && tsx test/insights.ts && tsx test/calendario.ts && tsx test/adversarial/index.ts"`.

- [ ] **Step 2: Tests de tiempo (fallan).** `test/calendario/time.ts`:
```ts
import assert from "node:assert/strict";
import { check } from "../_check.ts";
import { addDays, localParts, weekMonday, zonedToUtc } from "../../src/calendario/time.ts";

check("zonedToUtc: horario de verano de Chile (UTC-3)", () => {
  assert.equal(zonedToUtc("2026-10-12", "19:30").toISOString(), "2026-10-12T22:30:00.000Z");
});
check("zonedToUtc: horario de invierno de Chile (UTC-4)", () => {
  assert.equal(zonedToUtc("2026-06-15", "14:00").toISOString(), "2026-06-15T18:00:00.000Z");
});
check("zonedToUtc: hora que no existe (salto de septiembre) cae después del salto", () => {
  const t = zonedToUtc("2026-09-06", "00:30");
  assert.equal(t.toISOString(), "2026-09-06T04:30:00.000Z");
  assert.equal(localParts(t).hora, "01:30");
});
check("zonedToUtc: hora repetida (abril) toma la primera ocurrencia", () => {
  assert.equal(zonedToUtc("2026-04-04", "23:30").toISOString(), "2026-04-05T02:30:00.000Z");
});
check("weekMonday: domingo local pertenece a la semana que empezó el lunes anterior", () => {
  assert.equal(weekMonday(new Date("2026-10-12T02:00:00Z")), "2026-10-05"); // dom 11 23:00 en Chile
  assert.equal(weekMonday(new Date("2026-10-12T12:00:00Z")), "2026-10-12");
});
check("addDays cruza meses y años", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});
```
- [ ] **Step 3:** `npx tsx test/calendario.ts` → FAIL (módulo no existe).
- [ ] **Step 4: Implementar `time.ts`** (algoritmo verificado contra los casos de arriba):
```ts
/** Zona del calendario: todas las horas de plan.json son locales de Chile continental. */
export const ZONA = "America/Santiago";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface LocalParts { dia: string; hora: string; weekday: number }

/** Fecha y hora local de un instante en `zone`. Función pura. */
export function localParts(at: Date, zone = ZONA): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { dia: `${get("year")}-${get("month")}-${get("day")}`, hora: `${get("hour")}:${get("minute")}`, weekday: WEEKDAYS.indexOf(get("weekday")) };
}

/** Minutos que `zone` le suma a UTC en ese instante (Chile: -180 o -240). */
function offsetMinutes(at: Date, zone: string): number {
  const l = localParts(at, zone);
  const [y, m, d] = l.dia.split("-").map(Number);
  const [hh, mm] = l.hora.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * Instante UTC de una fecha y hora locales. Si la hora se repite (fin del horario
 * de verano) se toma la primera; si no existe (inicio), la misma hora de reloj
 * después del salto. Función pura.
 */
export function zonedToUtc(dia: string, hora: string, zone = ZONA): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) throw new Error(`Fecha u hora inválida: ${dia} ${hora}`);
  const [y, m, d] = dia.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const before = offsetMinutes(new Date(guess - 12 * 3_600_000), zone);
  const after = offsetMinutes(new Date(guess + 12 * 3_600_000), zone);
  const candidates = [...new Set([before, after])].map((o) => guess - o * 60_000).sort((a, b) => a - b);
  for (const t of candidates) {
    const l = localParts(new Date(t), zone);
    if (l.dia === dia && l.hora === hora) return new Date(t);
  }
  return new Date(guess - before * 60_000);
}

/** Suma días a una fecha AAAA-MM-DD (calendario, sin zona). */
export function addDays(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Lunes (AAAA-MM-DD) de la semana local que contiene `at`. */
export function weekMonday(at: Date, zone = ZONA): string {
  const l = localParts(at, zone);
  return addDays(l.dia, -((l.weekday + 6) % 7));
}
```
- [ ] **Step 5: Tests de `plan.ts` (fallan).** `test/calendario/plan.ts`: `parsePlan` acepta el ejemplo de la spec (copiarlo, con `hook.texto` real) y rechaza: `formato: "story"`, `hora: "7:30"`, `dia` inválido (`2026-02-30`), `senal` fuera de la lista, `piezas` con `id` repetido (mensaje contiene el id). `estadoEfectivo`: sin render ni estado → `planificado`; render `renderizado` → `renderizado`; render `fallido` → `fallido`; estado `publicado` gana a render; estado `saltado` gana; `plan.estado` distinto de `planificado` se ignora salvo que no haya otra fuente (el plan es inmutable).
- [ ] **Step 6: Implementar `plan.ts`** con `zod`. Reglas: `dia` validado con `Date.UTC` ida y vuelta (como `validDate` de `kb-plantilla/_investigacion/validar.mjs:23`); `hora` `^([01]\d|2[0-3]):(00|30)$`; ids únicos con `superRefine`. `estadoEfectivo`:
```ts
export function estadoEfectivo(p: Pieza, render?: RenderEntry, estado?: EstadoEntry): Estado {
  if (estado) return estado.estado;
  if (render) return render.estado;
  return p.estado ?? "planificado";
}
```
  `leerSemana` lee `plan.json` (obligatorio) y `render.json` / `estado.json` (opcionales, `{}` si faltan o están corruptos; corrupto → `console.warn`, nunca lanza).
- [ ] **Step 7: Tablas en `db.ts`.** Agregar el SQL de arriba al final de `SCHEMA`. Agregar un test en `test/calendario/plan.ts` que, con `KB_DIR` apuntando a un `mkdtempSync`, abre la base dos veces seguidas (`openDb(); closeDb(); openDb()`), inserta una fila en `publicaciones` y verifica que sigue ahí tras reabrir.
- [ ] **Step 8:** `npm run typecheck && npm test` → PASS.
- [ ] **Step 9: Commit** `calendario: tiempo en zona de Chile, tipos del plan y tablas`.

**⚔️ Mandato adversarial T1:** zonas y fechas. Prueba horas `23:59`, `00:00` en ambos cambios de hora de 2026 y 2027, `weekMonday` en el instante exacto de medianoche local de un lunes, `parsePlan` con campos extra, con `piezas` vacío y `motivo`, con JSON que trae `__proto__`. Prueba que `estado.json` corrupto no tumba `leerSemana`. Prueba que reabrir la base no borra `insights` ni `publicaciones`.

---

### Task 2: Cliente de insights (solo lectura) ⚔️

**Files:**
- Create: `src/insights/client.ts`, `test/insights/client.ts`
- Modify: `test/insights.ts` (una línea `import`)

**Interfaces:**
- Consumes: `graphGet`, `GraphError` de `src/meta/client.ts`; `metaConfig` de `src/meta/env.ts`.
- Produces:
```ts
export type GraphGetFn = <T>(path: string, params?: Record<string, string | number | undefined>) => Promise<T>;
export interface OwnMedia { id: string; caption?: string; media_type: string; media_product_type: string; permalink?: string; timestamp: string; like_count?: number; comments_count?: number }
export interface MediaInsights { reach?: number; saved?: number; shares?: number; likes?: number; comments?: number; views?: number; total_interactions?: number; avg_watch_ms?: number; total_watch_ms?: number; descartadas: string[] }
export interface AccountInsights { followers?: number; followerCount: { dia: string; valor: number }[]; onlineFollowers?: Record<string, number>; reach7d?: number; engaged7d?: number; reachNoSeguidores7d?: number; errores: string[] }
export const POST_METRICS: string[];   // reach, saved, shares, likes, comments, views, total_interactions
export const REEL_METRICS: string[];   // POST_METRICS + ig_reels_avg_watch_time, ig_reels_video_view_total_time
export function parseInsights(body: unknown): Partial<Record<string, number>>;
export function unsupportedMetric(err: unknown, pedidas: string[]): string | undefined;
export async function fetchOwnMedia(since: Date, get?: GraphGetFn, igUserId?: string): Promise<OwnMedia[]>;
export async function fetchMediaInsights(id: string, productType: string, get?: GraphGetFn): Promise<MediaInsights>;
export async function fetchAccountInsights(now: Date, get?: GraphGetFn, igUserId?: string): Promise<AccountInsights>;
```
El parámetro `get` por defecto es `graphGet` con la config de `.env`; los tests pasan un falso.

- [ ] **Step 1: Tests (fallan).** Con un `get` falso que registra llamadas:
  - `parseInsights` sobre `{ data: [{ name: "reach", values: [{ value: 12 }] }, { name: "saved", total_value: { value: 3 } }] }` → `{ reach: 12, saved: 3 }`; ignora entradas sin número.
  - `fetchMediaInsights("1","REELS")`: el falso lanza `new GraphError("… (#100) The Media Insights API does not support the views metric …", 100)` la primera vez que la lista contiene `views`; la segunda llamada no contiene `views`; resultado `descartadas: ["views"]`, y `avg_watch_ms` mapeado desde `ig_reels_avg_watch_time`.
  - Dos métricas inválidas en secuencia → dos reintentos, ambas en `descartadas`; un error que no nombra ninguna métrica pedida (p. ej. código 190) → se relanza.
  - Error que nombra una métrica en la forma `metric[3] must be one of the following values: …` sin nombrar la inválida: se descarta la métrica en la posición indicada.
  - `fetchOwnMedia` pagina con `paging.next` / `paging.cursors.after`, se detiene al ver un `timestamp` < `since`, y también si una página llega vacía (no hace bucle infinito; tope 20 páginas).
  - `fetchAccountInsights` con `online_followers` lanzando error (cuenta < 100 seguidores) → `onlineFollowers: undefined`, `errores` con un texto que menciona "100 seguidores", y el resto de campos presentes.
  - `reachNoSeguidores7d` se calcula desde la respuesta de `reach` con `breakdown=follow_type` (`total_value.breakdowns[0].results[]` con `dimension_values: ["NON_FOLLOWER"]`).
- [ ] **Step 2:** `npx tsx test/insights.ts` → FAIL.
- [ ] **Step 3: Implementar.** Núcleo de la estrategia de reintento:
```ts
/** Métrica que Meta dice no soportar en este error, si es una de las pedidas. Función pura. */
export function unsupportedMetric(err: unknown, pedidas: string[]): string | undefined {
  const msg = err instanceof Error ? err.message : String(err);
  const named = pedidas.find((m) => new RegExp(`\\b${m}\\b`).test(msg));
  if (named && /not support|no longer supported|invalid|must be one of|deprecated/i.test(msg)) return named;
  const idx = msg.match(/metric\[(\d+)\]/)?.[1];
  return idx !== undefined ? pedidas[Number(idx)] : undefined;
}

export async function fetchMediaInsights(id: string, productType: string, get: GraphGetFn = defaultGet): Promise<MediaInsights> {
  let metrics = productType === "REELS" ? [...REEL_METRICS] : [...POST_METRICS];
  const descartadas: string[] = [];
  // Una vuelta por métrica como máximo: Meta cambia la lista cada pocos meses.
  for (let i = 0; i <= metrics.length; i++) {
    try {
      const raw = parseInsights(await get(`${id}/insights`, { metric: metrics.join(",") }));
      return {
        reach: raw.reach, saved: raw.saved, shares: raw.shares, likes: raw.likes, comments: raw.comments,
        views: raw.views, total_interactions: raw.total_interactions,
        avg_watch_ms: raw.ig_reels_avg_watch_time, total_watch_ms: raw.ig_reels_video_view_total_time, descartadas,
      };
    } catch (err) {
      const bad = unsupportedMetric(err, metrics);
      if (!bad || metrics.length === 1) throw err;
      descartadas.push(bad);
      metrics = metrics.filter((m) => m !== bad);
      console.warn(`⚠️  Meta ya no da la métrica ${bad} para ${productType}: la descarto.`);
    }
  }
  return { descartadas };
}
```
  `fetchOwnMedia`: `GET {ig}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=50`, luego `after` del cursor. `fetchAccountInsights`: cuatro llamadas independientes, cada una en su `try` (un fallo agrega a `errores` y sigue): `followers_count` del usuario; `follower_count` `period=day` `since/until` 30 d (Meta limita a 30 d); `online_followers` `period=lifetime`; `reach` y `accounts_engaged` `metric_type=total_value&period=day` 7 d; `reach` con `breakdown=follow_type`.
- [ ] **Step 4:** `npm run typecheck && npm test` → PASS.
- [ ] **Step 5: Commit** `insights: cliente de solo lectura con métricas que Meta deja de dar`.

**⚔️ Mandato adversarial T2:** respuestas raras de Meta: `data: []`, `values: []`, `value: null`, `value: "12"`, métricas duplicadas, `paging.next` que repite el mismo cursor, `timestamp` en orden no cronológico, error de red (`GraphError` sin código) en la página 2, error de cuota (código 4) que NO debe tratarse como métrica inválida, mensaje en otro idioma que no nombra la métrica. Ninguna llamada debe repetirse más de `métricas + 1` veces.

---

### Task 3: Instantáneas, derivadas y puente a la calibración ⚔️

**Files:**
- Create: `src/insights/snapshots.ts`, `src/insights/derive.ts`, `test/insights/snapshots.ts`, `test/insights/derive.ts`
- Modify: `test/insights.ts`

**Interfaces:**
- Consumes: T1 (`openDb` tablas, `ZONA`, `leerSemana`), T2 (`fetchOwnMedia`, `fetchMediaInsights`, `fetchAccountInsights`, `MediaInsights`).
- Produces:
```ts
// derive.ts (todo puro)
export type Ventana = "24h" | "72h" | "7d" | "14d" | "21d" | "28d";
export const VENTANAS: { ventana: Ventana; horas: number }[];        // 24, 72, 168, 336, 504, 672
export const TOLERANCIA_MS = 3_600_000;
export function ventanaDebida(publicado: Date, ahora: Date, tomadas: Set<Ventana>): Ventana | undefined;
export interface Derivadas { saved_por_alcance?: number; shares_por_alcance?: number; comments_por_alcance?: number; views_por_alcance?: number; retencion?: number }
export function derivar(m: MediaInsights, duracionMs?: number): Derivadas;
export function valorSenal(senal: Senal, m: MediaInsights, d: Derivadas, umbralAlcance: number): number | undefined;
export function modoComparacion(reach: number | undefined, umbral: number): "absoluto" | "tasa";
// snapshots.ts
export interface PostInfo { mediaId: string; publicado: Date; productType: string; piezaId?: string; origen: "motor" | "manual"; duracionMs?: number; nombreMotor?: string; predictedScore?: number }
export interface Instantanea extends MediaInsights { mediaId: string; ventana: Ventana; tomadaEn: string; piezaId?: string; origen: "motor" | "manual"; derivadas: Derivadas }
export async function postsConocidos(now: Date): Promise<PostInfo[]>;   // fetchOwnMedia(now-35d) + cruce con registro.jsonl
export async function tomarInstantaneas(now: Date, deps?: { fetch?: typeof fetchMediaInsights; posts?: PostInfo[] }): Promise<Instantanea[]>;
export async function guardarCuenta(now: Date, deps?: { fetch?: typeof fetchAccountInsights }): Promise<void>;
export function metricaCalibracion(i: Instantanea, nombre: string, predictedScore: number): import("../score/calibration.ts").Metric & { recordedAt: string; likes: number | null };
```
- [ ] **Step 1: Tests de `derive.ts` (fallan):**
```ts
check("ventanaDebida: dentro de ±1 h de las 24 h", () => {
  const pub = new Date("2026-10-12T22:30:00Z");
  assert.equal(ventanaDebida(pub, new Date("2026-10-13T21:45:00Z"), new Set()), "24h");
  assert.equal(ventanaDebida(pub, new Date("2026-10-13T20:00:00Z"), new Set()), undefined);
});
check("ventanaDebida: si el bot estuvo caído, toma la ventana atrasada más reciente que no se tomó, sin pasar de 28d+1h", () => {
  const pub = new Date("2026-10-01T00:00:00Z");
  assert.equal(ventanaDebida(pub, new Date("2026-10-04T05:00:00Z"), new Set(["24h"])), "72h"); // 77 h: tardía, es la última vencida
  assert.equal(ventanaDebida(pub, new Date("2026-10-08T00:30:00Z"), new Set(["24h"])), "7d");   // 72h se salta: ya hay una posterior debida
  assert.equal(ventanaDebida(pub, new Date("2026-11-01T00:00:00Z"), new Set()), undefined);
});
check("ventanaDebida: no repite una ventana ya tomada", () => {
  const pub = new Date("2026-10-12T22:30:00Z");
  assert.equal(ventanaDebida(pub, new Date("2026-10-13T22:30:00Z"), new Set(["24h"])), undefined);
});
check("derivar: reach 0 o ausente no produce tasas (ni NaN ni Infinity)", () => {
  assert.deepEqual(derivar({ reach: 0, saved: 2, descartadas: [] }), {});
  assert.deepEqual(derivar({ saved: 2, descartadas: [] }), {});
});
check("derivar: retención solo con duración conocida", () => {
  const d = derivar({ reach: 10, avg_watch_ms: 6000, descartadas: [] }, 20000);
  assert.equal(d.retencion, 0.3);
  assert.equal(derivar({ reach: 10, avg_watch_ms: 6000, descartadas: [] }).retencion, undefined);
});
check("valorSenal: conteo absoluto bajo el umbral, tasa sobre él", () => {
  const m = { reach: 12, saved: 3, shares: 1, descartadas: [] };
  assert.equal(valorSenal("guardados", m, derivar(m), 50), 3);
  const g = { reach: 200, saved: 10, descartadas: [] };
  assert.equal(valorSenal("guardados", g, derivar(g), 50), 0.05);
  assert.equal(valorSenal("retencion", m, derivar(m), 50), undefined);
});
```
  Regla de la ventana atrasada (escríbela como comentario en el código): se devuelve la ventana **vencida más reciente** (`ahora ≥ publicado + horas − 1 h`) que no se haya tomado; las anteriores a ella se saltan; nada después de 28 d + 1 h. Si se toma con más de 1 h de desvío, `tomadaEn` refleja la hora real y el resumen la marca "(tardía)". La comparación entre piezas usa solo `7d` con desvío ≤ 6 h; las tardías de 7 d más allá de eso quedan fuera del bucle.
- [ ] **Step 2: Tests de `snapshots.ts` (fallan).** Con `KB_DIR` temporal, `registro.jsonl` de ejemplo y `fetch` falso: `tomarInstantaneas` escribe una fila en `insights`, una línea en `_metricas/instantaneas/<día local>.jsonl`, actualiza `_metricas/posts.json` (última por post) y, para `ventana === "7d"` de una pieza `motor`, escribe `metrics/<nombreMotor>.json` en el `metricsDir` pasado por dependencia y llama a `refreshCalibration(metricsDir)`. Un `fetch` que lanza para un post no impide las demás (se registra y sigue). Correr dos veces el mismo `now` no duplica filas (PK) ni líneas (comprobar `ventanaDebida` con las tomadas de SQLite).
- [ ] **Step 3: Implementar.** `postsConocidos`: lee `_calendario/registro.jsonl` (líneas `{"tipo":"publicado","piezaId","mediaId","semana","publicadoEn","duracionMs","nombreMotor","predictedScore"}` que escribe la Task 10), cruza por `mediaId`; los posts de `fetchOwnMedia` sin línea → `origen: "manual"`. Las stories (`media_product_type === "STORY"`) no se miden (expiran a las 24 h). `metricaCalibracion` produce exactamente el formato de `src/score/record.ts:50-61` (`savesPerK`, `sharesPerK` con 1 decimal); con `reach` 0 o ausente **no** se escribe el archivo.
  `guardarCuenta` escribe `_metricas/cuenta.json`: `{ actualizado, seguidores, porDia: {AAAA-MM-DD: n}, onlineFollowers?, reach7d?, engaged7d?, reachNoSeguidores7d?, errores }`, fusionando `porDia` con lo anterior (Meta solo da 30 d; la historia se conserva).
- [ ] **Step 4:** `npm run typecheck && npm test` → PASS.
- [ ] **Step 5: Commit** `insights: instantáneas por ventana, tasas y puente a la calibración`.

**⚔️ Mandato adversarial T3:** el bot estuvo apagado 5 días; publicación justo antes de un cambio de hora; post borrado en Instagram (insights lanzan 100 "does not exist") → no reintenta para siempre (marca y deja de pedir tras 3 fallos seguidos, guardado en `calendario_estado`); `posts.json` corrupto en disco; `metrics/` sin permiso de escritura; dos `tomarInstantaneas` simultáneos (el bot lo llama por `setInterval`; debe ir por `serial`, verifícalo en T4). Divisiones por cero en cualquier derivada.

---

### Task 4: Métricas en el bot — timers, `/metricas`, resumen semanal, CLI

**Files:**
- Create: `src/insights/summary.ts`, `src/insights/cli.ts`, `test/insights/summary.ts`
- Modify: `src/kb/bot.ts`, `src/kb/telegram.ts` (`HELP`), `package.json` (`"insights": "tsx src/insights/cli.ts"`), `test/insights.ts`

**Interfaces:**
- Consumes: T3 completo, `commitPaths` de `src/kb/store.ts`, `localParts`/`weekMonday` de T1.
- Produces:
```ts
export interface ResumenSemana { desde: string; hasta: string; mejor?: FilaPieza; peor?: FilaPieza; seguidoresGanados?: number; horaTop?: string; noSeguidores?: number; avisos: string[] }
export interface FilaPieza { piezaId?: string; mediaId: string; permalink?: string; senal?: Senal; valor?: number; modo: "absoluto" | "tasa" }
export function resumirSemana(inst: Instantanea[], cuenta: unknown, registro: unknown[], hasta: string, umbral: number): ResumenSemana;
export function formatResumen(r: ResumenSemana): string;          // Markdown corto (archivo)
export function formatResumenTelegram(r: ResumenSemana): string;  // HTML de Telegram (usa escapeHtml)
export function formatPost(inst: Instantanea[]): string;          // /metricas <id|url>
export function debeResumir(now: Date, ultimo?: string): boolean;  // domingo ≥ 05:30 local y no hecho esa semana
```
- [ ] **Step 1: Tests de `summary.ts` (fallan):** mejor/peor por señal objetivo usando solo `7d`; pieza manual no compite (aparece en una sección "posts manuales"); sin instantáneas → texto "Sin datos todavía" y no lanza; `horaTop` desde `onlineFollowers` y "tabla por defecto (menos de 100 seguidores)" si falta; `debeResumir` es `true` el domingo 05:30 local, `false` a las 05:29, `false` si `ultimo` es esa misma semana, `true` el lunes si el domingo no se pudo (bot caído).
- [ ] **Step 2: Implementar `summary.ts` y `cli.ts`.** CLI: `npm run insights [-- --desde=AAAA-MM-DD] [--post=<id|url>] [--ahora]` (`--ahora` toma instantáneas y cuenta en el acto, útil para probar). Sin `META_*` → mensaje de `MetaConfigError` y salida 1.
- [ ] **Step 3: Cablear en `bot.ts`** (sección nueva `// --- métricas de la cuenta ---` antes de `// --- arranque ---`):
  - `snapshotTick()` cada hora (primera a los 2 min del arranque) dentro de `serial(...)`; escribe y llama `commitPaths([...rutas], "métricas: instantáneas <fecha>")`.
  - `accountTick()` una vez al día (guardar fecha en `calendario_estado`, clave `cuenta:ultima`).
  - `summaryTick()` cada 10 min revisa `debeResumir`; escribe `_metricas/resumenes/<domingo>.md`, commitea y envía por `sendToAdmins`; marca `resumen:ultimo` solo si el envío llegó.
  - Solo si `META_ACCESS_TOKEN` y `META_IG_USER_ID` están definidos; si no, un `console.warn` y nada más.
  - Comando `/metricas` y `/metricas <id|url>` (acepta permalink de Instagram, `media_id` o `piezaId`); agregar a `setMyCommands` y a `HELP`.
- [ ] **Step 4:** `npm run typecheck && npm test` → PASS. Prueba manual si hay `.env`: `npm run insights -- --ahora` imprime al menos la cuenta.
- [ ] **Step 5: Commit** `insights: /metricas, resumen del domingo e instantáneas cada hora`.

**Revisión:** revisor de spec (no adversarial). Comprobar que todos los ticks pasan por `serial` y que ningún fallo de Meta llega a `unhandledRejection`.

**Checkpoint Fase 1:** con T1–T4 fusionadas se puede desplegar sola (`deploy-to-server.sh --update`) y empezar a medir lo publicado a mano.

---

### Task 5: Plantilla `_calendario/` en la base — config, validador, manual, lector frío ⚔️

**Files:**
- Create: `kb-plantilla/_calendario/config.json`, `kb-plantilla/_calendario/validar.mjs`, `kb-plantilla/_calendario/validar.d.mts`, `kb-plantilla/_calendario/INSTRUCCIONES.md`, `kb-plantilla/_calendario/lector-frio.md`, `scripts/kb-calendario-install.sh`, `test/calendario/validar.ts`
- Modify: `kb-plantilla/CLAUDE.md` (+4 líneas), `test/calendario.ts`

**Interfaces — Produces** (`validar.mjs`, node sin dependencias, exportable para tests):
```js
export const PLANTILLAS: Set<string>;                    // Hook Lead Step Prompt MythReality Stat Cta
export function validarPlan(plan, config): string[];
export function validarBorrador(pieza, borrador, config): string[];
export function reglasDeTexto(borrador, config): string[];   // longitudes, siglas, relleno, términos técnicos, lectura
export function contarFondosIA(borradores): number;
export function validarCaption(caption, config): string[];
export function validarSemana(dir, config, opts?: { score?: (borrador) => number | undefined }): string[];
```
CLI: `node _calendario/validar.mjs <semana>` → ✓ y salida 0, o lista de errores `<id>: <motivo>` y salida 1.

`config.json` (valores exactos de la spec; cada parámetro de la puerta con `respaldo`):
```json
{
  "zona": "America/Santiago",
  "mix": [
    { "dia": 1, "formato": "reel", "arquetipo": "tutorial" },
    { "dia": 2, "formato": "carrusel", "arquetipo": "lista" },
    { "dia": 3, "formato": "reel", "arquetipo": "compartible" },
    { "dia": 4, "formato": "reel", "arquetipo": "demo" },
    { "dia": 5, "formato": "carrusel", "arquetipo": "opinion" },
    { "dia": 6, "formato": "reel", "arquetipo": "atemporal" }
  ],
  "horasPorDefecto": { "1": "14:00", "2": "14:00", "3": "14:00", "4": "14:00", "5": "14:00", "6": "14:00" },
  "ventanaHoras": ["08:00", "23:00"],
  "separacionMinHoras": 20,
  "pilares": ["herramienta", "noticia", "prompt", "curiosidad"],
  "hashtagsBase": ["#ia", "#inteligenciaartificial", "#herramientasia"],
  "fondosIAMaxSemana": 3,
  "scoreMin": 75,
  "umbralAlcanceTasas": 50,
  "puerta": {
    "tituloMaxPalabras": { "valor": 12, "respaldo": "skill" },
    "bulletMaxPalabras": { "valor": 12, "respaldo": "supuesto" },
    "cuerpoMaxPalabras": { "valor": 30, "respaldo": "supuesto" },
    "terminosTecnicosMax": { "valor": 1, "respaldo": "skill" },
    "siglasPermitidas": { "valor": ["GPT", "PDF", "IA", "DM"], "respaldo": "skill" },
    "relleno": { "valor": ["increíble", "brutal", "realmente", "básicamente", "la verdad", "muy"], "respaldo": "skill" },
    "hookUmbral": { "valor": 8, "respaldo": "skill" },
    "lecturaPalabrasPorSegundo": { "valor": 2.5, "respaldo": "supuesto" },
    "lecturaMinSegundos": { "valor": 1.5, "respaldo": "supuesto" },
    "reescriturasMax": { "valor": 3, "respaldo": "supuesto" },
    "logoEnCuadro0": { "valor": true, "respaldo": "base" }
  },
  "terminosTecnicos": ["api", "llm", "token", "modelo", "prompt engineering", "embedding", "mcp", "agente", "fine-tuning", "rag", "open source"],
  "audios": []
}
```

- [ ] **Step 1: Tests del validador (fallan)** en `test/calendario/validar.ts`, importando de `../../kb-plantilla/_calendario/validar.mjs` con un `config` cargado del JSON y un borrador válido de base (Hook con `highlight` contenido en `title`, 2 Step, Cta; `pace: "ensenar"`, `audio` presente en `config.audios`):
  - Válido → `[]`.
  - 11 slides → error que menciona "10".
  - Plantilla `Quote` → error con el nombre.
  - Hook sin `highlight`, o con `highlight` que no aparece en `title` (comparación sin tildes ni mayúsculas) → error.
  - Pieza sin `senal`, `emocion`, `entregable` o `fraseAmigo` → un error por campo.
  - `lectorFrio.resultado` distinto de exactamente `"ok"` (incluido `"OK"`, `"ok "`) → error.
  - Caption: primera línea sin ninguna palabra (≥ 4 letras) del `tema` → error; 2 o 6 hashtags en total → error; hashtags se cuentan en todo el caption; "primer comentario" → error.
  - Fondo `ai` en un `Step` → error; 4 fondos `ai` en la semana → error de semana; `brandStyle: false` → error.
  - `fraseAmigo` con "API", "modelo" o "token" → error.
  - Título del Hook con 13 palabras → error citando `tituloMaxPalabras`; bullet con 13 palabras; `body` con 31; sigla `LLM` (no permitida) → error; `GPT` → ok; "increíble" en cualquier texto → error; 2 términos técnicos en la pieza → error.
  - Reel: una escena cuyo texto exige más tiempo del que dará el motor → error (usar la fórmula de `sceneSeconds` de `src/reel/timing.ts:88` con `pace` del borrador; copiar la fórmula al `.mjs` con un comentario que apunte al original, y un test en `test/calendario/validar.ts` que compare ambos para 20 escenas generadas para que no diverjan).
  - Carrusel con `pace` o `audio` → no es error (se ignoran). Reel sin `audio` → error.
  - `validarPlan`: dos piezas a menos de 20 h → error; hora fuera de 08:00–23:00 → error; `dia` fuera de la semana `semana`…`semana+6` → error; domingo → error; `experimento.piezas` con id inexistente → error; `piezas: []` sin `motivo` → error.
  - `validarSemana` con `opts.score` que devuelve 70 → error "score 70 < 75"; con `score` ausente → no lo evalúa y lo dice en un aviso (no error).
- [ ] **Step 2:** `npx tsx test/calendario.ts` → FAIL.
- [ ] **Step 3: Implementar `validar.mjs`.** Sin dependencias. Normalización de texto común: `s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()`. Palabras = `split(/\s+/).filter(Boolean)`. Siglas = `/\b[A-ZÁÉÍÓÚÑ]{2,}\b/g` (palabras en mayúsculas de ≥ 2 letras; ignora las que estén en `siglasPermitidas`). En el CLI, si existe `../package.json` con `"name": "carrusel"` en un directorio hermano (`process.env.CARRUSEL_DIR` o `../carrusel`), calcula el score con `execFileSync("npx", ["tsx", "-e", …scoreDraft…])`; si no, lo omite con aviso (la spec lo deja al Mac).
- [ ] **Step 4: `lector-frio.md`.** Contenido obligatorio, literal:
  - Perfil: "Hispanohablante de 25 a 45 años, curioso de la IA, **no técnico**, viendo esto en el celular, distraído, con el pulgar listo para pasar."
  - Perfil "con prisa": mismo, pero recibe solo títulos y `highlight`.
  - Las 6 preguntas de la spec, numeradas, con formato de respuesta JSON `{ "1": "...", ..., "6": "..." }`.
  - El criterio de paso (1)–(6) de la spec, que evalúa **el planificador** comparando contra lo declarado.
  - Prohibido: recibir tema, fuentes, plan o emoción buscada; el planificador no edita este archivo.
- [ ] **Step 5: `INSTRUCCIONES.md`.** Los 8 pasos de "Agente planificador" de la spec, en orden y con esta información concreta:
  1. Archivos a leer, incluido `_metricas/bucle.json` (si existe) y `_investigacion/resumenes/` más reciente.
  2. Evaluar la semana pasada con `bucle.json`; cerrar experimentos de 4 semanas en `experimentos.md` (formato: `## AAAA-MM-DD · variable` + hipótesis + resultado + dato); ≤ 3 frases nuevas en `aprendizajes.md`, cada una con su dato.
  3. Prioridad de temas (a)–(d) tal cual; regla "sin métricas solo (b) y (d)"; nunca dos del mismo tema salvo derivados.
  4. Mix de `config.json`; horas: `bucle.json → horas` si existe, si no `horasPorDefecto`; un experimento declarado (variables permitidas: tema, arquetipo, hora, duración, tipo de hook, o un parámetro de `puerta`).
  5. Orden obligatorio de escritura (entregable → señal y destinatario → emoción → frase de amigo → cuerpo → hook) y las 10 reglas duras de la tabla de la spec, copiadas. Catálogo de plantillas con sus props (copiar `TEMPLATE_CATALOG` de `src/remix/templates-catalog.ts`) y un borrador de ejemplo completo. Copy en español neutro. Caption con keyword en la primera línea, 3–5 hashtags (`hashtagsBase` + 0–2 del tema), sin "primer comentario". `source` al pie citando la ficha o referencia.
  6. Lector frío: lanzar **dos subagentes con contexto limpio** por pieza, pasándoles solo `lector-frio.md` y el texto; registrar `lectorFrio`.
  7. `node _calendario/validar.mjs <semana>`; máximo `reescriturasMax` vueltas en total; si no pasa, quitar la pieza y anotar `motivo` en `plan.json`.
  8. Escribir solo `plan.json`, borradores, `experimentos.md`, `aprendizajes.md`. Commit `calendario: semana <lunes> (<n> piezas)`; `git pull --rebase` y push. Sin piezas publicables: `plan.json` con `piezas: []` y `motivo`. **Nunca** tocar `render.json`, `estado.json`, `registro.jsonl`, `_metricas/`, `config.json`, `lector-frio.md`, `validar.mjs`.
- [ ] **Step 6: Instalador y CLAUDE.md.** `scripts/kb-calendario-install.sh` con la misma forma que `scripts/kb-research-install.sh`: copia los 5 archivos; **no** sobrescribe `config.json` si ya existe (el usuario lo edita; imprime un diff si difiere); crea `experimentos.md` y `aprendizajes.md` vacíos si no existen; corre `node validar.mjs --self-test` (valida el borrador de ejemplo embebido); commit y push. `kb-plantilla/CLAUDE.md`: 4 líneas sobre `_calendario/` y `_metricas/` y sus escritores.
- [ ] **Step 7:** `npm run typecheck && npm test` → PASS.
- [ ] **Step 8: Commit** `calendario: plantilla del planificador, config y validador`.

**⚔️ Mandato adversarial T5:** escribe borradores que un agente apurado produciría para pasar el validador: hashtags pegados (`#ia#claude`), hashtags en mayúsculas o con tilde, emojis en el título, `highlight` con tilde distinta, siglas con puntos (`I.A.`), `bullets` como string en vez de arreglo, `slides` con un slide `null`, props numéricas donde se espera texto, `audio` con `../`, `borrador` en `plan.json` que apunta a `../../etc/passwd`, JSON con BOM, `ai` con `brandStyle: "false"` (string), id con mayúsculas o espacios (el id se usa como nombre de carpeta en el servidor: debe ser `^[a-z0-9-]{3,80}$`). Todo debe dar error, nunca excepción no capturada.

---

### Task 6: Motor — borrador JSON a piezas, StoryCover, logo tardío

**Files:**
- Create: `src/calendario/draft.ts`, `src/templates/StoryCover.tsx`, `test/calendario/draft.ts`
- Modify: `src/templates/index.ts`, `src/templates/Frame.tsx` (opción `logoEnCuadro0`), `src/reel/renderReel.ts` (devolver duración), `test/smoke.ts` (render de StoryCover), `test/calendario.ts`

**Interfaces:**
- Consumes: `validateDraft`, `slugify` (`src/remix/emit.ts`), `TEMPLATE_COMPONENTS`, `draftToSpec` (`src/remix/registry.ts`), `specTiming` (`src/reel/timing.ts`).
- Produces:
```ts
// src/calendario/draft.ts
export interface Borrador extends VariationDraft { pace?: Pace; audio?: string; logoEnCuadro0?: boolean }
export function parseBorrador(text: string): Borrador;                       // valida forma mínima, lanza con mensaje claro
export function borradorASpec(b: Borrador, opts?: { format?: Format }): CarouselSpec;   // conserva backgrounds (ai+brandStyle), pace, defaults.pillar
export function storySpec(b: Borrador): CarouselSpec;                         // 1 slide StoryCover 9:16 con title/highlight del Hook
export function duracionReelMs(spec: CarouselSpec): number;                   // specTiming(spec).total * 1000, redondeado
// src/templates/StoryCover.tsx
export interface StoryCoverProps extends BaseSlideProps { title: string; highlight?: string; rotulo?: string /* default "Nuevo en el feed ↑" */ }
export function StoryCover(p: StoryCoverProps): JSX.Element;
// renderReel.ts: RenderReelOptions gana `logoEnCuadro0?: boolean` y el resultado ahora es
export interface RenderReelResult { path: string; durationMs: number }   // renderReel sigue devolviendo string por compatibilidad; agregar renderReelResult(spec, opts): Promise<RenderReelResult>
```
- [ ] **Step 1: Tests (fallan).** `borradorASpec` sobre un borrador con `background: { ai: "…" }` en el Hook → el slide resultante tiene `props.background` `{ ai, overlay }` (hoy `draftToSpec` **lo pierde**: no copia `background`; ese es el bug a cubrir); `pace` llega a `spec.pace`; plantilla desconocida descartada (por `validateDraft`). `storySpec` → 1 slide, `format: "reel"`, título igual al del Hook. `duracionReelMs` coincide con `specTiming(spec).total*1000`. En `test/smoke.ts`: `renderToStaticMarkup(createElement(StoryCover, { title: "3 IAs gratis", highlight: "gratis", format: "reel" }))` contiene "Nuevo en el feed" y el wordmark.
- [ ] **Step 2: Implementar.** `StoryCover` usa `Frame` con `format="reel"` y el look lima (mismos tokens de `src/theme.ts`, como `Hook`), titular grande centrado en la franja 15–75 % vertical y el rótulo en una píldora lima abajo, por encima de la zona segura inferior de 440 px. **No** se agrega al catálogo del remix (`templates-catalog.ts`): el agente no puede usarla.
  `logoEnCuadro0: false` en `Frame`: el wordmark recibe `data-anim="late"`; en `src/reel/runtime.js`, `late` = opacidad 0 hasta t = 3 s y luego `power2.out` 0.4 s. Por defecto `true` y el markup es idéntico al actual (test: el HTML de un Hook sin la opción no cambia respecto de `main`).
- [ ] **Step 3: Verificación visual (obligatoria).** Con un borrador de ejemplo (el de `INSTRUCCIONES.md`): render del carrusel, del reel `--frames-only` y de la story; mira las imágenes y corrige tamaños, márgenes y desbordes. Adjunta las rutas en el reporte.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run test:reel` → PASS.
- [ ] **Step 5: Commit** `motor: borradores JSON del calendario, portada de story y logo tardío opcional`.

**Revisión:** revisor de spec + revisión visual (el revisor abre las imágenes).

---

### Task 7: QA del archivo final ⚔️

**Files:**
- Create: `src/calendario/qa.ts`, `test/calendario/qa.ts`
- Modify: `test/calendario.ts`, `package.json` (`test:reel` agrega `tsx test/calendario/qa-media.ts`), Create `test/calendario/qa-media.ts`

**Interfaces — Produces:**
```ts
export interface QaResultado { ok: boolean; motivos: string[] }
export function luminanciaMedia(gray: Uint8Array): number;                         // 0..1
export function hayTextoEnZona(gray: Uint8Array, width: number, height: number, desde?: number /*0.15*/, hasta?: number /*0.75*/): boolean;
export function tiemposDeLectura(spec: CarouselSpec, wps: number, minS: number): string[];   // escenas que no alcanzan palabras/wps
export async function grisDeImagen(path: string, width: number, height: number): Promise<Uint8Array>;   // ffmpeg -f rawvideo -pix_fmt gray
export async function tieneAudio(mp4: string): Promise<boolean>;                    // ffprobe -select_streams a
export async function qaReel(mp4: string, cover: string, spec: CarouselSpec, puerta: Puerta): Promise<QaResultado>;
export async function qaImagen(jpg: string, width: number, height: number): Promise<QaResultado>;   // portada de carrusel y story
```
- [ ] **Step 1: Tests puros (fallan):** `luminanciaMedia(new Uint8Array(100).fill(0)) === 0`; buffer negro con un rectángulo blanco de 400×60 en el 40 % vertical de un lienzo 1080×1920 → `hayTextoEnZona === true`; el mismo rectángulo en el 90 % → `false`; lienzo con grilla lima tenue (valor 40 cada 120 px) y sin texto → `false` (umbral: fracción de píxeles > 180 en la banda ≥ 0,4 %). `tiemposDeLectura` con una escena de 30 palabras y 4 s → reporta esa escena.
- [ ] **Step 2: Tests de medios (Chromium/ffmpeg, en `test:reel`):** generar con ffmpeg (`-f lavfi -i color=black:s=1080x1920:d=2`) un MP4 negro y mudo → `qaReel` con `motivos` que incluyen "pantalla negra" y "sin audio"; un MP4 renderizado del borrador de ejemplo con una pista de `promo/audio/` (o un tono `sine` generado si la carpeta está vacía) → `ok: true`.
- [ ] **Step 3: Implementar** (luminancia > 0,12 del cuadro 0; audio presente; texto en zona; tiempos de lectura; mensajes en español). `grisDeImagen` usa `spawnSync("ffmpeg", ["-v","error","-i",path,"-vf",`scale=${w}:${h},format=gray`,"-frames:v","1","-f","rawvideo","-"], { maxBuffer: w*h+1024 })`.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run test:reel` → PASS.
- [ ] **Step 5: Commit** `calendario: QA del archivo final (cuadro 0, audio, texto y tiempos de lectura)`.

**⚔️ Mandato adversarial T7:** portada con fondo `ai` muy claro (texto oscuro) → no debe dar falso "sin texto"; si lo da, el implementador agrega la detección por contraste local (diferencia con la mediana de la banda) en vez de umbral fijo. MP4 con pista de audio en silencio absoluto (`anullsrc`) → debe fallar ("audio mudo", con `ffmpeg -af volumedetect`, `max_volume < -60 dB`). Archivo truncado o que no existe → `ok: false` con motivo, nunca excepción.

---

### Task 8: Render en el Mac — `npm run calendario:render` + launchd ⚔️

**Files:**
- Create: `src/calendario/render.ts`, `src/calendario/render-cli.ts`, `src/calendario/telegram-directo.ts`, `deploy/launchd/es.ia.calendario-render.plist`, `scripts/calendario-install-mac.sh`, `test/calendario/render.ts`
- Modify: `package.json` (`"calendario:render": "tsx src/calendario/render-cli.ts"`), `.env.example`, `test/calendario.ts`

**Interfaces:**
- Consumes: T1 (`leerSemana`, `listarSemanas`, `estadoEfectivo`, `RenderEntry`, `zonedToUtc`), T6 (`parseBorrador`, `borradorASpec`, `storySpec`, `renderReelResult`), T7 (`qaReel`, `qaImagen`), `renderCarousel`, `scoreDraft`, `pullKb`/`commitPaths` (`src/kb/store.ts`, con `KB_DIR=./knowledge` en el Mac).
- Produces:
```ts
export interface PiezaPendiente { semana: string; pieza: Pieza; borradorPath: string }
export function pendientes(semanas: { semana: string; plan: Plan; render: Record<string, RenderEntry>; estado: Record<string, EstadoEntry> }[], ahora: Date): PiezaPendiente[];   // planificadas, sin render ok, cuya hora aún no pasó
export function urlPublica(base: string, token: string, semana: string, id: string, archivo: string): string;
export function ocultarToken(s: string, token: string): string;
export interface Deps { render: (p: PiezaPendiente, tmp: string) => Promise<{ archivos: string[]; duracionMs?: number }>; rsync: (local: string, remoto: string) => Promise<void>; verificar: (url: string, tipo: string) => Promise<boolean>; escribirRender: (semana: string, id: string, e: RenderEntry) => Promise<void>; avisar: (texto: string) => Promise<void> }
export async function procesar(pend: PiezaPendiente[], outRoot: string, env: { base: string; token: string; host: string; dir: string }, deps: Deps): Promise<{ ok: number; fallidas: number; pendientes: number }>;
// telegram-directo.ts
export async function avisarTelegram(texto: string): Promise<boolean>;   // fetch a api.telegram.org con TELEGRAM_BOT_TOKEN a cada TELEGRAM_ALLOWED_CHAT_IDS; nunca lanza
```
Archivos por pieza en `output/calendario/<semana>/<id>/`: carrusel `01.jpg … NN.jpg` + `story.jpg`; reel `reel.mp4` + `cover.jpg` + `story.jpg`.

- [ ] **Step 1: Tests (fallan)** con `deps` falsos y carpetas temporales:
  - `pendientes` ignora piezas `renderizado`/`publicado`/`saltado`, piezas cuya hora ya pasó (no se renderiza tarde) y semanas con `piezas: []`.
  - `procesar`: render ok + rsync ok + verificar ok → `escribirRender(... { estado: "renderizado", medios: { urls, cover, story, duracionMs } })`.
  - Render lanza → `escribirRender` con `fallido` y motivo; sigue con la siguiente.
  - QA falla (`render` devuelve error de QA) → `fallido` con los motivos.
  - rsync falla → **no** escribe render, avisa por `avisar` con el token oculto, la carpeta final queda en disco; la siguiente corrida con los archivos ya presentes **no** vuelve a renderizar (`deps.render` no se llama) y solo reintenta rsync.
  - Carpeta temporal a medias (`<id>.tmp-*` sin mover) → se borra y se vuelve a renderizar entera.
  - `verificar` devuelve `false` → igual que rsync fallido.
  - `urlPublica` codifica cada segmento (`encodeURIComponent`) y nunca deja `//`.
- [ ] **Step 2: Implementar `render.ts`.** Flujo de `render` real: `parseBorrador` → `scoreDraft` ≥ 75 (si no, `fallido` con `suggestions`) → carrusel: `renderCarousel(spec, { outDir: tmp })` y cada PNG a JPEG con `ffmpeg -y -i slide-NN.png -q:v 2 NN.jpg`; reel: `renderReelResult(spec, { outDir: tmp, pace, audio: join("promo/audio", audio), logoEnCuadro0 })` y `cover.jpg` desde el cuadro 0 (`ffmpeg -ss 0 -i reel.mp4 -frames:v 1 -q:v 2 cover.jpg`); story: render de `storySpec` 1080×1920 a JPEG. Luego QA (T7). Todo en `<id>.tmp-<pid>` y `rename` atómico a `<id>` al final. `audio` con `/` o `..` → `fallido`.
  `rsync -az --chmod=F644,D755 -e "ssh -o BatchMode=yes" <local>/ $SERVER_HOST:$SERVER_MEDIA_DIR/<semana>/<id>/`. `verificar`: `fetch(url, { method: "HEAD" })` → 200 y `Content-Type` `image/jpeg` o `video/mp4`.
  `escribirRender`: lee `render.json` fresco tras `pullKb()`, fusiona la entrada, escribe, `commitPaths([...], "calendario: render <semana> (<n> piezas)")` (con `KB_GIT_PUSH=1` en el entorno del comando para que suba). Una sola escritura por corrida y semana (acumula entradas).
- [ ] **Step 3: `render-cli.ts`.** Carga `.env`, exige `SERVER_HOST`, `SERVER_MEDIA_DIR`, `MEDIA_PUBLIC_BASE`, `MEDIA_PUBLIC_TOKEN` (falta alguna → mensaje y salida 1). Candado `output/calendario/.lock` con PID (si el PID vive, sale en silencio: launchd puede solaparse). `pullKb()`; sin pendientes → salida 0 en silencio. Muestra progreso `[2/6] mar-carrusel-… renderizando…`. **No** importa nada de `src/kb/bot.ts`.
- [ ] **Step 4: launchd.** `es.ia.calendario-render.plist`: `StartInterval` 3600, `RunAtLoad` true, `WorkingDirectory` el repo, `ProgramArguments` `["/bin/zsh","-lc","npm run calendario:render >> output/calendario/render.log 2>&1"]`, `EnvironmentVariables` con `PLAYWRIGHT_CHROMIUM_EXECUTABLE` y `PATH` que incluya `/opt/homebrew/bin`. `scripts/calendario-install-mac.sh`: reemplaza `__REPO__` en el plist, lo copia a `~/Library/LaunchAgents/`, `launchctl bootout`/`bootstrap gui/$UID`, prueba `ssh -o BatchMode=yes $SERVER_HOST "test -w $SERVER_MEDIA_DIR"` y un `rsync` de un archivo de prueba + `curl -I` a su URL pública, y lo borra.
- [ ] **Step 5:** `npm run typecheck && npm test` → PASS. Con Chromium: `npm run calendario:render` contra una semana de prueba en una base temporal y `SERVER_HOST=localhost`, `SERVER_MEDIA_DIR=/tmp/...` (spec: "rsync a un directorio local simulando el servidor").
- [ ] **Step 6: Commit** `calendario: render en el Mac con QA, subida por rsync y launchd`.

**⚔️ Mandato adversarial T8:** el Mac se duerme a mitad (mata el proceso entre `rename` y `escribirRender`); dos corridas a la vez; `git pull` con conflicto en `knowledge/`; pieza cuya hora pasó mientras renderizaba (debe marcarse? no: el bot la salta; el Mac no la sube); `render.json` modificado en remoto entre el pull y el push; `MEDIA_PUBLIC_TOKEN` que aparece en algún log o mensaje de Telegram; `borrador` con ruta fuera de la carpeta de la semana.

---

### Task 9: Servidor de medios en el bot ⚔️

**Files:**
- Create: `src/calendario/media-server.ts`, `test/calendario/media-server.ts`
- Modify: `src/kb/inbox.ts` (servidor HTTP compartido con rutas extra), `compose.yaml`, `scripts/server-setup.sh`, `test/calendario.ts`

**Interfaces — Produces:**
```ts
export const CONTENT_TYPES: Record<string, string>;   // .jpg/.jpeg → image/jpeg, .mp4 → video/mp4
export function resolverMedio(pathname: string, token: string, root: string): string | undefined;   // ruta absoluta segura o undefined
export function manejarMedio(req: IncomingMessage, res: ServerResponse, opts: { token: string; root: string }): boolean;   // true si atendió (incluye 404 propios)
export async function limpiarMedios(root: string, publicados: { semana: string; id: string; publicadoEn: string }[], ahora: Date): Promise<string[]>;   // borra carpetas > 7 d desde el publish
// inbox.ts
export interface HttpRoute { (req: IncomingMessage, res: ServerResponse, url: URL): boolean }
export function startHttp(port: number, routes: HttpRoute[]): Server;   // /health siempre; luego cada ruta; si ninguna atiende → 404
```
`startInbox` pasa a ser una `HttpRoute` (`webhookRoute(opts)`); el bot llama `startHttp` si hay webhook **o** `MEDIA_PUBLIC_TOKEN` (hoy el servidor solo arranca con `META_WEBHOOK_VERIFY_TOKEN`).

- [ ] **Step 1: Tests (fallan)** con un `root` temporal que tiene `2026-10-12/lun-reel-x/reel.mp4` y un archivo `secreto.txt` fuera del root:
  - Ruta válida → ruta absoluta dentro de `root`.
  - Token distinto, token vacío, token prefijo del real → `undefined` (comparación con `timingSafeEqual` sobre buffers de igual largo).
  - `..`, `%2e%2e`, `%2F`, barras dobles, segmento vacío, extensión `.txt`, `semana` que no es fecha, `id` fuera de `^[a-z0-9-]{3,80}$` → `undefined`.
  - Symlink dentro del root que apunta afuera → `undefined` (`realpath` debe empezar por `realpath(root) + sep`).
  - Servidor real (`startHttp` en puerto 0): `GET` → 200, `Content-Type` correcto, `Content-Length`, `Cache-Control: no-store`; `HEAD` → 200 sin cuerpo; `Range: bytes=0-99` → 206 (Meta puede pedir rangos en video); token malo → 404 (no 401/403: no confirma que la ruta existe); `/health` sigue respondiendo; `/webhook` sigue igual (los tests existentes de `test/kb.ts` pasan).
  - `limpiarMedios` borra solo carpetas con `publicadoEn` hace > 7 d; nunca borra fuera de `root`; no borra piezas no publicadas.
- [ ] **Step 2: Implementar** con `createReadStream` y `pipeline`; los logs muestran la ruta con el token como `***`.
- [ ] **Step 3: Despliegue.** `compose.yaml`: volumen `./media:/data/media`, variables `MEDIA_PUBLIC_TOKEN`, `MEDIA_PUBLIC_BASE`, `CALENDARIO_MODO` (desde `.env`). `scripts/server-setup.sh`: crea `~/carrusel/media` con dueño del usuario SSH y permisos `755`; documenta que `SERVER_MEDIA_DIR` en el Mac es `carrusel/media` (ruta del host, no del contenedor). Ajustar el texto de la spec "`/data/media`" en el `.env.example` con esa aclaración.
- [ ] **Step 4:** `npm run typecheck && npm test` → PASS.
- [ ] **Step 5: Commit** `calendario: servidor de medios con token, rangos y limpieza a los 7 días`.

**⚔️ Mandato adversarial T9:** traversal en todas sus formas (incluye `\`, unicode `%c0%ae`, `;`, `?` y `#` en la ruta), timing del token, archivo que se borra mientras se sirve, cliente que corta la conexión a mitad (el proceso no debe caer: `unhandledRejection`), 1 000 requests paralelos a un 404 (sin fuga de descriptores), `Range` inválido (`bytes=999999999-`) → 416.

---

### Task 10: Publicación y scheduler idempotente ⚔️ (la de mayor riesgo)

**Files:**
- Create: `src/calendario/publish.ts`, `src/calendario/scheduler.ts`, `src/calendario/registro.ts`, `test/calendario/publish.ts`, `test/calendario/scheduler.ts`
- Modify: `src/meta/client.ts` (`graphPostForm`), `test/calendario.ts`

**Interfaces:**
- Consumes: T1 (todo), `graphGet`, `GraphError`, `translateGraphError`, `tokenDaysLeft` (`src/meta/check.ts`), `urlPublica` (T8 — si T8 aún no está fusionado, mover `urlPublica` y `ocultarToken` a `src/calendario/plan.ts` en esta tarea y que T8 los importe de ahí; el integrador decide según el orden real).
- Produces:
```ts
// src/meta/client.ts
export async function graphPostForm<T = Record<string, unknown>>(path: string, params: Record<string, string | number | boolean | undefined>, opts?: GraphGetOptions): Promise<T>;
// publish.ts
export type Paso = "inicio" | "hijos" | "contenedor" | "esperando" | "publicando" | "publicado" | "fallido";
export interface Fila { piezaId: string; tipo: "post" | "story"; paso: Paso; containerId?: string; children?: string[]; mediaId?: string; intentos: number; error?: string }
export interface Graph { get: GraphGetFn; post: (path: string, params: Record<string, string | number | boolean | undefined>) => Promise<Record<string, unknown>> }
export interface PublishCtx { graph: Graph; igUserId: string; guardar: (f: Fila) => void; dormir: (ms: number) => Promise<void>; ahora: () => Date; modo: "auto" | "aviso" }
export class ErrorDeMeta extends Error {}            // no se reintenta
export class ErrorTransitorio extends Error {}       // se reintenta
export async function publicar(fila: Fila, pieza: Pieza, medios: Medios, ctx: PublishCtx): Promise<Fila>;
export async function publicarStory(fila: Fila, medios: Medios, ctx: PublishCtx): Promise<Fila>;
export function clasificar(err: unknown): "meta" | "transitorio";
// registro.ts (solo bot)
export async function anotarRegistro(linea: Record<string, unknown>): Promise<void>;          // append a registro.jsonl
export async function escribirEstado(semana: string, id: string, e: Partial<EstadoEntry>): Promise<void>;   // fusiona en estado.json
// scheduler.ts
export interface Tarea { semana: string; pieza: Pieza; tipo: "post" | "story"; hora: Date }
export function tareasDebidas(semanas: SemanaLeida[], filas: Fila[], ahora: Date, pausado: boolean): { publicar: Tarea[]; saltar: { semana: string; id: string; motivo: string }[] };
export async function tick(deps: SchedulerDeps): Promise<void>;
```
Reglas exactas:
- Post debido si `ahora ≥ hora` y `ahora < hora + 15 min` y estado efectivo `programado` (o `renderizado`, el bot lo pasa a `programado` al verlo). Fuera de esa ventana sin publicar → `saltado` "no se publica tarde". Sin render a la hora → `saltado` "falta el render".
- Story debida si su post está `publicado` con `publicadoEn` y `ahora ≥ publicadoEn + 60 min` y no hay fila `story` terminada; sin ventana de 15 min (la story puede ir tarde hasta +6 h; después, se descarta con motivo).
- `pausado` → nada se publica; piezas cuya ventana pasa durante la pausa → `saltado` "pausado".
- `modo: "aviso"` → recorre todos los pasos con IDs ficticios `aviso-<id>`, sin `graph.post`, y anota en registro `{ tipo: "aviso", ... }`.

- [ ] **Step 1: Tests de `publish.ts` (fallan)** con un `Graph` falso que simula Meta (contenedores con `status_code` programable, errores por llamada, contador de `media_publish`). Cada test verifica `guardar` llamado **antes** de cada POST siguiente (la fila persistida siempre está un paso atrás o igual al trabajo hecho):
  - Carrusel de 3: 3 POST `{ig}/media` con `image_url` + `is_carousel_item=true`, 1 POST `CAROUSEL` con `children=a,b,c` y `caption`, espera `FINISHED`, 1 `media_publish` → `paso: "publicado"`, `mediaId`.
  - Reel: `media_type=REELS`, `video_url`, `cover_url`, `share_to_feed=true`, `caption`; `IN_PROGRESS` × 3 → `FINISHED`; `dormir` llamado con 15 000; tope 10 min (40 sondeos) → `fallido` "Meta no terminó de procesar el video en 10 min".
  - `status_code=ERROR` → `ErrorTransitorio` las 3 primeras veces (URL caída), con `dormir(10 min)` entre intentos, y al 4.º `fallido`. Cada reintento crea contenedor nuevo (el viejo queda huérfano y Meta lo expira; correcto).
  - **Reanudar**: fila `{ paso: "esperando", containerId: "c1" }` → no crea contenedor, solo sondea `c1` y publica. Fila `{ paso: "hijos", children: ["a","b"] }` de un carrusel de 3 → crea solo el 3.º hijo.
  - **`fallo de red tras media_publish no duplica`**: `media_publish` lanza `GraphError` de red **después** de que el falso registró la publicación. `publicar` no repite `media_publish` a ciegas: hace `GET {containerId}?fields=status_code`; si es `PUBLISHED`, busca en `GET {ig}/media?fields=id,caption,timestamp&limit=10` el más reciente con `caption` idéntico y `timestamp` ≥ inicio del intento → `mediaId`. Contador de `media_publish` del falso = 1.
  - Fila `{ paso: "publicando", containerId }` al reanudar (reinicio entre el POST y la respuesta) → mismo camino de verificación, nunca un segundo `media_publish` si el contenedor está `PUBLISHED`.
  - Error código 190, 10, 200, 100 o `9007`/`2207xxx` (contenido rechazado) → `ErrorDeMeta`, `fallido`, sin reintento, `error` = mensaje traducido. Código 4/17/32/613 (cuota) → `fallido` (la spec lo pone con los de Meta).
  - Story: `media_type=STORIES`, `image_url` = URL de `story.jpg`, sin caption; mismo patrón.
- [ ] **Step 2: Tests de `scheduler.ts` (fallan)**, puros sobre `tareasDebidas` con `zonedToUtc`:
  - Pieza 19:30 del lunes 2026-10-12: a las 22:29Z no; a 22:30Z sí; a 22:46Z → saltar "no se publica tarde".
  - Pieza 00:30 del domingo 2026-09-06 (hora inexistente) → debida a las 04:30Z una sola vez (domingo no lleva piezas por mix, pero el scheduler no lo asume: el test usa una pieza de prueba con `dia` domingo construida a mano).
  - Pieza con fila `post` en `publicado` → nunca vuelve a aparecer.
  - Pieza con fila `post` en `esperando` → aparece (para reanudar) aunque ya pasaron 15 min: una vez creado el contenedor, se termina.
  - Story: aparece a `publicadoEn + 60 min`, no antes; pieza `saltado` o `fallido` → sin story.
  - `pausado` → `publicar` vacío.
  - Token inválido (`deps.tokenOk()` false) → `tick` no publica y avisa una sola vez por día.
- [ ] **Step 3: Implementar.** `graphPostForm` = `graphPost` con `Content-Type: application/x-www-form-urlencoded` y `URLSearchParams`; mismas reglas de token, proof y traducción; **sin** reintento interno (el reintento lo decide `publicar`). En `tick`: lee semanas (`listarSemanas` actual y siguiente), filas de `publicaciones`, `pausado` de `calendario_estado`; para cada tarea, en serie: crea/lee la fila, `publicar`, y al terminar `escribirEstado` + `anotarRegistro({ tipo: "publicado", piezaId, semana, mediaId, publicadoEn, duracionMs, nombreMotor: slugify(borrador.name), predictedScore })` + `commitPaths`. El commit sale **después** de persistir la fila en SQLite: si el push falla, la fila manda y `syncFromRemote` no la puede revertir porque `estado.json` lo escribe solo el bot.
  Al día siguiente (`ahora ≥ publicadoEn + 20 h`) sin `permalink`: `GET {mediaId}?fields=permalink` → `escribirEstado` + registro.
- [ ] **Step 4:** `npm run typecheck && npm test` → PASS.
- [ ] **Step 5: Commit** `calendario: publicación idempotente de carruseles, reels y stories`.

**⚔️ Mandato adversarial T10:** el adversario construye un "Meta caótico" (falso con fallos aleatorios con semilla fija, 500 corridas) y un "reinicio caótico" (mata `publicar` en cada `await` posible, persiste la última fila guardada y reanuda). Invariante que debe pasar en las 500: **a lo más un `media_publish` exitoso por (pieza, tipo)**, y toda pieza termina en `publicado`, `fallido` o `saltado`. Además: dos `tick` concurrentes (el `setInterval` se solapa si una publicación tarda 10 min) — debe haber un candado en memoria; reloj que salta hacia atrás (NTP); `estado.json` que el `git pull` reemplaza por una versión vieja; pieza con 11 URLs (carrusel > 10 → `fallido` sin llamar a Meta); caption de 2 300 caracteres o con 31 hashtags (límites de Instagram → `fallido` sin llamar a Meta).

---

### Task 11: Calendario en el bot — Telegram, avisos y arranque

**Files:**
- Create: `src/calendario/telegram.ts`, `test/calendario/telegram.ts`
- Modify: `src/kb/bot.ts`, `src/kb/telegram.ts` (`HELP`), `src/meta/check.ts`, `test/smoke.ts` (o `test/calendario/telegram.ts`), `test/calendario.ts`

**Interfaces:**
- Consumes: T1, T4 (secciones del bot), T9 (`startHttp`, `manejarMedio`, `limpiarMedios`), T10 (`tick`, `tareasDebidas`, `escribirEstado`).
- Produces:
```ts
export function formatSemana(s: SemanaLeida, ahora: Date): string;          // /calendario: una línea por pieza con día, hora, formato, estado y emoji
export function formatPreview(p: Pieza, medios: Medios): { caption: string; foto: string };   // texto ≤ 1024 (límite de caption de Telegram)
export function avisoRenderPendiente(semanas: SemanaLeida[], ahora: Date): string | undefined; // sábado ≥ 12:00 local o 12 h antes de la primera pieza
export function recordatorioLunes(ahora: Date, ultimo?: string): boolean;   // lunes ≥ 09:00 local, una vez por semana
export function silencioCalendario(semanas: string[], ahora: Date): string | undefined;          // domingo ≥ 12:00 sin carpeta de la semana siguiente
export function idDesdeArgumento(arg: string, semanas: SemanaLeida[]): { semana: string; id: string } | undefined;
```
- [ ] **Step 1: Tests (fallan)** de las funciones puras: preview truncado con "…" a 1024; `avisoRenderPendiente` a las 11:59 del sábado no, a las 12:00 sí, y si la primera pieza del lunes es a las 08:00 el aviso sale el domingo 20:00 si aún falta; no avisa dos veces la misma semana (la función recibe `yaAvisado`); `silencioCalendario` el domingo 12:00 sin `_calendario/<lunes siguiente>/` → texto; con la carpeta (aunque `piezas: []`) → `undefined`; `idDesdeArgumento` acepta id exacto o prefijo único.
- [ ] **Step 2: Cablear en `bot.ts`** (sección `// --- calendario ---`):
  - Arranque del HTTP: reemplazar `startInstagramInbox()` por `startHttp(port, rutas)` con la ruta del webhook (si está configurado) y la de medios (si `MEDIA_PUBLIC_TOKEN`).
  - Solo si `CALENDARIO_MODO` es `auto` o `aviso` (otro valor → error claro al arrancar): `setInterval(tick, 60_000)` con candado; `limpiarMedios` diario.
  - En `syncFromRemote`, después del reindex: piezas con render `renderizado` sin fila → `escribirEstado(programado)` y enviar preview (`sendPhoto` con la URL de `cover`/primera imagen, caption, hora y botón inline **Saltar** `cal-saltar:<semana>:<id>`); `avisoRenderPendiente`; `silencioCalendario`.
  - Tras cada `publicado`: a los 2 min, permalink (si ya está) + "Responde los comentarios en la primera hora."; `recordatorioLunes`: "Esta semana: 30-60 min de interacción en el nicho."
  - Comandos `/calendario`, `/pausar`, `/reanudar` (`calendario_estado` clave `pausado`), `/publicar <id>` (fuerza ahora: crea la tarea aunque no sea la hora, solo si el estado es `programado`; responde con el resultado), `/saltar <id>`; callback `cal-saltar` válido solo hasta la hora de la pieza. Todos solo para chats de `allowed`.
  - `setMyCommands` y `HELP` actualizados.
- [ ] **Step 3: `meta:check`.** Si `CALENDARIO_MODO` está definido, `instagram_content_publish` entra en los permisos requeridos (exportar `PUBLISH_SCOPES`); mostrar `followers_count` y si `online_followers` responde (`GET {ig}/insights?metric=online_followers&period=lifetime`) con "(requiere 100 seguidores)" si no.
- [ ] **Step 4:** `npm run typecheck && npm test` → PASS. Prueba local en modo aviso: `CALENDARIO_MODO=aviso KB_DIR=<base temporal con una semana renderizada> npm run kb:bot` con un bot de Telegram de prueba si el usuario lo tiene; si no, se deja para Task 14.
- [ ] **Step 5: Commit** `calendario: /calendario, /pausar, /publicar, previews y avisos por Telegram`.

**Revisión:** revisor de spec + revisor de seguridad (callbacks y comandos solo para `allowed`; `/publicar` no acepta ids fuera de la semana; ningún token en mensajes).

**Checkpoint Fase 2.**

---

### Task 12: Bucle de feedback ⚔️

**Files:**
- Create: `src/calendario/bucle.ts`, `test/calendario/bucle.ts`
- Modify: `src/kb/bot.ts` (escribir `_metricas/bucle.json` tras el resumen del domingo, antes de las 06:00), `src/insights/summary.ts` (diagnóstico mensual en el resumen), `kb-plantilla/_calendario/INSTRUCCIONES.md` (cómo leer `bucle.json`), `test/calendario.ts`

**Interfaces — Produces:**
```ts
export interface Medicion { piezaId: string; tema: string; arquetipo: string; hookCategoria: string; senal: Senal; valor: number; semana: string; parametros?: Record<string, unknown>; retencion?: number; reach?: number; saved?: number; shares?: number }
export function pesoEncogido(valores: number[], mediaGlobal: number, k?: number /* 3 */): number | undefined;   // undefined si n < 3; (n·media + k·global)/(n + k)
export function pesos(m: Medicion[], clave: "tema" | "arquetipo" | "hookCategoria"): Record<string, { n: number; peso?: number }>;
export function ganadores(m: Medicion[]): string[];                    // 20 % superior dentro de cada señal (percentil, mínimo 1 si hay ≥ 5 piezas de esa señal)
export function derivadosPendientes(m: Medicion[], publicadas: { derivadoDe: string | null; semana: string }[], semanaActual: string): { de: string; tema: string; hasta: string }[];   // ventana de 2 semanas, máximo 2 derivados por ganador
export function horasDesdeOnline(online: Record<string, number> | undefined, ventana: [string, string], separacionH: number, dias: number[]): Record<string, string> | undefined;
export function seguidoresPorPieza(porDia: Record<string, number>, publicadas: { piezaId: string; dia: string }[]): Record<string, number>;   // delta del día siguiente
export function diagnostico(m: Medicion[], cuenta: { seguidoresNuevos28d?: number; alcance28d?: number }): string[];   // reglas 1–4 de la spec
export function compararParametro(m: Medicion[], parametro: string): { valor: string; n: number; media: number }[] | undefined;   // solo si ≥ 4 semanas y ≥ 6 piezas por valor
export function construirBucle(...): BucleJson;   // todo lo anterior en un objeto serializable
```
- [ ] **Step 1: Tests (fallan):**
  - `pesoEncogido([10, 10], 2)` → `undefined` (n < 3); `pesoEncogido([10,10,10], 2)` → `6`; un viral `[1000, 1, 1]` con global 2 → muy por debajo de 1000 (≤ 170).
  - `ganadores` con 10 piezas de `guardados` → las 2 mejores; con 4 piezas → ninguna (muy pocas); empates en el corte → todos los empatados.
  - `derivadosPendientes`: un ganador de la semana W genera pendiente hasta W+14 d; con 2 derivados ya publicados → ninguno; vencido → ninguno.
  - `horasDesdeOnline`: `online_followers` en UTC (Meta entrega horas 0–23 en la zona del usuario de la cuenta; documentar la suposición y convertir con `zonedToUtc` si llega en UTC) → hora con más seguidores dentro de 08:00–23:00, redondeada a :00/:30; si dos días consecutivos quedan a < 20 h (p. ej. 23:00 y 08:00 del siguiente… 9 h), corre el segundo a la siguiente mejor hora válida; `undefined` → `undefined` (el agente usa la tabla).
  - `diagnostico`: seguidores nuevos/alcance < 1 % → mensaje de perfil; retención media de reels < 0,3 → cambiar categoría de hook; con < 4 semanas de datos → `[]` (la spec evalúa en ciclos de 4 semanas).
  - `compararParametro` con 5 piezas por valor → `undefined`.
- [ ] **Step 2: Implementar.** Valores de señal desde `valorSenal` de T3 (respeta el umbral de 50); mezclar absolutos y tasas en un mismo peso está prohibido: si la cuenta cruzó el umbral, el peso usa solo las piezas medidas en modo `tasa` (comentario en el código con la razón).
- [ ] **Step 3: Cablear.** Domingo, después de `summaryTick` y antes de las 06:00 local: `construirBucle` → `_metricas/bucle.json` → commit. `INSTRUCCIONES.md`: explicar cada campo de `bucle.json` y que el agente **propone** cambios de `config.json` en `aprendizajes.md`, nunca los aplica.
- [ ] **Step 4:** `npm run typecheck && npm test` → PASS.
- [ ] **Step 5: Commit** `calendario: bucle de feedback (pesos con encogimiento, ganadores, derivados y diagnóstico)`.

**⚔️ Mandato adversarial T12:** semanas sin datos, una sola pieza, todas las piezas con valor 0, `NaN`/`undefined` en `valor`, piezas manuales colándose en los pesos, un tema con nombre que varía en tildes o `[[ ]]` (`[[Automatización con IA]]` vs `Automatizacion con IA`) — deben agruparse igual (usar `topicKey` de `src/kb/markdown.ts`), la cuenta cruza 50 de alcance a mitad del mes, `online_followers` con horas faltantes.

---

### Task 13: Documentación y despliegue

**Files:**
- Modify: `README.md` (sección "Marca" con el look lima: tokens de la Global Constraints de `docs/superpowers/plans/2026-10-05-look-lima-y-ritmo.md`; sección nueva "Calendario y métricas"), `deploy/README.md` (volumen de medios, variables, `CALENDARIO_MODO`, token de System User con `instagram_content_publish`), `.env.example` (`SERVER_HOST`, `SERVER_MEDIA_DIR`, `MEDIA_PUBLIC_BASE`, `MEDIA_PUBLIC_TOKEN`, `CALENDARIO_MODO`), `scripts/deploy-to-server.sh` (`--update` crea `media/` si falta).

- [ ] **Step 1:** Escribir la sección "Calendario y métricas": qué corre dónde (tabla de las tres máquinas), los cinco pasos de "Puesta en marcha" de la spec con los comandos exactos, comandos de Telegram, cómo pausar, cómo borrar un post (desde la app), qué hacer si el Mac no se prendió.
- [ ] **Step 2:** Revisar que ningún ejemplo trae un token real.
- [ ] **Step 3: Commit** `docs: calendario, métricas y look lima en el README`.

---

### Task 14: Cierre — revisión adversarial de rama completa y ensayo en modo aviso

- [ ] **Step 1: Revisión de rama completa** (subagente opus, contexto limpio, rol adversario): recibe la spec, este plan y `git diff main...HEAD`. Mandato: recorrer el ciclo de una semana completa (domingo 05:30 resumen → 06:00 agente → Mac renderiza el lunes 10:00 → bot programa → publica → story → instantáneas 24 h … 7 d → bucle del domingo siguiente) y buscar cualquier punto donde un archivo tenga dos escritores, una hora se interprete sin zona, un error se trague sin aviso, o un token pueda salir en un log. Entrega tests en `test/adversarial/final.ts`. Mismo protocolo de 3 rondas.
- [ ] **Step 2: Ensayo en modo aviso** (en el Mac, base temporal clonada de `ia-es-kb`): escribir a mano una semana con 1 carrusel y 1 reel válidos (`validar.mjs` ✓), `npm run calendario:render` con `SERVER_HOST=localhost`, arrancar el bot con `CALENDARIO_MODO=aviso` y horas a +3 min, y comprobar en `estado.json`/`registro.jsonl` los pasos `programado → publicado (aviso)` y la story a los 60 min (o con un `CALENDARIO_STORY_MIN` de prueba si se agregó para tests).
- [ ] **Step 3:** `npm run typecheck && npm test && npm run test:reel` → PASS.
- [ ] **Step 4:** Usar superpowers:finishing-a-development-branch. El primer post real lo dispara el usuario con `/publicar <id>` (spec, "Puesta en marcha" paso 4).
