import { spawn } from "node:child_process";

export interface ReelOpts {
  /** Duración del crossfade entre slides (s). */
  fade?: number;
  /** Frames por segundo de salida. */
  fps?: number;
}

/**
 * Compone los frames 9:16 en un reel.mp4 1080×1920 listo para Instagram:
 * cada slide dura `durations[i]` segundos (legibilidad), con zoom sutil
 * alternado (in/out) y crossfades. h264/yuv420p, sin audio. Determinista.
 * Requiere ffmpeg en el PATH.
 */
export async function composeReel(
  frames: string[],
  durations: number[],
  outPath: string,
  opts: ReelOpts = {},
): Promise<void> {
  if (frames.length < 1) throw new Error("No hay frames para componer el Reel.");
  if (durations.length !== frames.length) throw new Error("durations debe tener una entrada por frame.");
  const fade = opts.fade ?? 0.4;
  const fps = opts.fps ?? 30;

  const inputs: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    inputs.push("-loop", "1", "-framerate", String(fps), "-t", String(durations[i]), "-i", frames[i]);
  }

  // Zoom sutil (≤10%) alternado: pares zoom-in, impares zoom-out. La coma
  // dentro de min()/max() se escapa para el filtergraph.
  const perInput = frames.map((_, i) => {
    const step = (0.1 / (durations[i] * fps)).toFixed(6);
    const z = i % 2 === 0
      ? `min(1+${step}*on\\,1.10)`
      : `max(1.10-${step}*on\\,1.0)`;
    return `[${i}:v]zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${fps},setsar=1[v${i}]`;
  });

  let graph = perInput.join(";");
  let finalLabel: string;
  if (frames.length === 1) {
    finalLabel = "[v0]";
  } else {
    let prev = "[v0]";
    let prefix = 0; // suma de duraciones de los slides previos
    for (let i = 1; i < frames.length; i++) {
      prefix += durations[i - 1];
      const out = i === frames.length - 1 ? "[out]" : `[x${i}]`;
      const offset = (prefix - i * fade).toFixed(3);
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

/** Duración total del reel (s) dado el vector de duraciones por slide. */
export function reelDuration(durations: number[], fade = 0.4): number {
  const sum = durations.reduce((a, b) => a + b, 0);
  return +(sum - Math.max(0, durations.length - 1) * fade).toFixed(1);
}
