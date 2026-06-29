import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join, extname } from "node:path";
import { framesFromLocalVideo, localImageToDataUri, MAX_INGEST_IMAGES } from "./ingest.ts";
import type { RemixOptions } from "./types.ts";

const CACHE_DIR = join(process.cwd(), ".cache", "remix");

/** Timeout por invocación de yt-dlp (ms). */
const YTDLP_TIMEOUT_MS = 120_000;

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".mkv"]);

/** ¿Hay yt-dlp en el PATH? (best-effort, mismo patrón que hasFfmpeg). */
export async function ytDlpAvailable(): Promise<boolean> {
  return new Promise((resolveP) => {
    const proc = spawn("yt-dlp", ["--version"]);
    proc.on("error", () => resolveP(false));
    proc.on("close", (code) => resolveP(code === 0));
  });
}

/**
 * Flags de cookies para yt-dlp, desde opciones o env. `--cookies` apunta a un
 * archivo Netscape cookies.txt; `--cookies-from-browser` a un navegador
 * (chrome/firefox/…). Sirven para vencer el login wall de Instagram.
 */
function resolveCookies(opts: RemixOptions): string[] {
  const flags: string[] = [];
  const file = opts.cookies ?? process.env.REMIX_COOKIES;
  const browser = opts.cookiesFromBrowser ?? process.env.REMIX_COOKIES_FROM_BROWSER;
  if (file) flags.push("--cookies", file);
  if (browser) flags.push("--cookies-from-browser", browser);
  return flags;
}

/** Ejecuta yt-dlp capturando stdout/stderr, con timeout (kill si expira). */
function runYtDlp(args: string[], timeoutMs = YTDLP_TIMEOUT_MS): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    const proc = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolveP({ code: -1, stdout, stderr: stderr + "\n[timeout]" });
    }, timeoutMs);
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", () => { clearTimeout(timer); resolveP({ code: -1, stdout, stderr }); });
    proc.on("close", (code) => { clearTimeout(timer); resolveP({ code: code ?? -1, stdout, stderr }); });
  });
}

/**
 * Ingiere un post de Instagram con yt-dlp (fuente preferente): obtiene el caption
 * con `yt-dlp -J` y descarga TODOS los medios (imágenes del carrusel y/o video del
 * reel) a un temporal; imágenes → data URI, videos → frames vía ffmpeg. Devuelve
 * null si no logra nada (para degradar a scraping). Nunca lanza hacia afuera.
 */
export async function ingestViaYtDlp(
  url: string,
  opts: RemixOptions,
): Promise<{ caption: string; mediaDataUris: string[] } | null> {
  const cookies = resolveCookies(opts);
  if (cookies.length) console.log("ℹ️  yt-dlp con cookies (para vencer el login wall).");

  const id = createHash("sha256").update(url).digest("hex").slice(0, 16);
  const tmp = join(CACHE_DIR, `ytdlp-${id}`);

  try {
    await mkdir(tmp, { recursive: true });

    // 1) Metadata → caption.
    let caption = "";
    const meta = await runYtDlp(["-J", "--no-warnings", ...cookies, url]);
    if (meta.code === 0 && meta.stdout) {
      try {
        const json = JSON.parse(meta.stdout) as { description?: string; title?: string };
        caption = json.description ?? json.title ?? "";
      } catch {
        caption = "";
      }
    }

    // 2) Descargar todos los medios al temporal, en orden.
    const dl = await runYtDlp([
      "-o", join(tmp, "%(autonumber)s.%(ext)s"),
      "--no-warnings",
      ...cookies,
      url,
    ]);

    // 3) Convertir archivos a mediaDataUris (imágenes + frames de videos).
    let files: string[] = [];
    try {
      files = (await readdir(tmp)).sort();
    } catch {
      files = [];
    }

    const mediaDataUris: string[] = [];
    for (const f of files) {
      const ext = extname(f).toLowerCase();
      const full = join(tmp, f);
      if (IMAGE_EXTS.has(ext)) {
        const uri = await localImageToDataUri(full);
        if (uri) mediaDataUris.push(uri);
      } else if (VIDEO_EXTS.has(ext)) {
        const frames = await framesFromLocalVideo(full, opts.frames ?? 5);
        mediaDataUris.push(...frames);
      }
      if (mediaDataUris.length >= MAX_INGEST_IMAGES) break;
    }

    const media = mediaDataUris.slice(0, MAX_INGEST_IMAGES);
    if (dl.code !== 0 && !media.length && !caption) return null;
    if (!media.length && !caption) return null;
    return { caption, mediaDataUris: media };
  } catch {
    return null;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
