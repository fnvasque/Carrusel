import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync, done } from "./_check.ts";
import { aprobar } from "../src/caso/aprobacion.ts";
import { generarCaso } from "../src/caso/generar.ts";
import { usarChromiumDeCache } from "../src/caso/chromium.ts";

/**
 * Render real del caso (npm run test:reel): fixture aprobada con un borrador de
 * 5 slides (Hook, Step con fondo de imagenes/, Stat, Clip, Cta) y un clip de 2 s
 * hecho con ffmpeg (testsrc). generarCaso debe dejar caso.pdf, los PNG del
 * carrusel y reel.mp4, todo dentro de la carpeta del caso.
 */

// En este Mac el Chromium que trae Playwright no coincide con su versión: se usa el
// de la caché (mismo helper que la CLI de /caso).
usarChromiumDeCache();

function ffmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
  if (r.status !== 0) throw new Error(`ffmpeg: ${String(r.stderr)}`);
}

await checkAsync("generarCaso renderiza PDF, carrusel y reel con clip dentro del caso", async () => {
  const d = mkdtempSync(join(tmpdir(), "caso-media-"));
  const repoOutput = join(process.cwd(), "output", "reporte-en-una-tarde");
  const habia = existsSync(repoOutput);
  try {
    for (const s of ["imagenes", "clips", "salida"]) mkdirSync(join(d, s));
    writeFileSync(join(d, "historia.md"), "# Cómo armé el reporte\n\n## Paso 1\n\nAbrí la planilla y pedí la tabla.\n\n![](imagenes/fondo.png)\n");
    ffmpeg(["-f", "lavfi", "-i", "color=c=0x335577:s=1080x1350", "-frames:v", "1", join(d, "imagenes", "fondo.png")]);
    ffmpeg(["-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30:duration=2", "-pix_fmt", "yuv420p", join(d, "clips", "demo.mp4")]);
    aprobar(d);
    writeFileSync(join(d, "borrador.json"), JSON.stringify({
      name: "Reporte en una tarde",
      pillar: "trabajo",
      slides: [
        { template: "Hook", props: { title: "Armé un reporte en una tarde", highlight: "tarde" } },
        { template: "Step", props: { heading: "Pide la tabla primero", step: 1, body: "Así ves los datos antes del gráfico." }, background: { image: "imagenes/fondo.png", overlay: 0.6 } },
        { template: "Stat", props: { value: "3 h", label: "ahorradas cada semana" } },
        { template: "Clip", props: { title: "Así se ve", archivo: "demo.mp4" } },
        { template: "Cta", props: { title: "Guárdalo para tu próximo reporte" } },
      ],
    }));

    const r = await generarCaso(d);
    if (r.pdf !== join(d, "caso.pdf")) throw new Error(`pdf en ${r.pdf}`);
    const pdf = readFileSync(r.pdf);
    if (pdf.length === 0 || pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("caso.pdf no es un PDF");
    if (r.carrusel.length !== 4) throw new Error(`carrusel con ${r.carrusel.length} PNG (el Clip no va al carrusel)`);
    for (const png of r.carrusel) {
      if (!png.startsWith(join(d, "salida") + "/") || statSync(png).size === 0) throw new Error(`PNG fuera o vacío: ${png}`);
    }
    if (!r.reel || !r.reel.startsWith(join(d, "salida") + "/") || !r.reel.endsWith("reel.mp4")) throw new Error(`reel en ${r.reel}`);
    if (statSync(r.reel).size === 0) throw new Error("reel.mp4 vacío");
    if (readdirSync(join(d, "salida", "reporte-en-una-tarde")).some((f) => f.startsWith(".reel-sin-clips"))) throw new Error("quedó el reel sin clips");
    if (!r.avisos.some((a) => a.startsWith("Puntaje del carrusel")) || !r.avisos.some((a) => a.startsWith("Puntaje del reel"))) {
      throw new Error("faltan los puntajes en avisos: " + JSON.stringify(r.avisos));
    }
    if (!habia && existsSync(repoOutput)) throw new Error("escribió en output/ del repo");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

await done();
