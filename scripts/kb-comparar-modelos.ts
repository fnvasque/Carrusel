/**
 * Compara modelos para la ficha (extracción) con posts reales: mismo input para
 * todos (imágenes/cuadros + caption + transcripción, preparados una vez y
 * guardados en .cache/bench/), y por modelo mide costo real, tiempo, tildes
 * corruptas (reintentos) y fallos. No toca la base.
 *
 *   npx tsx scripts/kb-comparar-modelos.ts <url@usuario> ... [--models=a,b] [--only-prep]
 *
 * Los modelos con "/" van por OpenRouter (OPENROUTER_API_KEY); el resto, directo a OpenAI.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";
import { extractFicha, MAX_IMAGES, transcribe, type ExtractInput } from "../src/kb/ai.ts";
import { costOf, usageOf } from "../src/kb/costs.ts";
import { downloadVideo, fetchPostViaMeta } from "../src/kb/instagram.ts";
import { frameCount, toSpeechMp3, videoFrames } from "../src/kb/media.ts";
import { shortcodeFromUrl } from "../src/kb/shortcode.ts";
import { listTopics } from "../src/kb/store.ts";
import { fetchImageAsDataUri, probeDuration } from "../src/remix/ingest.ts";

try {
  process.loadEnvFile?.();
} catch {
  // sin .env
}

const DIR = join(process.cwd(), ".cache", "bench");
const DEFAULT_MODELS = [
  "gpt-4o-2024-11-20",
  "qwen/qwen3.8-flash",
  "qwen/qwen3.7-plus",
  "z-ai/glm-5.3-flash",
  "moonshotai/kimi-k2.5",
  "deepseek/deepseek-v4.1-flash",
  "bytedance-seed/seed-2.0-mini",
  "google/gemini-3.1-flash-lite",
];

interface Prepared extends Omit<ExtractInput, "topics"> {
  id: string;
  url: string;
}

async function prepare(spec: string): Promise<Prepared> {
  const [url, user] = spec.split("@");
  const id = shortcodeFromUrl(url)!;
  const file = join(DIR, "inputs", `${id}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  console.log(`📥 ${id}`);
  const meta = await fetchPostViaMeta(url, user);
  let images: string[] = [];
  let transcript: string | undefined;
  let frames = false;
  if (meta.videoUrl) {
    const video = await downloadVideo(meta.videoUrl);
    if (video) {
      const duration = await probeDuration(video.path);
      images = await videoFrames(video.path, frameCount(duration, MAX_IMAGES), duration);
      frames = images.length > 0;
      const mp3 = await toSpeechMp3(video.path);
      if (mp3) transcript = (await transcribe(mp3, meta.caption, duration)) || undefined;
      await video.cleanup();
    }
  }
  if (!images.length) {
    for (const u of meta.imageUrls.slice(0, MAX_IMAGES)) {
      const uri = await fetchImageAsDataUri(u);
      if (uri?.startsWith("data:image/")) images.push(uri);
    }
  }
  const p: Prepared = {
    id, url, kind: meta.kind, caption: meta.caption, transcript, notes: [], images, imageDetail: frames ? "low" : "high",
  };
  await mkdir(join(DIR, "inputs"), { recursive: true });
  await writeFile(file, JSON.stringify(p));
  return p;
}

export interface RunResult {
  model: string;
  id: string;
  ok: boolean;
  error?: string;
  ms: number;
  usd?: number;
  input?: number;
  output?: number;
  retries: number;
  extraction?: unknown;
}

const openrouter = (): OpenAI => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Falta OPENROUTER_API_KEY en .env.");
  return new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY, timeout: 180_000, maxRetries: 1 });
};

async function runOne(model: string, p: Prepared, topics: ExtractInput["topics"]): Promise<RunResult> {
  const viaOR = model.includes("/");
  let usd = 0;
  let input = 0;
  let output = 0;
  let retries = 0;
  const started = Date.now();
  try {
    const extraction = await extractFicha(
      { ...p, topics },
      {
        client: viaOR ? openrouter() : new OpenAI({ timeout: 180_000, maxRetries: 1 }),
        model,
        // Solo proveedores que respetan el esquema estricto; costo real en la respuesta.
        extraBody: viaOR ? { usage: { include: true }, provider: { require_parameters: true } } : undefined,
        log: { warn: () => void retries++ },
        onResponse: (res) => {
          const raw = (res as { usage?: Record<string, unknown> }).usage;
          const u = usageOf(raw);
          input += u?.input ?? 0;
          output += u?.output ?? 0;
          usd += typeof raw?.cost === "number" ? raw.cost : (u && costOf(model, u)) || 0;
        },
      },
    );
    return { model, id: p.id, ok: true, ms: Date.now() - started, usd, input, output, retries, extraction };
  } catch (err) {
    return { model, id: p.id, ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started, usd, input, output, retries };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const models = args.find((a) => a.startsWith("--models="))?.slice(9).split(",") ?? DEFAULT_MODELS;
  const specs = args.filter((a) => !a.startsWith("--"));
  const prepared: Prepared[] = [];
  for (const s of specs) {
    try {
      prepared.push(await prepare(s));
    } catch (err) {
      console.warn(`⚠️  ${s}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`✅ ${prepared.length} post(s) listos`);
  if (args.includes("--only-prep")) return;
  const topics = await listTopics();
  await mkdir(join(DIR, "results"), { recursive: true });
  // Un modelo a la vez por post, todos los modelos en paralelo.
  const all = await Promise.all(
    models.map(async (m) => {
      const out: RunResult[] = [];
      for (const p of prepared) {
        const r = await runOne(m, p, topics);
        console.log(`${r.ok ? "✓" : "✗"} ${m} · ${p.id} · ${(r.ms / 1000).toFixed(1)} s${r.retries ? ` · ${r.retries} reintento(s)` : ""}${r.error ? ` · ${r.error.slice(0, 120)}` : ""}`);
        out.push(r);
      }
      return out;
    }),
  );
  await writeFile(join(DIR, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(all.flat(), null, 1));
}

await main();
