import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ingest } from "./ingest.ts";
import { analyzePost, generateVariations, improveVariation } from "../ai/analyze.ts";
import { emitCarouselFile, validateDraft } from "./emit.ts";
import { scoreDraft, draftToSpec } from "./registry.ts";
import { THRESHOLD, type ViralityResult } from "../score/virality.ts";
import { printReport } from "../score/cli.ts";
import {
  evaluateContent,
  gateSuggestions,
  printAudienceReport,
  printFactCheckReport,
  AUDIENCE_THRESHOLD,
  type ContentGateResult,
} from "../ai/evaluate.ts";
import { renderCarousel } from "../render/renderCarousel.ts";
import { renderReel } from "../reel/renderReel.ts";
import type { CarouselSpec } from "../templates/types.ts";
import type { RemixOptions, SpanishVariant } from "./types.ts";

/** Parsea process.argv en RemixOptions. Primer posicional = url. */
function parseArgs(argv: string[]): RemixOptions {
  const opts: RemixOptions = { es: "neutro", outDir: "carousels", image: [] };
  for (const arg of argv) {
    if (arg.startsWith("--caption=")) opts.caption = arg.slice("--caption=".length);
    else if (arg.startsWith("--image=")) opts.image!.push(arg.slice("--image=".length));
    else if (arg.startsWith("--es=")) opts.es = (arg.slice("--es=".length) === "cl" ? "cl" : "neutro") as SpanishVariant;
    else if (arg.startsWith("--out=")) opts.outDir = arg.slice("--out=".length);
    else if (arg.startsWith("--frames=")) opts.frames = Number(arg.slice("--frames=".length)) || undefined;
    else if (arg.startsWith("--cookies=")) opts.cookies = arg.slice("--cookies=".length);
    else if (arg.startsWith("--cookies-from-browser=")) opts.cookiesFromBrowser = arg.slice("--cookies-from-browser=".length);
    else if (arg.startsWith("--min-score=")) opts.minScore = Number(arg.slice("--min-score=".length)) || undefined;
    else if (arg.startsWith("--min-audience=")) opts.minAudience = Number(arg.slice("--min-audience=".length)) || undefined;
    else if (arg.startsWith("--max-tries=")) opts.maxTries = Number(arg.slice("--max-tries=".length)) || undefined;
    else if (arg === "--no-improve") opts.noImprove = true;
    else if (arg === "--factcheck-web") opts.factcheckWeb = true;
    else if (arg === "--lenient") opts.lenient = true;
    else if (arg === "--render") opts.render = true;
    else if (arg === "--reel") opts.reel = true;
    else if (!arg.startsWith("--") && !opts.url) opts.url = arg;
  }
  if (opts.image && !opts.image.length) opts.image = undefined;
  return opts;
}

function usage(): void {
  console.error("Uso: npm run remix <url-instagram> [--es=cl] [--out=carousels] [--render] [--reel] [--frames=N]");
  console.error("     npm run remix --caption=\"texto del post\" --image=ruta.png   (modo manual)");
  console.error("\n  --render   tras emitir, genera los PNGs 4:5 de cada variación");
  console.error("  --reel     tras emitir, compone el Reel 9:16 de cada variación (requiere ffmpeg)");
  console.error("  --frames=N frames a extraer de un reel para el análisis (default 5)");
  console.error("  --min-score=N  objetivo de viralidad del loop de calidad (default 75)");
  console.error("  --min-audience=N objetivo de VALOR para la audiencia, persona Andrea (default 75)");
  console.error("  --factcheck-web  verifica los hechos contra la web (más lento; default solo offline)");
  console.error("  --max-tries=N  intentos de mejora por variación (default 3)");
  console.error("  --no-improve   desactiva el loop de calidad (más rápido/barato)");
  console.error("  --lenient      emite aunque el gate de contenido no pase (por defecto BLOQUEA)");
  console.error("  --cookies=cookies.txt              cookies (Netscape) para yt-dlp (vence login wall)");
  console.error("  --cookies-from-browser=chrome      toma cookies del navegador (chrome/firefox/…)");
  console.error("  (también vía env REMIX_COOKIES / REMIX_COOKIES_FROM_BROWSER)");
  console.error("\nUsa yt-dlp si está instalado (más confiable); si no, scraping público; si no, --caption/--image.");
  console.error("Genera 2 variaciones (.ts) en carousels/ listas para `npm run generate` / `npm run reel`.");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.url && !opts.caption && !(opts.image && opts.image.length)) {
    usage();
    process.exit(1);
  }

  // 1) Ingesta
  const source = await ingest(opts);
  console.log(`\n📥 Ingesta: tipo=${source.type} · fuente=${source.source} · parcial=${source.partial}`);
  if (source.caption) console.log(`   caption: "${source.caption.slice(0, 90)}${source.caption.length > 90 ? "…" : ""}"`);

  // 2) Análisis
  console.log("\n🔍 Analizando el post…");
  const analysis = await analyzePost(source);
  console.log(`   hook: ${analysis.hook}`);
  console.log(`   pilar: ${analysis.pillar} · formato: ${analysis.format} · confianza: ${analysis.confidence}`);

  // 3) Generación de 2 variaciones
  console.log("\n✍️  Generando 2 variaciones en " + (opts.es === "cl" ? "español chileno" : "español neutro") + "…");
  const drafts = await generateVariations(analysis, { es: opts.es, count: 2 });

  await mkdir(opts.outDir, { recursive: true });

  // 4) Loop de calidad → emisión del mejor draft
  //    Gate combinado (3 palancas): viralidad (proxy) + valor de audiencia (persona
  //    Andrea) + fact-check. Cada iteración evalúa las tres y, si alguna falla,
  //    corrige con improveVariation alimentado por el feedback combinado. Realiza
  //    el flujo del usuario: generar → evaluar valor → corregir → fact-check →
  //    (si falla) volver a evaluar → generar slides solo si pasa.
  const minScore = opts.minScore ?? THRESHOLD;
  const minAudience = opts.minAudience ?? AUDIENCE_THRESHOLD;
  const maxTries = Math.max(1, opts.maxTries ?? 3);
  const improve = !opts.noImprove;
  const evalOpts = { web: opts.factcheckWeb, minAudience };

  const written: string[] = [];
  let blocked = false;
  let i = 0;
  for (const draft of drafts.slice(0, 2)) {
    i++;

    let best = validateDraft(draft);
    let vir = scoreDraft(best);
    let gate = await evaluateContent(draftToSpec(best), { analysis, source }, evalOpts);
    let allPass = vir.total >= minScore && gate.pass;

    if (improve && !allPass) {
      for (let t = 1; t < maxTries && !allPass; t++) {
        const suggestions = [...vir.suggestions, ...gateSuggestions(gate)];
        console.log(
          `  ↻ Variación ${i}: corrigiendo (intento ${t + 1}/${maxTries}) — ` +
            `viral ${vir.total}/${minScore} · valor ${gate.audience.total}/${minAudience} · ` +
            `hechos ${gate.factcheck.pass ? "ok" : `✗ (${gate.factcheck.issues.filter((x) => x.severity !== "baja").length})`}…`,
        );
        const cand = validateDraft(await improveVariation(analysis, best, suggestions, { es: opts.es }));
        const cvir = scoreDraft(cand);
        const cgate = await evaluateContent(draftToSpec(cand), { analysis, source }, evalOpts);
        if (isBetterState(cvir, cgate, vir, gate, minScore, minAudience)) {
          best = cand;
          vir = cvir;
          gate = cgate;
        }
        allPass = vir.total >= minScore && gate.pass;
      }
    }

    best.name = best.name ? `${best.name}-v${i}` : `remix-v${i}`;
    const path = await emitCarouselFile(best, opts.es, opts.outDir);
    written.push(path);
    console.log(`\n✓ Variación ${i} (${best.angle || "—"}) → ${path}`);

    const mod = await import(pathToFileURL(resolve(path)).href + `?t=${Date.now()}`);
    const spec: CarouselSpec = mod.default;

    // Los tres reportes: viralidad + valor de audiencia + fact-check.
    printReport(spec.name, vir);
    printAudienceReport(spec.name, gate.audience);
    printFactCheckReport(spec.name, gate.factcheck);

    if (!allPass) {
      const fallos: string[] = [];
      if (vir.total < minScore) fallos.push(`viralidad ${vir.total}/${minScore}`);
      if (gate.audience.total < minAudience) fallos.push(`valor ${gate.audience.total}/${minAudience}`);
      if (!gate.factcheck.pass) fallos.push(`hechos (${gate.factcheck.issues.filter((x) => x.severity !== "baja").length} a corregir)`);
      const detalle = improve ? ` tras ${maxTries} intento(s)` : " (loop desactivado con --no-improve)";
      if (opts.lenient) {
        console.warn(`⚠️  Variación ${i}: gate de contenido NO superado${detalle} — ${fallos.join(", ")}. Emito igual (--lenient).`);
      } else {
        console.error(`⛔ Variación ${i}: gate de contenido NO superado${detalle} — ${fallos.join(", ")}. No se renderiza (usa --lenient para forzar).`);
        blocked = true;
        continue; // no renderizar esta variación
      }
    }

    // Flujo end-to-end: render de PNGs y/o composición del Reel, reutilizando la
    // misma maquinaria que `generate`/`reel`. El gate de contenido ya corrió aquí
    // (skipContentGate), así que renderCarousel solo repite el proxy de viralidad.
    if (opts.render) {
      console.log(`\n🖼️  Renderizando PNGs 4:5 de la variación ${i}…`);
      await renderCarousel(spec, { outDir: "output", skipContentGate: true });
    }
    if (opts.reel) {
      console.log(`\n🎬 Componiendo el Reel 9:16 de la variación ${i}…`);
      await renderReel(spec, { outDir: "output" });
    }
  }

  console.log(`\n✅ ${written.length} variaciones generadas:`);
  for (const p of written) {
    const rel = p.startsWith(process.cwd()) ? p.slice(process.cwd().length + 1) : p;
    console.log(`   • ${rel}`);
    console.log(`     npm run generate ${rel}    # PNGs 4:5`);
    console.log(`     npm run reel ${rel}        # Reel 9:16`);
  }

  if (blocked) {
    console.error(
      `\n⛔ Al menos una variación no superó el gate de contenido (valor/hechos/viralidad). ` +
        `Los .ts se emitieron para que los revises; no se renderizaron. ` +
        `Corrige el copy y reintenta, o usa --lenient para forzar el render.`,
    );
    process.exit(1);
  }
}

/**
 * ¿El candidato deja el contenido en MEJOR estado que el actual? Prioriza (en orden):
 * más gates superados (viral/valor/hechos), menos hechos falsos (severidad alta) y,
 * a igualdad, mayor suma viralidad+valor. Evita quedarse con una mejora de un eje
 * que empeora otro.
 */
function isBetterState(
  cvir: ViralityResult,
  cgate: ContentGateResult,
  vir: ViralityResult,
  gate: ContentGateResult,
  minScore: number,
  minAudience: number,
): boolean {
  const rank = (v: ViralityResult, g: ContentGateResult): [number, number, number] => {
    const gates = (v.total >= minScore ? 1 : 0) + (g.audience.total >= minAudience ? 1 : 0) + (g.factcheck.pass ? 1 : 0);
    const high = g.factcheck.issues.filter((x) => x.severity === "alta").length;
    return [gates, -high, v.total + g.audience.total];
  };
  const [cg, ch, cc] = rank(cvir, cgate);
  const [pg, ph, pc] = rank(vir, gate);
  if (cg !== pg) return cg > pg;
  if (ch !== ph) return ch > ph;
  return cc > pc;
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
