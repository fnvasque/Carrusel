import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ingest } from "./ingest.ts";
import { analyzePost, generateVariations } from "../ai/analyze.ts";
import { emitCarouselFile } from "./emit.ts";
import { scoreCarousel, THRESHOLD } from "../score/virality.ts";
import { printReport } from "../score/cli.ts";
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

  // 4) Emisión + score
  const written: string[] = [];
  let i = 0;
  for (const draft of drafts.slice(0, 2)) {
    i++;
    if (!draft.name) draft.name = `remix-v${i}`;
    else draft.name = `${draft.name}-v${i}`;
    const path = await emitCarouselFile(draft, opts.es, opts.outDir);
    written.push(path);
    console.log(`\n✓ Variación ${i} (${draft.angle || "—"}) → ${path}`);

    const mod = await import(pathToFileURL(resolve(path)).href + `?t=${Date.now()}`);
    const spec: CarouselSpec = mod.default;
    const score = scoreCarousel(spec);
    printReport(spec.name, score);
    if (score.total < THRESHOLD) {
      console.warn(`⚠️  Viralidad ${score.total}/100 bajo el umbral (${THRESHOLD}). Revisa las sugerencias.`);
    }

    // Flujo end-to-end: render de PNGs y/o composición del Reel, reutilizando la
    // misma maquinaria que `generate`/`reel`.
    if (opts.render) {
      console.log(`\n🖼️  Renderizando PNGs 4:5 de la variación ${i}…`);
      await renderCarousel(spec, { outDir: "output" });
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
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
