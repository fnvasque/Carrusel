# Investigación semanal de la base (kb) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un agente de Claude en la nube investigue cada semana los temas de la base `ia-es-kb` y que el bot del servidor traiga esas notas, las indexe y las use al responder consultas por DM de Instagram y Telegram.

**Architecture:** El agente escribe notas en `referencias/`, un bloque `kb:research` en cada tema y un resumen en `_investigacion/resumenes/`, siguiendo `_investigacion/INSTRUCCIONES.md` y validando con `_investigacion/validar.mjs` (ambos versionados en este repo bajo `kb-plantilla/` e instalados en la base con un script). El bot hace `git pull` cada hora dentro de su cadena serial de escritura, reindexa fichas + referencias + bloques de investigación, reenvía los resúmenes nuevos por Telegram y avisa si la investigación deja de correr.

**Tech Stack:** TypeScript (tsx, node:sqlite, gray-matter, grammy, openai), Node ESM sin dependencias para el validador, git.

**Spec:** `docs/superpowers/specs/2026-10-03-investigacion-semanal-design.md`

## Global Constraints

- El bot nunca escribe en `referencias/`, `_investigacion/` ni dentro de `<!-- kb:research:start -->` … `<!-- kb:research:end -->`.
- El agente nunca toca `fuentes/` ni la zona `<!-- kb:auto:start -->` … `<!-- kb:auto:end -->`.
- `tipo` ∈ `software | producto | libro | metodo | persona | lugar | concepto | otro`.
- Fechas siempre `AAAA-MM-DD`.
- Línea del registro: `- AAAA-MM-DD · <Tema> · <n> referencias (<m> nuevas)`.
- Resumen: `_investigacion/resumenes/AAAA-MM-DD.md`, ≤ 1000 caracteres.
- Alerta de silencio: > 8 días desde la última fecha de `registro.md`.
- Pull periódico cada 1 h, solo en el servidor (`KB_GIT_PUSH=1`).
- Tope por corrida: 5 temas; 8 referencias por tema; temas elegibles: con fichas nuevas desde su última revisión o > 30 días sin revisar.
- Tarea programada: domingo 04:00 America/Santiago.
- Todo texto visible al usuario en español. Las pruebas son offline (sin OpenAI ni red).

## Review Focus

- Nota de referencia editada a mano en Obsidian (frontmatter con listas en bloque `- x`, fechas sin comillas): el validador y el indexador deben leerla igual que la escrita por el agente.
- Tema sin bloque `kb:research` o con un bloque vacío: el indexador no debe crear un documento vacío ni romperse.
- `registro.md` inexistente (base recién instalada): ni alerta de silencio ni error.
- Índice borrado o recién creado con resúmenes viejos en el repo: no debe reenviar todos los resúmenes históricos por Telegram.
- Pull que choca (alguien editó lo mismo en el Mac): la base local queda como estaba, se aborta el rebase y se avisa una vez.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/kb/research.ts` (nuevo) | Rutas de investigación, lectura de referencias y bloques `kb:research`, registro, alerta de silencio, resúmenes pendientes |
| `src/kb/indexer.ts` | Indexa cualquier `IndexDoc` (fichas, referencias, bloques de investigación) |
| `src/kb/search.ts` | `Hit.kind` |
| `src/kb/ask.ts` | Rotula fuentes de investigación en el contexto y en el prompt |
| `src/kb/telegram.ts` | Muestra las fuentes de investigación como «🔎 … — investigado …» |
| `src/kb/store.ts` | `pullKb()` |
| `src/kb/bot.ts` | Sincronización horaria, reenvío de resúmenes, alerta de silencio |
| `kb-plantilla/_investigacion/validar.mjs` (+ `.d.mts`) | Validador sin dependencias que corre el agente |
| `kb-plantilla/_investigacion/INSTRUCCIONES.md` | Manual del agente |
| `kb-plantilla/CLAUDE.md` | Cómo navegar la base (para agentes) |
| `scripts/kb-research-install.sh` | Copia la plantilla a la base y la commitea |
| `test/kb.ts` | Pruebas |

---

### Task 1: Módulo de investigación (lectura, registro, resúmenes)

**Files:**
- Create: `src/kb/research.ts`
- Test: `test/kb.ts`

**Interfaces:**
- Consumes: `kbDir`, `temasDir`, `readIfExists` de `src/kb/store.ts`; `asDate`, `unwikilink` de `src/kb/markdown.ts`; `openDb` de `src/kb/db.ts`.
- Produces:
  - `RESEARCH_START = "<!-- kb:research:start -->"`, `RESEARCH_END = "<!-- kb:research:end -->"`
  - `referenciasDir(): string`, `investigacionDir(): string`, `resumenesDir(): string`, `registroPath(): string`
  - `researchBlock(body: string): string | undefined`
  - `reviewedDate(block: string): string | undefined`
  - `parseRegistro(text: string): Map<string, string>` (tema → última fecha)
  - `silenceAlert(registroText: string | undefined, today: string): { since: string; text: string } | undefined`
  - `pendingSummaries(files: string[], notified: Set<string>): string[]`
  - `summaryText(raw: string): string | undefined`
  - `interface ReferenceNote { path: string; baseName: string; title: string; tipo?: string; reviewed?: string; topics: string[]; raw: string; body: string }`
  - `parseReferencia(path: string, raw: string): ReferenceNote`
  - `listReferencias(): Promise<ReferenceNote[]>`
  - `interface ResearchBlock { topic: string; path: string; reviewed?: string; block: string }`
  - `listResearchBlocks(): Promise<ResearchBlock[]>`
  - `takeNewSummaries(): Promise<{ name: string; text: string }[]>` (marca como notificados; la primera vez con la tabla vacía marca todo sin devolver nada)

- [ ] **Step 1: Agregar un `checkAsync` y escribir las pruebas que fallan**

En `test/kb.ts`, justo después de la función `check` existente, agregar. Las
pruebas async se encadenan y arrancan recién en el `await` final, después de todas
las sincrónicas: así nunca se pisan `process.env.KB_DIR` entre ellas.

```ts
/** Pruebas async: en serie y después de las sincrónicas (algunas cambian KB_DIR). */
let asyncChain: Promise<void> = Promise.resolve();
function checkAsync(name: string, fn: () => Promise<void>): void {
  asyncChain = asyncChain.then(() =>
    fn().then(
      () => {
        passed++;
        console.log("✓", name);
      },
      (err) => {
        failed++;
        console.error("✗", name, "\n ", err instanceof Error ? err.message : err);
      },
    ),
  );
}
```

Y reemplazar las dos últimas líneas del archivo por:

```ts
await asyncChain;
console.log(`\n${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
```

Agregar el import:

```ts
import {
  listReferencias, listResearchBlocks, parseReferencia, parseRegistro, pendingSummaries, researchBlock, reviewedDate,
  RESEARCH_END, RESEARCH_START, silenceAlert, summaryText, takeNewSummaries,
} from "../src/kb/research.ts";
import { mkdirSync, writeFileSync } from "node:fs";
```

(fusionar `mkdirSync, writeFileSync` con el import existente de `node:fs` si ya está). Agregar al final, antes del bloque final:

```ts
// --- investigación semanal ---
const BLOCK = `${RESEARCH_START}\n## Investigación\n_Revisado 2026-10-12_\n\nEstado.\n\n### Referencias\n- [[n8n]] — flujos\n${RESEARCH_END}`;

check("researchBlock: contenido entre marcadores; sin marcadores o vacío → undefined", () => {
  assert.equal(researchBlock(`antes\n${BLOCK}\ndespués`), BLOCK.slice(RESEARCH_START.length, -RESEARCH_END.length).trim());
  assert.equal(researchBlock("sin bloque"), undefined);
  assert.equal(researchBlock(`${RESEARCH_START}\n \n${RESEARCH_END}`), undefined);
  assert.equal(researchBlock(`${RESEARCH_END} al revés ${RESEARCH_START}`), undefined);
  assert.equal(reviewedDate(BLOCK), "2026-10-12");
  assert.equal(reviewedDate("sin fecha"), undefined);
});

check("renderTopic conserva el bloque kb:research al regenerar el tema", () => {
  const s = { description: "d", essentials: ["e"], tools: [], techniques: [] };
  const first = renderTopic("Tema", s, [], "2026-10-01");
  const withBlock = first.replace("## Mis notas", `${BLOCK}\n\n## Mis notas`);
  const again = renderTopic("Tema", { ...s, essentials: ["otra"] }, [], "2026-10-02", withBlock);
  assert.ok(again.includes(BLOCK));
  assert.ok(again.includes("- otra"));
});

check("parseRegistro: última fecha por tema; ignora líneas ajenas", () => {
  const r = parseRegistro(
    "# Registro\n\n- 2026-10-05 · Cocina · 2 referencias (2 nuevas)\n- 2026-10-12 · Cocina · 3 referencias (1 nuevas)\n" +
      "- 2026-10-12 · Automatización con IA · 4 referencias (0 nuevas)\nbasura\n",
  );
  assert.equal(r.get("Cocina"), "2026-10-12");
  assert.equal(r.get("Automatización con IA"), "2026-10-12");
  assert.equal(r.size, 2);
});

check("silenceAlert: sin registro o reciente → nada; > 8 días → aviso con la fecha", () => {
  const reg = "- 2026-10-01 · Cocina · 1 referencias (1 nuevas)\n";
  assert.equal(silenceAlert(undefined, "2026-10-20"), undefined);
  assert.equal(silenceAlert("# Registro\n", "2026-10-20"), undefined);
  assert.equal(silenceAlert(reg, "2026-10-09"), undefined);
  const a = silenceAlert(reg, "2026-10-10");
  assert.equal(a?.since, "2026-10-01");
  assert.ok(a?.text.includes("2026-10-01") && a.text.includes("9 días"));
});

check("pendingSummaries: solo AAAA-MM-DD.md no notificados, en orden", () => {
  assert.deepEqual(
    pendingSummaries(["2026-10-12.md", "notas.md", "2026-10-05.md", "2026-10-19.md"], new Set(["2026-10-05.md"])),
    ["2026-10-12.md", "2026-10-19.md"],
  );
});

check("summaryText: quita frontmatter; vacío → undefined", () => {
  assert.equal(summaryText("---\nfecha: 2026-10-12\n---\n\n🔎 Tres novedades\n"), "🔎 Tres novedades");
  assert.equal(summaryText("---\na: 1\n---\n  \n"), undefined);
});

check("parseReferencia: frontmatter en bloque (Obsidian) y fecha sin comillas", () => {
  const raw = "---\ntipo: software\nnombre: n8n\ntemas:\n  - '[[Automatización con IA]]'\nrevisado: 2026-10-12\nfuentes:\n  - https://n8n.io\n---\n## Qué es\nX [1]\n";
  const r = parseReferencia("/kb/referencias/n8n.md", raw);
  assert.equal(r.baseName, "n8n");
  assert.equal(r.title, "n8n");
  assert.equal(r.tipo, "software");
  assert.equal(r.reviewed, "2026-10-12");
  assert.deepEqual(r.topics, ["Automatización con IA"]);
  assert.ok(r.body.startsWith("## Qué es"));
});

checkAsync("listReferencias / listResearchBlocks / takeNewSummaries sobre una base temporal", async () => {
  const dir = mkdtempSync(joinPath(tmpdir(), "kb-research-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    mkdirSync(joinPath(dir, "referencias"), { recursive: true });
    mkdirSync(joinPath(dir, "temas"), { recursive: true });
    mkdirSync(joinPath(dir, "_investigacion", "resumenes"), { recursive: true });
    writeFileSync(joinPath(dir, "referencias", "n8n.md"), "---\ntipo: software\nnombre: n8n\nrevisado: 2026-10-12\nfuentes: [https://n8n.io]\n---\n## Qué es\nX [1]\n");
    writeFileSync(joinPath(dir, "temas", "Cocina.md"), `---\ntags: [kb/tema]\n---\n<!-- kb:auto:start -->\n# Cocina\n<!-- kb:auto:end -->\n\n${BLOCK}\n`);
    writeFileSync(joinPath(dir, "temas", "Viajes.md"), "---\ntags: [kb/tema]\n---\nsin bloque\n");
    assert.deepEqual((await listReferencias()).map((r) => r.baseName), ["n8n"]);
    const blocks = await listResearchBlocks();
    assert.deepEqual(blocks.map((b) => [b.topic, b.reviewed]), [["Cocina", "2026-10-12"]]);

    // Índice nuevo con un resumen viejo: se marca sin reenviarlo.
    writeFileSync(joinPath(dir, "_investigacion", "resumenes", "2026-10-05.md"), "viejo");
    assert.deepEqual(await takeNewSummaries(), []);
    writeFileSync(joinPath(dir, "_investigacion", "resumenes", "2026-10-12.md"), "nuevo");
    assert.deepEqual(await takeNewSummaries(), [{ name: "2026-10-12.md", text: "nuevo" }]);
    assert.deepEqual(await takeNewSummaries(), []);
  } finally {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Correr las pruebas y ver que fallan**

Run: `npx tsx test/kb.ts`
Expected: FAIL al importar (`Cannot find module '../src/kb/research.ts'`).

- [ ] **Step 3: Implementar `src/kb/research.ts`**

```ts
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { openDb } from "./db.ts";
import { asDate, unwikilink } from "./markdown.ts";
import { kbDir, temasDir } from "./store.ts";

/**
 * Investigación semanal: un agente de Claude en la nube investiga los temas de la
 * base y escribe notas en referencias/, un bloque kb:research en cada tema y un
 * resumen en _investigacion/resumenes/. El bot solo LEE estas zonas: las indexa
 * para las consultas, reenvía los resúmenes y avisa si la investigación deja de correr.
 */

export const RESEARCH_START = "<!-- kb:research:start -->";
export const RESEARCH_END = "<!-- kb:research:end -->";

export const referenciasDir = (): string => join(kbDir(), "referencias");
export const investigacionDir = (): string => join(kbDir(), "_investigacion");
export const resumenesDir = (): string => join(investigacionDir(), "resumenes");
export const registroPath = (): string => join(investigacionDir(), "registro.md");

/** Días sin investigación antes de avisar. */
export const SILENCE_DAYS = 8;

/** Contenido del bloque kb:research de un tema, o undefined si no hay (o está vacío). Función pura. */
export function researchBlock(body: string): string | undefined {
  const start = body.indexOf(RESEARCH_START);
  const end = body.indexOf(RESEARCH_END);
  if (start === -1 || end <= start) return undefined;
  return body.slice(start + RESEARCH_START.length, end).trim() || undefined;
}

/** Fecha "_Revisado AAAA-MM-DD_" de un bloque de investigación. Función pura. */
export function reviewedDate(block: string): string | undefined {
  return block.match(/_Revisado (\d{4}-\d{2}-\d{2})_/)?.[1];
}

const REGISTRO_LINE = /^-\s+(\d{4}-\d{2}-\d{2})\s+·\s+(.+?)\s+·/;

/** Registro de corridas → última fecha de investigación por tema. Función pura. */
export function parseRegistro(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = line.match(REGISTRO_LINE);
    if (m && (out.get(m[2]) ?? "") < m[1]) out.set(m[2], m[1]);
  }
  return out;
}

/** Aviso si la investigación no corre hace más de SILENCE_DAYS. Sin registro (o vacío): nada. Función pura. */
export function silenceAlert(registroText: string | undefined, today: string): { since: string; text: string } | undefined {
  if (registroText === undefined) return undefined;
  const since = [...parseRegistro(registroText).values()].sort().pop();
  if (!since) return undefined;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000);
  if (days <= SILENCE_DAYS) return undefined;
  return {
    since,
    text: `⚠️ La investigación semanal no corre desde el ${since} (${days} días). Revisa la tarea programada en claude.ai.`,
  };
}

/** Resúmenes (AAAA-MM-DD.md) que todavía no se reenviaron, en orden. Función pura. */
export function pendingSummaries(files: string[], notified: Set<string>): string[] {
  return files.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && !notified.has(f)).sort();
}

/** Texto de un resumen sin frontmatter; vacío → undefined. Función pura. */
export function summaryText(raw: string): string | undefined {
  return matter(raw).content.trim() || undefined;
}

export interface ReferenceNote {
  path: string;
  baseName: string;
  title: string;
  tipo?: string;
  reviewed?: string;
  topics: string[];
  raw: string;
  body: string;
}

/** Lee una nota de referencia (escrita por el agente o editada en Obsidian). Función pura. */
export function parseReferencia(path: string, raw: string): ReferenceNote {
  const { data, content } = matter(raw);
  const baseName = basename(path, ".md");
  return {
    path,
    baseName,
    title: typeof data.nombre === "string" && data.nombre.trim() ? data.nombre.trim() : baseName,
    tipo: typeof data.tipo === "string" ? data.tipo : undefined,
    reviewed: asDate(data.revisado),
    topics: Array.isArray(data.temas) ? data.temas.map(unwikilink).filter((t): t is string => !!t) : [],
    raw,
    body: content.trim(),
  };
}

async function mdFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
}

export async function listReferencias(): Promise<ReferenceNote[]> {
  const out: ReferenceNote[] = [];
  for (const f of await mdFiles(referenciasDir())) {
    const path = join(referenciasDir(), f);
    out.push(parseReferencia(path, await readFile(path, "utf8")));
  }
  return out;
}

export interface ResearchBlock {
  topic: string;
  path: string;
  reviewed?: string;
  block: string;
}

/** Bloques kb:research de los temas que tienen uno. */
export async function listResearchBlocks(): Promise<ResearchBlock[]> {
  const out: ResearchBlock[] = [];
  for (const f of await mdFiles(temasDir())) {
    const path = join(temasDir(), f);
    const block = researchBlock(matter(await readFile(path, "utf8")).content);
    if (block) out.push({ topic: basename(f, ".md"), path, reviewed: reviewedDate(block), block });
  }
  return out;
}

function notifiedDb(): ReturnType<typeof openDb> {
  const db = openDb();
  db.exec("CREATE TABLE IF NOT EXISTS research_notified (name TEXT PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')))");
  return db;
}

/**
 * Resúmenes nuevos para reenviar por Telegram; quedan marcados. Con la tabla vacía
 * (índice nuevo o recién borrado) se marcan todos sin devolverlos: no se reenvía el historial.
 */
export async function takeNewSummaries(): Promise<{ name: string; text: string }[]> {
  const db = notifiedDb();
  const files = await mdFiles(resumenesDir());
  const notified = new Set((db.prepare("SELECT name FROM research_notified").all() as { name: string }[]).map((r) => r.name));
  const firstTime = notified.size === 0;
  const mark = db.prepare("INSERT OR IGNORE INTO research_notified (name) VALUES (?)");
  const out: { name: string; text: string }[] = [];
  for (const name of pendingSummaries(files, notified)) {
    mark.run(name);
    if (firstTime) continue;
    const text = summaryText(await readFile(join(resumenesDir(), name), "utf8"));
    if (text) out.push({ name, text });
    else console.warn(`⚠️  Resumen de investigación vacío: ${name}`);
  }
  // Base sin resúmenes todavía: se deja una marca para que el primero real sí se reenvíe.
  if (firstTime && !files.length) mark.run("(inicio)");
  return out;
}
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Run: `npx tsx test/kb.ts && npm run typecheck`
Expected: todas `✓`, `0 fallos`, typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/kb/research.ts test/kb.ts
git commit -m "kb: módulo de investigación (referencias, bloque kb:research, registro, resúmenes)"
```

---

### Task 2: Indexar referencias y bloques de investigación

**Files:**
- Modify: `src/kb/indexer.ts` (reemplaza `indexFicha` y `reindex`, líneas ~97–158)
- Modify: `src/kb/search.ts` (`Hit`, consulta final de `search`)
- Test: `test/kb.ts`

**Interfaces:**
- Consumes: `ReferenceNote`, `ResearchBlock`, `listReferencias`, `listResearchBlocks` (Task 1); `StoredFicha`, `listFichas` (store).
- Produces:
  - `interface IndexDoc { id: string; path: string; baseName: string; title: string; author?: string; url?: string; topic?: string; savedAt?: string; publishedAt?: string; kind?: string; raw: string; body: string }`
  - `fichaDoc(f: StoredFicha): IndexDoc | undefined`
  - `referenciaDoc(r: ReferenceNote): IndexDoc` (id `ref:<baseName>`, kind `"referencia"`)
  - `researchDoc(b: ResearchBlock): IndexDoc` (id `tema:<topic>`, kind `"investigacion"`)
  - `indexDoc(d: IndexDoc, force?: boolean): Promise<boolean>`
  - `indexFicha(f, force)` se conserva como envoltorio.
  - `Hit.kind?: string`

- [ ] **Step 1: Escribir las pruebas que fallan**

Import en `test/kb.ts`: cambiar la línea `import { chunkFicha, splitText } from "../src/kb/indexer.ts";` por

```ts
import { chunkFicha, fichaDoc, referenciaDoc, researchDoc, splitText } from "../src/kb/indexer.ts";
```

Agregar:

```ts
check("documentos del índice: referencia y bloque de investigación", () => {
  const ref = parseReferencia(
    "/kb/referencias/n8n.md",
    "---\ntipo: software\nnombre: n8n\ntemas: ['[[Automatización con IA]]']\nrevisado: 2026-10-12\nfuentes: [https://n8n.io]\n---\n## Qué es\nFlujos [1]\n\n## Mis notas\nlo uso\n",
  );
  const d = referenciaDoc(ref);
  assert.equal(d.id, "ref:n8n");
  assert.equal(d.kind, "referencia");
  assert.equal(d.savedAt, "2026-10-12");
  assert.equal(d.topic, "Automatización con IA");
  assert.deepEqual(chunkFicha(d.body).map((c) => c.section), ["Qué es", "Mis notas"]);

  const r = researchDoc({ topic: "Cocina", path: "/kb/temas/Cocina.md", reviewed: "2026-10-12", block: researchBlock(BLOCK)! });
  assert.equal(r.id, "tema:Cocina");
  assert.equal(r.kind, "investigacion");
  assert.equal(r.title, "Investigación: Cocina");
  assert.deepEqual(chunkFicha(r.body).map((c) => c.section), ["Investigación"]);
});

check("fichaDoc: sin id no se indexa; con id conserva tipo y publicado", () => {
  const base = { path: "/kb/fuentes/a.md", baseName: "a", title: "A", secondary: [], notes: [], body: "x" };
  assert.equal(fichaDoc({ ...base, raw: "---\n---\nx" }), undefined);
  const d = fichaDoc({ ...base, id: "ig:1", raw: "---\nid: ig:1\ntipo: reel\npublicado: '2026-09-01'\n---\nx" });
  assert.equal(d?.kind, "reel");
  assert.equal(d?.publishedAt, "2026-09-01");
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx tsx test/kb.ts`
Expected: FAIL (`fichaDoc` / `referenciaDoc` / `researchDoc` no exportados).

- [ ] **Step 3: Implementar en `src/kb/indexer.ts`**

Agregar el import:

```ts
import { listReferencias, listResearchBlocks, type ReferenceNote, type ResearchBlock } from "./research.ts";
```

Actualizar el comentario del módulo (primeras líneas) a:

```ts
/**
 * Indexación: cada documento (ficha, nota de referencia o bloque de investigación
 * de un tema) se parte en trozos por sección, que van a FTS5 (búsqueda por
 * palabras) y a embeddings (búsqueda por significado).
 */
```

Reemplazar `indexFicha` completo por:

```ts
/** Documento indexable: una ficha, una nota de referencia o el bloque de investigación de un tema. */
export interface IndexDoc {
  id: string;
  path: string;
  baseName: string;
  title: string;
  author?: string;
  url?: string;
  topic?: string;
  savedAt?: string;
  publishedAt?: string;
  /** Tipo de ficha (reel, post…), o "referencia" / "investigacion". */
  kind?: string;
  raw: string;
  body: string;
}

export function fichaDoc(f: StoredFicha): IndexDoc | undefined {
  if (!f.id) return undefined;
  const { data } = matter(f.raw);
  return {
    id: f.id, path: f.path, baseName: f.baseName, title: f.title, author: f.author,
    url: typeof data.url === "string" ? data.url : undefined, topic: f.topic, savedAt: f.savedAt,
    publishedAt: typeof data.publicado === "string" ? data.publicado : undefined,
    kind: typeof data.tipo === "string" ? data.tipo : undefined, raw: f.raw, body: f.body,
  };
}

export const referenciaDoc = (r: ReferenceNote): IndexDoc => ({
  id: `ref:${r.baseName}`, path: r.path, baseName: r.baseName, title: r.title, topic: r.topics[0],
  savedAt: r.reviewed, kind: "referencia", raw: r.raw, body: r.body,
});

export const researchDoc = (b: ResearchBlock): IndexDoc => ({
  id: `tema:${b.topic}`, path: b.path, baseName: b.topic, title: `Investigación: ${b.topic}`, topic: b.topic,
  savedAt: b.reviewed, kind: "investigacion", raw: b.block, body: b.block,
});

/** Indexa (o reindexa) un documento. Si no cambió desde la última vez, no hace nada. */
export async function indexDoc(d: IndexDoc, force = false): Promise<boolean> {
  const db = openDb();
  const hash = hashOf(d.raw);
  const prev = db.prepare("SELECT hash FROM posts WHERE id = ?").get(d.id) as { hash: string } | undefined;
  if (!force && prev?.hash === hash) return false;

  const chunks = chunkFicha(d.body);
  const vectors = await embedTexts(chunks.map((c) => contextual(d.title, c)));

  db.exec("BEGIN");
  try {
    removePost(d.id);
    db.prepare(
      `INSERT INTO posts (id, path, base_name, title, author, url, topic, saved_at, published_at, kind, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      d.id, d.path, d.baseName, d.title, d.author ?? null, d.url ?? null, d.topic ?? null, d.savedAt ?? null,
      d.publishedAt ?? null, d.kind ?? null, hash,
    );
    const insChunk = db.prepare("INSERT INTO chunks (post_id, section, text, embedding) VALUES (?, ?, ?, ?)");
    const insFts = db.prepare("INSERT INTO chunks_fts (rowid, text) VALUES (?, ?)");
    chunks.forEach((c, i) => {
      const { lastInsertRowid } = insChunk.run(d.id, c.section, c.text, toBlob(vectors[i]));
      insFts.run(lastInsertRowid, contextual(d.title, c));
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return true;
}

/** Indexa una ficha (atajo de indexDoc). */
export async function indexFicha(f: StoredFicha, force = false): Promise<boolean> {
  const d = fichaDoc(f);
  return d ? indexDoc(d, force) : false;
}
```

Reemplazar `reindex` por:

```ts
/**
 * Sincroniza el índice con el Markdown: indexa fichas, referencias y bloques de
 * investigación nuevos o cambiados y quita lo que ya no existe. Con `full`,
 * reindexa todo (los embeddings salen de caché).
 */
export async function reindex(full = false): Promise<{ indexed: number; removed: number; total: number }> {
  const db = openDb();
  const docs = [
    ...(await listFichas()).map(fichaDoc).filter((d): d is IndexDoc => !!d),
    ...(await listReferencias()).map(referenciaDoc),
    ...(await listResearchBlocks()).map(researchDoc),
  ];
  let indexed = 0;
  for (const d of docs) if (await indexDoc(d, full)) indexed++;
  const alive = new Set(docs.map((d) => d.id));
  const stale = (db.prepare("SELECT id FROM posts").all() as { id: string }[]).filter((r) => !alive.has(r.id));
  for (const r of stale) removePost(r.id);
  return { indexed, removed: stale.length, total: docs.length };
}
```

Nota: `chunkFicha` ya sirve para referencias y bloques: sin marcadores `kb:auto` toma todo el cuerpo como zona automática y cada `## …` es una sección (incluida `## Mis notas`).

En `src/kb/search.ts`:
- En `interface Hit` agregar después de `savedAt?: string;`:

```ts
  /** Tipo de documento: el de la ficha (reel, post…) o "referencia" / "investigacion". */
  kind?: string;
```

- En `search`, cambiar la consulta y el mapeo final:

```ts
  const post = db.prepare("SELECT title, author, url, path, base_name, topic, saved_at, kind FROM posts WHERE id = ?");
  return fused.flatMap(([id, score]) => {
    const r = byId.get(id);
    if (!r) return [];
    const p = post.get(r.post_id) as {
      title: string; author: string | null; url: string | null; path: string; base_name: string; topic: string | null;
      saved_at: string | null; kind: string | null;
    };
    return [{
      chunkId: id, postId: r.post_id, section: r.section, text: r.text, score,
      title: p.title, author: p.author ?? undefined, url: p.url ?? undefined, path: p.path, baseName: p.base_name,
      topic: p.topic ?? undefined, savedAt: p.saved_at ?? undefined, kind: p.kind ?? undefined,
    }];
  });
```

- Actualizar el comentario del módulo de `search.ts`: "…sobre la fecha en que se guardó el post (o se revisó la investigación)."

- [ ] **Step 4: Correr pruebas y typecheck**

Run: `npx tsx test/kb.ts && npm run typecheck`
Expected: `0 fallos`, typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add src/kb/indexer.ts src/kb/search.ts test/kb.ts
git commit -m "kb: el índice incluye referencias y bloques de investigación"
```

---

### Task 3: Las respuestas distinguen lo investigado

**Files:**
- Modify: `src/kb/ask.ts` (`Source`, `groupSources`, `ASK_SYSTEM`, armado del contexto)
- Modify: `src/kb/telegram.ts` (`formatAnswer`, `formatAnswerText`)
- Test: `test/kb.ts`

**Interfaces:**
- Consumes: `Hit.kind` (Task 2).
- Produces:
  - `Source.kind?: string`
  - `isResearch(s: { kind?: string }): boolean`
  - `sourceHead(s: Source): string`

- [ ] **Step 1: Escribir las pruebas que fallan**

Cambiar el import de `ask.ts` en `test/kb.ts` a:

```ts
import { citedNumbers, groupSources, isResearch, sourceHead } from "../src/kb/ask.ts";
```

Agregar:

```ts
check("ask: fuentes de investigación rotuladas en el contexto", () => {
  const hit = (over: Partial<Hit>): Hit => ({
    chunkId: 1, postId: "p", section: "s", text: "t", score: 1, title: "T", path: "x", baseName: "b", ...over,
  });
  const groups = groupSources([
    hit({ baseName: "n8n", title: "n8n", kind: "referencia", savedAt: "2026-10-12", topic: "Automatización con IA" }),
    hit({ chunkId: 2, baseName: "f1", title: "Post", author: "@a", savedAt: "2026-09-01", kind: "reel" }),
  ]);
  assert.equal(groups[0].source.kind, "referencia");
  assert.ok(isResearch(groups[0].source));
  assert.ok(!isResearch(groups[1].source));
  assert.equal(sourceHead(groups[0].source), "[1] INVESTIGACIÓN — n8n · revisada 2026-10-12 · tema: Automatización con IA");
  assert.equal(sourceHead(groups[1].source), "[2] Post — @a · guardado 2026-09-01");
});

check("formatAnswer / formatAnswerText: fuentes investigadas con 🔎", () => {
  const a = {
    answer: "Tiene plan gratis [1] y lo guardaste [2].",
    sources: [
      { n: 1, title: "n8n", savedAt: "2026-10-12", baseName: "n8n", kind: "referencia" },
      { n: 2, title: "Post", author: "@a", savedAt: "2026-09-01", url: "https://www.instagram.com/p/X/", baseName: "f1" },
    ],
    found: true,
  };
  const html = formatAnswer(a);
  assert.ok(html.includes("[1] 🔎 n8n — investigado 2026-10-12"));
  assert.ok(html.includes('[2] <a href="https://www.instagram.com/p/X/">Post</a> — @a · 2026-09-01'));
  const text = formatAnswerText(a);
  assert.ok(text.includes("[1] 🔎 n8n — investigado 2026-10-12"));
  assert.ok(text.includes("[2] Post — https://www.instagram.com/p/X/"));
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx tsx test/kb.ts`
Expected: FAIL (`isResearch` / `sourceHead` no exportados).

- [ ] **Step 3: Implementar en `src/kb/ask.ts`**

Comentario del módulo:

```ts
/**
 * Responder preguntas SOLO con la base: búsqueda híbrida → el modelo redacta con
 * citas [n] a las fuentes (fichas guardadas y notas de investigación). Si la base
 * no alcanza, lo dice (no inventa).
 */
```

En `interface Source` agregar al final:

```ts
  /** Tipo de documento (ver Hit.kind). */
  kind?: string;
```

En `groupSources`, el objeto `source` pasa a:

```ts
        source: {
          n: groups.length + 1, title: h.title, author: h.author, savedAt: h.savedAt, url: h.url, baseName: h.baseName,
          topic: h.topic, kind: h.kind,
        },
```

Agregar después de `citedNumbers`:

```ts
/** ¿La fuente es una nota de investigación (no un post guardado)? */
export const isResearch = (s: { kind?: string }): boolean => s.kind === "referencia" || s.kind === "investigacion";

/** Encabezado de una fuente en el contexto del modelo. Función pura. */
export function sourceHead(s: Source): string {
  if (isResearch(s)) {
    return `[${s.n}] INVESTIGACIÓN — ${s.title}${s.savedAt ? ` · revisada ${s.savedAt}` : ""}${s.topic ? ` · tema: ${s.topic}` : ""}`;
  }
  return `[${s.n}] ${s.title}${s.author ? ` — ${s.author}` : ""}${s.savedAt ? ` · guardado ${s.savedAt}` : ""}${s.topic ? ` · tema: ${s.topic}` : ""}`;
}
```

Reemplazar `ASK_SYSTEM` por:

```ts
const ASK_SYSTEM = `
Respondes preguntas del usuario sobre SU base de conocimiento personal: posts de Instagram que guardó y resumió, y notas de investigación que un agente preparó a partir de esos posts.
Reglas:
- Usa SOLO la información de las fuentes numeradas. No agregues conocimiento propio.
- Cada trozo indica su sección entre paréntesis: "Texto de las imágenes" es lo que decían las slides o cuadros, "Transcripción" es el audio, "Mis notas" son notas del propio usuario.
- Las fuentes marcadas INVESTIGACIÓN no son posts guardados: son notas investigadas en la web, con su fecha de revisión. Si usas una, dilo ("según la investigación del 12-oct…").
- Cita cada afirmación con el número de su fuente entre corchetes, ej. [1] o [2, 3].
- Si las fuentes no responden la pregunta, dilo claramente ("No encontré eso en tu base") y, si hay algo cercano, menciónalo con su cita.
- Responde en español, directo y concreto: primero la respuesta, después el detalle útil (herramientas, pasos, datos). Sin relleno.
`.trim();
```

En `ask`, reemplazar la línea `const head = …` por:

```ts
      const head = sourceHead(s);
```

En `src/kb/telegram.ts`:
- Cambiar `import type { Answer } from "./ask.ts";` por:

```ts
import { isResearch, type Answer } from "./ask.ts";
```

- En `formatAnswer`, el `map` de fuentes pasa a:

```ts
    const src = a.sources.map((s) => {
      if (isResearch(s)) return `[${s.n}] 🔎 ${escapeHtml(s.title)}${s.savedAt ? ` — investigado ${escapeHtml(s.savedAt)}` : ""}`;
      const title = escapeHtml(s.title);
      const linked = s.url ? `<a href="${escapeHtml(s.url)}">${title}</a>` : title;
      const meta = [s.author, s.savedAt].filter(Boolean).map((x) => escapeHtml(x!)).join(" · ");
      return `[${s.n}] ${linked}${meta ? ` — ${meta}` : ""}`;
    });
```

- En `formatAnswerText`:

```ts
  const src = a.sources.map((s) =>
    isResearch(s)
      ? `[${s.n}] 🔎 ${s.title}${s.savedAt ? ` — investigado ${s.savedAt}` : ""}`
      : `[${s.n}] ${s.title}${s.url ? ` — ${s.url}` : ""}`,
  );
```

(Importar un valor desde `ask.ts` en `telegram.ts` no crea ciclo: `ask.ts` no importa `telegram.ts`.)

- [ ] **Step 4: Correr pruebas y typecheck**

Run: `npx tsx test/kb.ts && npm run typecheck`
Expected: `0 fallos`, typecheck limpio (la prueba existente de `formatAnswer` sigue pasando).

- [ ] **Step 5: Commit**

```bash
git add src/kb/ask.ts src/kb/telegram.ts test/kb.ts
git commit -m "kb: las respuestas citan la investigación como tal"
```

---

### Task 4: Pull horario, reenvío de resúmenes y alerta de silencio

**Files:**
- Modify: `src/kb/store.ts` (agregar `pullKb` en la sección `// --- git ---`)
- Modify: `src/kb/bot.ts` (imports, funciones nuevas, arranque)
- Test: `test/kb.ts`

**Interfaces:**
- Consumes: `takeNewSummaries`, `silenceAlert`, `registroPath` (Task 1); `reindex` (Task 2); `serial`, `notifyAdmin`, `errText` (existentes en `bot.ts`).
- Produces: `pullKb(): Promise<{ changed: boolean; error?: string }>`

- [ ] **Step 1: Escribir la prueba que falla**

Import en `test/kb.ts`:

```ts
import { pullKb } from "../src/kb/store.ts";
import { execFileSync } from "node:child_process";
```

Agregar:

```ts
checkAsync("pullKb: trae cambios del remoto; sin cambios → changed false; conflicto → error y base intacta", async () => {
  const root = mkdtempSync(joinPath(tmpdir(), "kb-pull-"));
  const g = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" }).toString();
  const prev = process.env.KB_DIR;
  try {
    g(root, "init", "-q", "--bare", "-b", "main", "remote.git");
    g(root, "clone", "-q", "remote.git", "bot");
    g(root, "clone", "-q", "remote.git", "agente");
    const bot = joinPath(root, "bot");
    const agente = joinPath(root, "agente");
    writeFileSync(joinPath(agente, "a.md"), "uno\n");
    g(agente, "add", ".");
    g(agente, "commit", "-q", "-m", "1");
    g(agente, "push", "-q", "origin", "main");
    g(bot, "pull", "-q", "origin", "main");
    g(bot, "branch", "-q", "--set-upstream-to=origin/main", "main");
    process.env.KB_DIR = bot;

    assert.deepEqual(await pullKb(), { changed: false });

    writeFileSync(joinPath(agente, "b.md"), "dos\n");
    g(agente, "add", ".");
    g(agente, "commit", "-q", "-m", "2");
    g(agente, "push", "-q", "origin", "main");
    assert.deepEqual(await pullKb(), { changed: true });

    // Conflicto: ambos editan a.md.
    writeFileSync(joinPath(agente, "a.md"), "agente\n");
    g(agente, "commit", "-q", "-am", "3");
    g(agente, "push", "-q", "origin", "main");
    writeFileSync(joinPath(bot, "a.md"), "bot\n");
    g(bot, "commit", "-q", "-am", "local");
    const head = g(bot, "rev-parse", "HEAD");
    const r = await pullKb();
    assert.equal(r.changed, false);
    assert.ok(r.error);
    assert.equal(g(bot, "rev-parse", "HEAD"), head);
    assert.equal(g(bot, "status", "--porcelain"), "");
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx tsx test/kb.ts`
Expected: FAIL (`pullKb` no exportado).

- [ ] **Step 3: Implementar `pullKb` en `src/kb/store.ts`**

Después de `pushWithRebase`:

```ts
/**
 * Trae lo que otros subieron a la base (la investigación semanal, ediciones en
 * Obsidian). Si el rebase choca, lo aborta y la base local queda como estaba.
 */
export async function pullKb(): Promise<{ changed: boolean; error?: string }> {
  if (process.env.KB_GIT === "0") return { changed: false };
  const top = await git(["rev-parse", "--show-toplevel"], kbDir());
  if (top.code !== 0) return { changed: false };
  const root = top.out.trim();
  const before = (await git(["rev-parse", "HEAD"], root)).out.trim();
  const pull = await git(["-c", "user.name=kb", "-c", "user.email=kb@local", "pull", "--rebase", "--autostash"], root);
  if (pull.code !== 0) {
    await git(["rebase", "--abort"], root);
    return { changed: false, error: pull.out.trim().split("\n").pop() || "git pull falló" };
  }
  const after = (await git(["rev-parse", "HEAD"], root)).out.trim();
  return { changed: before !== after };
}
```

(Los `-c user.*` solo evitan que el rebase falle en repos sin identidad configurada; en el servidor la identidad ya la pone `docker-entrypoint.sh`.)

- [ ] **Step 4: Correr la prueba**

Run: `npx tsx test/kb.ts`
Expected: `0 fallos`.

- [ ] **Step 5: Conectar en `src/kb/bot.ts`**

Imports: agregar `pullKb` y `readIfExists` al import existente de `./store.ts` (si `readIfExists` ya está, solo `pullKb`) y:

```ts
import { registroPath, silenceAlert, takeNewSummaries } from "./research.ts";
```

Antes de `// --- arranque ---`, agregar:

```ts
// --- investigación semanal (la escribe un agente en la nube; el bot la trae y la usa) ---

/** Cada cuánto se traen cambios de la base desde GitHub. */
const SYNC_INTERVAL_MS = 3_600_000;
/** Primer pull tras arrancar (el entrypoint ya hizo uno). */
const SYNC_FIRST_DELAY_MS = 5 * 60_000;

let lastSyncError: string | undefined;

/** git pull + reindex (en la cadena serial: nunca a mitad de un guardado) + reenvío de resúmenes. */
async function syncFromRemote(): Promise<void> {
  try {
    await serial(async () => {
      const r = await pullKb();
      if (r.error) {
        if (r.error !== lastSyncError) await notifyAdmin(`⚠️ No pude traer cambios de la base desde GitHub: ${r.error}`);
        lastSyncError = r.error;
        return;
      }
      lastSyncError = undefined;
      if (r.changed) {
        const s = await reindex();
        console.log(`↓ Base actualizada desde GitHub: ${s.indexed} documento(s) reindexado(s), ${s.removed} quitado(s).`);
      }
    });
    for (const s of await takeNewSummaries()) await notifyAdmin(`🔎 Investigación semanal\n\n${s.text}`);
  } catch (err) {
    console.warn(`⚠️  Sincronización con GitHub: ${errText(err)}`);
  }
}

let silenceWarnedFor: string | undefined;

/** Avisa una vez si la investigación semanal dejó de correr. */
async function checkResearch(): Promise<void> {
  const alert = silenceAlert(await readIfExists(registroPath()), new Date().toISOString().slice(0, 10));
  if (!alert || alert.since === silenceWarnedFor) return;
  silenceWarnedFor = alert.since;
  await notifyAdmin(alert.text);
}
```

En `// --- arranque ---`, después de `setInterval(() => void checkMetaToken(), 24 * 3_600_000);`:

```ts
if (process.env.KB_GIT_PUSH === "1") {
  // Solo en el servidor: ahí la base es un clon de ia-es-kb que también escribe el agente de investigación.
  void takeNewSummaries().catch(() => {}); // índice nuevo: marca los resúmenes existentes sin reenviarlos
  setTimeout(() => void syncFromRemote(), SYNC_FIRST_DELAY_MS);
  setInterval(() => void syncFromRemote(), SYNC_INTERVAL_MS);
}
void checkResearch();
setInterval(() => void checkResearch(), 24 * 3_600_000);
```

- [ ] **Step 6: Typecheck y pruebas**

Run: `npm run typecheck && npm test`
Expected: limpio; `0 fallos` en ambos archivos de pruebas.

- [ ] **Step 7: Commit**

```bash
git add src/kb/store.ts src/kb/bot.ts test/kb.ts
git commit -m "kb: el bot trae la base cada hora, reenvía el resumen semanal y avisa si la investigación no corre"
```

---

### Task 5: Validador `validar.mjs`

**Files:**
- Create: `kb-plantilla/_investigacion/validar.mjs`
- Create: `kb-plantilla/_investigacion/validar.d.mts`
- Test: `test/kb.ts`

**Interfaces:**
- Produces (exports de `validar.mjs`):
  - `parseFrontmatter(text: string): { data: Record<string, string | string[]>; body: string } | { error: string }`
  - `validateReferencia(text: string): string[]`
  - `validateTopicBlock(text: string): string[]`
  - `validateResumen(text: string): string[]`
  - `outsideAgentZones(paths: string[]): string[]`
  - `autoZoneOf(text: string): string | undefined`
  - CLI: `node _investigacion/validar.mjs [--desde <sha>]` → código 0 si todo es válido; 1 y lista de errores si no.

- [ ] **Step 1: Escribir las pruebas que fallan**

Import en `test/kb.ts`:

```ts
import {
  autoZoneOf, outsideAgentZones, parseFrontmatter, validateReferencia, validateResumen, validateTopicBlock,
} from "../kb-plantilla/_investigacion/validar.mjs";
```

Agregar:

```ts
// --- validador del agente de investigación ---
const REF_OK =
  "---\ntipo: software\nnombre: n8n\ntemas: [\"[[Automatización con IA]]\"]\nrevisado: 2026-10-12\nfuentes:\n  - https://n8n.io/pricing\n  - https://docs.n8n.io\ntags: [kb/referencia]\n---\n\n## Qué es\nAutomatiza flujos [1].\n\n## Datos clave\n- Tiene API REST [2].\n\n## Mis notas\n";

check("validar: referencia válida (listas en bloque e inline)", () => {
  assert.deepEqual(validateReferencia(REF_OK), []);
  const fm = parseFrontmatter(REF_OK);
  assert.ok(!("error" in fm));
  if (!("error" in fm)) {
    assert.deepEqual(fm.data.fuentes, ["https://n8n.io/pricing", "https://docs.n8n.io"]);
    assert.deepEqual(fm.data.temas, ["[[Automatización con IA]]"]);
  }
});

check("validar: referencias inválidas", () => {
  const errs = (t: string) => validateReferencia(t).join(" | ");
  assert.match(errs("sin frontmatter"), /frontmatter/);
  assert.match(errs(REF_OK.replace("tipo: software", "tipo: app")), /tipo inválido/);
  assert.match(errs(REF_OK.replace("revisado: 2026-10-12", "revisado: 2026-13-40")), /revisado inválido/);
  assert.match(errs(REF_OK.replace(/fuentes:\n {2}- \S+\n {2}- \S+\n/, "fuentes: []\n")), /fuentes/);
  assert.match(errs(REF_OK.replace("https://docs.n8n.io", "docs.n8n.io")), /no es una URL/);
  assert.match(errs(REF_OK.replace("[2]", "[3]")), /\[3\] no tiene fuente/);
  assert.match(errs(REF_OK.replace("## Datos clave", "## Datos")), /Datos clave/);
  assert.match(errs(REF_OK.replace(/\s\[\d\]/g, "")), /ninguna afirmación/);
  // [[wikilinks]] y links markdown no cuentan como citas.
  assert.deepEqual(validateReferencia(REF_OK.replace("flujos [1].", "flujos [1]. Ver [[Make]] y [doc](https://x.y).")), []);
});

check("validar: bloque kb:research del tema", () => {
  const ok = `<!-- kb:auto:start -->\n# T\n<!-- kb:auto:end -->\n\n<!-- kb:research:start -->\n## Investigación\n_Revisado 2026-10-12_\n\nx\n<!-- kb:research:end -->\n`;
  assert.deepEqual(validateTopicBlock(ok), []);
  assert.deepEqual(validateTopicBlock("tema sin bloque"), []);
  assert.match(validateTopicBlock(ok.replace("<!-- kb:research:end -->", "")).join(), /cerrado/);
  assert.match(validateTopicBlock(ok.replace("## Investigación", "## Otra")).join(), /## Investigación/);
  assert.match(validateTopicBlock(ok.replace("_Revisado 2026-10-12_", "")).join(), /_Revisado/);
});

check("validar: resumen", () => {
  assert.deepEqual(validateResumen("🔎 Tres novedades"), []);
  assert.match(validateResumen("  ").join(), /vacío/);
  assert.match(validateResumen("x".repeat(1001)).join(), /1000/);
});

check("validar: zonas del agente", () => {
  assert.deepEqual(
    outsideAgentZones(["referencias/n8n.md", "_investigacion/registro.md", "CLAUDE.md", "temas/T.md", "fuentes/x.md", "_adjuntos/a.png"]),
    ["fuentes/x.md", "_adjuntos/a.png"],
  );
  assert.equal(autoZoneOf("a<!-- kb:auto:start -->\nZ\n<!-- kb:auto:end -->b"), "Z");
  assert.equal(autoZoneOf("sin zona"), undefined);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx tsx test/kb.ts`
Expected: FAIL (no existe `kb-plantilla/_investigacion/validar.mjs`).

- [ ] **Step 3: Implementar `kb-plantilla/_investigacion/validar.mjs`**

```js
#!/usr/bin/env node
// Validador de la investigación semanal (sin dependencias: corre con node a secas).
//
//   node _investigacion/validar.mjs                 valida referencias, bloques kb:research y el último resumen
//   node _investigacion/validar.mjs --desde <sha>   además: nada cambió fuera de las zonas del agente
//
// Sale con código 1 y la lista de errores si algo no cumple. Nunca subas cambios que no pasen.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const TIPOS = new Set(["software", "producto", "libro", "metodo", "persona", "lugar", "concepto", "otro"]);
const RESEARCH_START = "<!-- kb:research:start -->";
const RESEARCH_END = "<!-- kb:research:end -->";
const AUTO_START = "<!-- kb:auto:start -->";
const AUTO_END = "<!-- kb:auto:end -->";
const MAX_RESUMEN = 1000;

const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, "$2");

function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Frontmatter YAML simple: `clave: valor`, `clave: [a, b]` y listas en bloque `  - x`. */
export function parseFrontmatter(text) {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { error: "falta el frontmatter (--- … ---) al inicio" };
  const data = {};
  let key;
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) return { error: `línea de frontmatter ilegible: "${line}"` };
    key = kv[1];
    const v = kv[2].trim();
    data[key] =
      v === "" ? [] : v.startsWith("[") && v.endsWith("]") ? v.slice(1, -1).split(",").map(unquote).filter(Boolean) : unquote(v);
  }
  return { data, body: m[2] };
}

/** Errores de una nota de referencia ([] = válida). */
export function validateReferencia(text) {
  const fm = parseFrontmatter(text);
  if ("error" in fm) return [fm.error];
  const { data, body } = fm;
  const errs = [];
  if (!TIPOS.has(data.tipo)) errs.push(`tipo inválido: "${data.tipo ?? "(falta)"}" (usa: ${[...TIPOS].join(", ")})`);
  if (typeof data.nombre !== "string" || !data.nombre) errs.push("falta nombre");
  if (!validDate(data.revisado)) errs.push(`revisado inválido: "${data.revisado ?? "(falta)"}" (AAAA-MM-DD)`);
  const fuentes = Array.isArray(data.fuentes) ? data.fuentes : typeof data.fuentes === "string" ? [data.fuentes] : [];
  if (!fuentes.length) errs.push("fuentes vacío: toda nota necesita al menos una URL");
  for (const f of fuentes) if (!/^https?:\/\/\S+$/.test(f)) errs.push(`la fuente "${f}" no es una URL http(s)`);
  for (const h of ["Qué es", "Datos clave"]) {
    if (!new RegExp(`^## ${h}\\s*$`, "m").test(body)) errs.push(`falta la sección "## ${h}"`);
  }
  // Citas [n]: ni [[wikilinks]] ni [texto](url).
  const cited = [...body.matchAll(/(?<!\[)\[(\d+)\](?![\](])/g)].map((x) => Number(x[1]));
  if (!cited.length) errs.push("ninguna afirmación cita una fuente [n]");
  for (const n of new Set(cited)) if (n < 1 || n > fuentes.length) errs.push(`la cita [${n}] no tiene fuente (hay ${fuentes.length})`);
  return errs;
}

/** Errores del bloque kb:research de un tema ([] si es válido o si el tema no tiene bloque). */
export function validateTopicBlock(text) {
  const starts = text.split(RESEARCH_START).length - 1;
  const ends = text.split(RESEARCH_END).length - 1;
  if (!starts && !ends) return [];
  const s = text.indexOf(RESEARCH_START);
  const e = text.indexOf(RESEARCH_END);
  if (starts !== 1 || ends !== 1 || e < s) return ["el bloque kb:research debe abrirse y estar cerrado exactamente una vez"];
  const inner = text.slice(s + RESEARCH_START.length, e);
  const errs = [];
  if (!/^## Investigación\s*$/m.test(inner)) errs.push('el bloque kb:research debe empezar con "## Investigación"');
  const rev = inner.match(/_Revisado (\d{4}-\d{2}-\d{2})_/);
  if (!rev || !validDate(rev[1])) errs.push('falta "_Revisado AAAA-MM-DD_" válido en el bloque kb:research');
  return errs;
}

/** Errores del resumen semanal. */
export function validateResumen(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  if (!body) return ["el resumen está vacío"];
  return body.length > MAX_RESUMEN ? [`el resumen tiene ${body.length} caracteres (máximo ${MAX_RESUMEN})`] : [];
}

/** Rutas cambiadas que el agente no puede tocar. */
export function outsideAgentZones(paths) {
  return paths.filter(
    (p) => !(p.startsWith("referencias/") || p.startsWith("_investigacion/") || p === "CLAUDE.md" || p.startsWith("temas/")),
  );
}

/** Zona automática (del bot) de un tema. */
export function autoZoneOf(text) {
  const s = text.indexOf(AUTO_START);
  const e = text.indexOf(AUTO_END);
  return s !== -1 && e > s ? text.slice(s + AUTO_START.length, e).trim() : undefined;
}

const mdIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : []);
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

function main(root, desde) {
  const errors = [];
  const add = (file, errs) => errs.forEach((e) => errors.push(`${file}: ${e}`));
  for (const f of mdIn(join(root, "referencias"))) add(`referencias/${f}`, validateReferencia(readFileSync(join(root, "referencias", f), "utf8")));
  for (const f of mdIn(join(root, "temas"))) add(`temas/${f}`, validateTopicBlock(readFileSync(join(root, "temas", f), "utf8")));
  const resumenes = mdIn(join(root, "_investigacion", "resumenes"));
  const last = resumenes[resumenes.length - 1];
  if (last) add(`_investigacion/resumenes/${last}`, validateResumen(readFileSync(join(root, "_investigacion", "resumenes", last), "utf8")));
  if (desde) {
    const changed = [
      ...git(root, "diff", "--name-only", desde).split("\n"),
      ...git(root, "ls-files", "--others", "--exclude-standard").split("\n"),
    ].filter(Boolean);
    for (const p of outsideAgentZones(changed)) errors.push(`${p}: el agente no puede modificar este archivo`);
    for (const p of changed.filter((x) => x.startsWith("temas/") && existsSync(join(root, x)))) {
      let before;
      try {
        before = git(root, "show", `${desde}:${p}`);
      } catch {
        errors.push(`${p}: el agente no puede crear temas nuevos`);
        continue;
      }
      if (autoZoneOf(before) !== autoZoneOf(readFileSync(join(root, p), "utf8"))) errors.push(`${p}: cambió la zona kb:auto (es del bot)`);
    }
  }
  if (errors.length) {
    console.error(`✗ ${errors.length} problema(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }
  console.log("✓ Investigación válida.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--desde");
  main(join(import.meta.dirname ?? new URL(".", import.meta.url).pathname, ".."), i > -1 ? process.argv[i + 1] : undefined);
}
```

Y `kb-plantilla/_investigacion/validar.d.mts` (para el typecheck de las pruebas):

```ts
export declare const TIPOS: Set<string>;
export declare function parseFrontmatter(
  text: string,
): { data: Record<string, string | string[]>; body: string } | { error: string };
export declare function validateReferencia(text: string): string[];
export declare function validateTopicBlock(text: string): string[];
export declare function validateResumen(text: string): string[];
export declare function outsideAgentZones(paths: string[]): string[];
export declare function autoZoneOf(text: string): string | undefined;
```

- [ ] **Step 4: Correr pruebas, typecheck y el CLI**

Run: `npx tsx test/kb.ts && npm run typecheck`
Expected: `0 fallos`, limpio.

Run (CLI sobre una base de prueba):

```bash
T=$(mktemp -d) && mkdir -p "$T/_investigacion" "$T/referencias" && cp kb-plantilla/_investigacion/validar.mjs "$T/_investigacion/" && printf -- '---\ntipo: app\n---\n' > "$T/referencias/x.md" && node "$T/_investigacion/validar.mjs"; echo "exit=$?"; rm -rf "$T"
```

Expected: lista de errores de `referencias/x.md` y `exit=1`.

- [ ] **Step 5: Commit**

```bash
git add kb-plantilla/_investigacion/validar.mjs kb-plantilla/_investigacion/validar.d.mts test/kb.ts
git commit -m "kb: validador de la investigación semanal"
```

---

### Task 6: Manual del agente, CLAUDE.md de la base e instalador

**Files:**
- Create: `kb-plantilla/_investigacion/INSTRUCCIONES.md`
- Create: `kb-plantilla/CLAUDE.md`
- Create: `scripts/kb-research-install.sh`

**Interfaces:**
- Consumes: `validar.mjs` (Task 5); formatos de Task 1 (registro, bloque, resúmenes).
- Produces: plantilla instalable en `ia-es-kb`.

- [ ] **Step 1: Escribir `kb-plantilla/_investigacion/INSTRUCCIONES.md`**

````markdown
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
2. **Fuentes.** Cada afirmación verificable lleva `[n]` (n = posición en `fuentes`
   del frontmatter, desde 1). Prefiere fuentes oficiales o primarias. Lo que no
   puedas respaldar con una fuente, no lo escribes. No inventes precios, límites
   ni capacidades.
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
- Fichas nuevas = fichas de `fuentes/` cuyo frontmatter `tema:` es `[[<Tema>]]` y
  cuyo `guardado:` es posterior a la última revisión (todas si nunca se revisó).

Elegibles: con ≥ 1 ficha nueva, o con última revisión hace > 30 días. Orden: más
fichas nuevas primero; luego los más antiguos. Toma los primeros 5. Si no hay
elegibles: termina sin commit.

## Paso 3 — Por cada tema

1. Lee la página del tema y sus fichas (empieza por las nuevas).
2. Elige hasta **8 referencias**: cosas concretas que se repiten entre fichas o
   son centrales para el tema (una herramienta, un producto, un libro, un
   método, una persona, un lugar, un concepto). Ignora lo anecdótico.
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

   Si la nota ya existía, conserva intacto todo lo que esté bajo `## Mis notas`.
   Si una referencia ya no existe o fue descontinuada, agrégale `estado: descontinuado`
   al frontmatter y dilo en `## Datos clave`.

6. Escribe o reemplaza el bloque de investigación del tema, **justo después** de
   `<!-- kb:auto:end -->` (si ya existe, reemplaza solo lo de adentro):

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
- [[n8n]] — automatización de flujos; tiene API y self-hosting
<!-- kb:research:end -->
```

## Paso 4 — Registro y resumen

- Agrega al final de `_investigacion/registro.md` (créalo con `# Registro de investigación` si no existe) una línea por tema:
  `- <HOY> · <Tema> · <n> referencias (<m> nuevas)`
- Escribe `_investigacion/resumenes/<HOY>.md` (máximo 1000 caracteres, sin frontmatter):
  qué temas revisaste, qué cambió y las 3 novedades más útiles. Es lo que el
  usuario recibe por Telegram.

## Paso 5 — Validar y subir

```bash
node _investigacion/validar.mjs --desde "$INICIO"
git add referencias _investigacion temas CLAUDE.md
git commit -m "investigación: <Tema 1>, <Tema 2>…"
git push || (git pull --rebase && git push)
```

Si después del `pull --rebase` hay conflicto en un archivo de `temas/`, conserva la
zona `kb:auto` del remoto y tu bloque `kb:research`, valida de nuevo y sube.
````

- [ ] **Step 2: Escribir `kb-plantilla/CLAUDE.md`**

```markdown
# Base de conocimiento personal

Vault de Obsidian versionado en git. Lo escriben dos sistemas y el usuario.

## Estructura

- `fuentes/` — una ficha por post de Instagram guardado (resumen, ideas clave, herramientas, transcripción). La escribe el bot.
- `temas/` — una página por tema. Zona `kb:auto` = síntesis del bot; bloque `kb:research` = investigación semanal.
- `referencias/` — una nota por cosa concreta investigada (software, producto, libro, método, persona, lugar, concepto), con fuentes `[n]` y fecha `revisado`.
- `_investigacion/` — manual del agente (`INSTRUCCIONES.md`), validador, registro de corridas y resúmenes.
- `_adjuntos/` — imágenes de las fichas.

## Cómo usarla al desarrollar

- Para saber qué se sabe de una herramienta: `referencias/<slug>.md` (API, precio, cómo se implementa, alternativas).
- Para el panorama de un área: `temas/<Tema>.md` (zona `kb:auto` + bloque `kb:research`).
- Para el detalle original: las fichas de `fuentes/` enlazadas desde el tema.
- Respeta la fecha `revisado`: si es antigua, verifica antes de depender de un dato.

## Reglas

- `## Mis notas` es del usuario: nunca se borra ni se reescribe.
- El bot solo escribe en `fuentes/`, `_adjuntos/` y la zona `kb:auto`; el agente de investigación sigue `_investigacion/INSTRUCCIONES.md`.
```

- [ ] **Step 3: Escribir `scripts/kb-research-install.sh`**

```bash
#!/usr/bin/env bash
# Instala (o actualiza) la plantilla de investigación semanal en la base:
# _investigacion/INSTRUCCIONES.md, _investigacion/validar.mjs y CLAUDE.md. Commitea y sube.
#
#   scripts/kb-research-install.sh [ruta-de-la-base]    (default: $KB_DIR o ./knowledge)
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
KB="${1:-${KB_DIR:-$HERE/knowledge}}"
[ -d "$KB/.git" ] || { echo "✗ $KB no es un repo git (¿clonaste ia-es-kb?)" >&2; exit 1; }

mkdir -p "$KB/_investigacion/resumenes"
cp "$HERE/kb-plantilla/_investigacion/INSTRUCCIONES.md" "$KB/_investigacion/"
cp "$HERE/kb-plantilla/_investigacion/validar.mjs" "$KB/_investigacion/"
cp "$HERE/kb-plantilla/CLAUDE.md" "$KB/"
touch "$KB/_investigacion/resumenes/.gitkeep"

node "$KB/_investigacion/validar.mjs"

git -C "$KB" add _investigacion CLAUDE.md
if git -C "$KB" diff --cached --quiet; then
  echo "✓ La plantilla ya estaba al día."
  exit 0
fi
git -C "$KB" commit -q -m "investigación: instala/actualiza la plantilla del agente"
git -C "$KB" push -q
echo "✓ Plantilla instalada en $KB y subida."
```

```bash
chmod +x scripts/kb-research-install.sh
```

- [ ] **Step 4: Probar el instalador contra una base de prueba**

```bash
T=$(mktemp -d) && git init -q --bare -b main "$T/remote.git" && git clone -q "$T/remote.git" "$T/kb" \
  && git -C "$T/kb" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init && git -C "$T/kb" push -q origin main \
  && git -C "$T/kb" config user.name t && git -C "$T/kb" config user.email t@t \
  && scripts/kb-research-install.sh "$T/kb" && scripts/kb-research-install.sh "$T/kb"; ls "$T/kb" "$T/kb/_investigacion"; rm -rf "$T"
```

Expected: primera corrida «✓ Plantilla instalada…», segunda «✓ La plantilla ya estaba al día.», y aparecen `CLAUDE.md`, `INSTRUCCIONES.md`, `validar.mjs`, `resumenes/`.

- [ ] **Step 5: Commit**

```bash
git add kb-plantilla/_investigacion/INSTRUCCIONES.md kb-plantilla/CLAUDE.md scripts/kb-research-install.sh
git commit -m "kb: manual del agente de investigación, CLAUDE.md de la base e instalador"
```

---

### Task 7: Puesta en marcha y prueba de punta a punta (con el usuario)

Pasos operativos; cada uno requiere confirmación del usuario porque publica o
cambia sistemas externos.

- [ ] **Step 1: Verificación completa del repo**

Run: `npm run typecheck && npm test`
Expected: limpio, `0 fallos`.

- [ ] **Step 2: PR y merge de esta rama** (con permiso del usuario).

- [ ] **Step 3: Desplegar el bot**

Run: `scripts/deploy-to-server.sh` (ver `deploy/README.md`). Luego en el servidor
`docker compose logs --tail 50 kb` → el bot arranca sin errores. En el arranque,
`reindex` no corre solo; para indexar lo existente basta el primer pull con
cambios (o `docker compose exec kb npm run kb:reindex`).

- [ ] **Step 4: Instalar la plantilla en la base**

En el Mac, con el clon `knowledge/` de `ia-es-kb` al día (`git -C knowledge pull`):

```bash
scripts/kb-research-install.sh /Users/felipevasquez/Documents/Claude/Carrusel/knowledge
```

(el clon local de `ia-es-kb`; `git -C … remote -v` debe mostrar `fnvasque/ia-es-kb`).

- [ ] **Step 5: Corrida manual sobre 1 tema, en una rama**

En una sesión de Claude Code dentro del clon de `ia-es-kb`:

```bash
git -C <clon-ia-es-kb> switch -c investigacion-prueba
```

Prompt: «Sigue `_investigacion/INSTRUCCIONES.md`, pero investiga solo el tema
`<Tema elegido por el usuario>` y no hagas push.» Revisar con el usuario las notas
de `referencias/`, el bloque del tema y el resumen. Ajustar `INSTRUCCIONES.md`
en `kb-plantilla/` (este repo) si hace falta, reinstalar y repetir.

- [ ] **Step 6: Merge de la prueba y consulta por DM**

Merge de `investigacion-prueba` a `main` de `ia-es-kb` y push. Esperar el pull
horario (o forzar con `docker compose restart kb`). Enviar por DM de Instagram una
pregunta que solo se responda con lo investigado → la respuesta dice «según la
investigación…» y lista «🔎 <referencia> — investigado …». Repetir por Telegram.

- [ ] **Step 7: Acceso de la nube al repo y tarea programada**

- Conectar GitHub en claude.ai con acceso a `fnvasque/ia-es-kb`.
- Crear la tarea programada con el skill `schedule` (o en claude.ai/code):
  repo `fnvasque/ia-es-kb`, semanal, domingo 04:00 America/Santiago, prompt:
  «Sigue `_investigacion/INSTRUCCIONES.md` al pie de la letra.»
- Lanzarla una vez a mano y verificar: commit `investigación: …` en GitHub,
  resumen recibido por Telegram dentro de la hora siguiente.

- [ ] **Step 8: Recordatorio en memoria**

Actualizar la memoria `kb-bot-servidor-gcp` (o crear una nueva) con: tarea
programada semanal, plantilla en `kb-plantilla/`, instalador
`scripts/kb-research-install.sh`.
