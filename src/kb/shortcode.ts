/**
 * Normalización de links de Instagram: quita parámetros de rastreo (igsh, utm_*)
 * y extrae el shortcode, que identifica el post de forma estable (compartir el
 * mismo post dos veces actualiza su ficha en vez de duplicarla).
 */

const IG_PATH = /instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/i;

/** Primer link de Instagram dentro de un texto (el mensaje compartido puede traer más texto). */
export function findInstagramUrl(text: string): string | undefined {
  const m = text.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s<>"]+/i);
  return m?.[0];
}

/** Todos los links de posts/reels de Instagram de un texto, sin repetir el mismo post. */
export function findInstagramUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/[^\s<>"]+/gi)) {
    const code = shortcodeFromUrl(m[0]);
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(m[0]);
    }
  }
  return out;
}

export function isInstagramUrl(url: string): boolean {
  return IG_PATH.test(url);
}

/** Shortcode del post (`/p/ABC123/`, `/reel/ABC123/`, `/usuario/p/ABC123/`), o undefined. */
export function shortcodeFromUrl(url: string): string | undefined {
  return url.match(IG_PATH)?.[2];
}

/** URL canónica sin query ni fragmento: `https://www.instagram.com/<p|reel|tv>/<shortcode>/`. */
export function normalizeInstagramUrl(url: string): string {
  const m = url.match(IG_PATH);
  if (!m) return url.trim();
  const kind = m[1].toLowerCase() === "reels" ? "reel" : m[1].toLowerCase();
  return `https://www.instagram.com/${kind}/${m[2]}/`;
}
