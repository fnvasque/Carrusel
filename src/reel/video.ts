import { spawn } from "node:child_process";

export interface ReelOpts {
  /** Segundos que se muestra cada slide. */
  secondsPerSlide?: number;
  /** Duración del crossfade entre slides (s). */
  fade?: number;
  /** Frames por segundo de salida. */
  fps?: number;
}

/**
 * Compone los frames 9:16 en un reel.mp4 1080×1920 listo para Instagram:
 * zoom sutil (Ken Burns) por slide + crossfades, h264/yuv420p, sin audio.
 * Determinista (sin aleatoriedad). Requiere ffmpeg en el PATH.
 */
export async function composeReel(frames: string[], outPath: string, opts: ReelOpts = {}): Promise<void> {
  if (frames.length < 1) throw new Error("No hay frames para componer el Reel.");
  const D = opts.secondsPerSlide ?? 2.8;
  const fade = opts.fade ?? 0.4;
  const fps = opts.fps ?? 30;
  const zoomStep = (0.1 / (D * fps)).toFixed(6); // llega a +10% al final del slide

  const inputs: string[] = [];
  for (const f of frames) {
    inputs.push("-loop", "1", "-framerate", String(fps), "-t", String(D), "-i", f);
  }

  // Zoom-in sutil por slide. La coma dentro de min() se escapa para el filtergraph.
  const perInput = frames.map(
    (_, i) =>
      `[${i}:v]zoompan=z='min(1+${zoomStep}*on\\,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${fps},setsar=1[v${i}]`,
  );

  let graph = perInput.join(";");
  let finalLabel: string;
  if (frames.length === 1) {
    finalLabel = "[v0]";
  } else {
    let prev = "[v0]";
    for (let i = 1; i < frames.length; i++) {
      const out = i === frames.length - 1 ? "[out]" : `[x${i}]`;
      const offset = (i * (D - fade)).toFixed(3);
      graph += `;${prev}[v${i}]xfade=transition=fade:duration=${fade}:offset=${offset}${out}`;
      prev = out;
    }
    finalLabel = "[out]";
  }

  const args = [
    ...inputs,
    "-filter_complex", graph,
    "-map", finalLabel,
    "-r", String(fps),
    "-c:v", "libx264",
    "-preset", "medium",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-an",
    "-y",
    outPath,
  ];

  await new Promise<void>((resolveP, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolveP();
      else reject(new Error(`ffmpeg salió con código ${code}:\n${stderr.split("\n").slice(-12).join("\n")}`));
    });
  });
}

/** Duración total estimada del reel (s). */
export function reelDuration(n: number, secondsPerSlide = 2.8, fade = 0.4): number {
  return +(n * secondsPerSlide - Math.max(0, n - 1) * fade).toFixed(1);
}
