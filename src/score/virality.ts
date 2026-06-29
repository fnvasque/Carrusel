import type { CarouselSpec, SlideSpec } from "../templates/types.ts";

/**
 * Indicador de viralidad PRE-publicación. No predice el futuro: mide si el
 * carrusel TIENE las palancas que disparan guardados/compartidos, según el
 * filtro de calidad (.context/04-quality-gate-viral.md). Es un proxy reproducible.
 * El indicador real (saves/shares) se mide después con `npm run record`.
 */

export interface DimensionScore {
  name: string;
  score: number;
  max: number;
  notes: string[];
}

export interface ViralityResult {
  total: number;
  grade: string;
  dimensions: DimensionScore[];
  penalties: string[];
  suggestions: string[];
}

/** Umbral a partir del cual consideramos el carrusel "listo" para publicar. */
export const THRESHOLD = 75;

// --- Léxicos (en minúsculas, con acentos) ---
const ENEMY = ["no ", "no.", "deja de", "nunca", "mentira", "error", "errores", "gratis", "sin ", "basta", "olvida", "nadie", "dejes de", "no pagues", "no es"];
const OPEN_LOOP = ["#", "todavía", "por qué", "porque", "esto es", "lo que nadie", "la #", "el truco", "la verdad"];
const ACTION = ["pídele", "pidele", "ábrela", "abre ", "prueba", "copia", "escribe", "súbele", "subele", "haz ", "usa ", "entra a", "pega ", "“", "\""];
const HYPE = ["hazte rico", "te hará rico", "cambia tu vida", "cambiará tu vida", "increíble", "revolucionario", "imperdible", "brutal", "alucinante"];
const FEAR = ["te reemplaza", "te reemplazará", "te van a reemplazar", "quedarás obsoleto", "estás muerto", "estas muerto"];
const JARGON = ["llm", "token", "fine-tuning", "fine tuning", "embedding", "prompt engineering", "fine tunear"];
const CLICKBAIT = ["no vas a creer", "esto lo cambia todo", "el truco que nadie", "#1 secreto", "te volará la cabeza"];

const CONTENT_KEYS = [
  "title", "subtitle", "eyebrow", "heading", "body", "bullets", "text", "kicker",
  "quote", "author", "myth", "reality", "reason", "note", "cta",
];

function templateName(slide: SlideSpec): string {
  const t = slide.template as { displayName?: string; name?: string };
  return t.displayName || t.name || "";
}

function contentText(slide: SlideSpec): string {
  const p = slide.props as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of CONTENT_KEYS) {
    const v = p[k];
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) parts.push(...v.filter((x): x is string => typeof x === "string"));
  }
  return parts.join(" ");
}

function has(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n));
}

function countMatches(haystack: string, needles: string[]): number {
  const h = haystack.toLowerCase();
  return needles.reduce((acc, n) => acc + (h.includes(n) ? 1 : 0), 0);
}

export function scoreCarousel(spec: CarouselSpec): ViralityResult {
  const slides = spec.slides ?? [];
  const allText = slides.map(contentText).join(" ");
  const suggestions: string[] = [];
  const penalties: string[] = [];

  // --- Hook (30) ---
  const hookSlide = slides.find((s) => /hook|cover/i.test(templateName(s)));
  const hookNotes: string[] = [];
  let hook = 0;
  if (!hookSlide) {
    suggestions.push("Falta un slide de portada (Hook): es el 80% del alcance.");
    hookNotes.push("sin slide Hook");
  } else {
    const p = hookSlide.props as Record<string, unknown>;
    const title = String(p.title ?? "");
    const sub = `${title} ${String(p.subtitle ?? "")}`;
    if (/\d/.test(title)) { hook += 6; } else { hookNotes.push("sin número en el titular"); suggestions.push("Añade un número concreto al hook (ej. '3', '90%')."); }
    if (has(sub, ENEMY)) { hook += 8; } else { hookNotes.push("sin enemigo/tensión"); suggestions.push("Pon un enemigo o tensión al frente del hook (no/deja de/mentira/gratis…)."); }
    if (has(sub, OPEN_LOOP)) { hook += 6; } else { hookNotes.push("sin bucle abierto"); suggestions.push("Abre un bucle de curiosidad (#3, 'todavía', 'por qué')."); }
    if (typeof p.highlight === "string" && p.highlight) { hook += 5; } else { hookNotes.push("sin palabra clave en cian"); suggestions.push("Define `highlight` para resaltar 1-2 palabras en cian."); }
    const len = title.length;
    if (len >= 12 && len <= 48) { hook += 5; } else { hookNotes.push(`largo del titular fuera de rango (${len})`); }
  }

  // --- Estructura (15) ---
  const structNotes: string[] = [];
  let struct = 0;
  const n = slides.length;
  if (n >= 6 && n <= 8) struct += 7;
  else { struct += n === 5 || n === 9 ? 3 : 0; structNotes.push(`${n} slides (ideal 6-8)`); if (n < 6) suggestions.push("Súbelo a 6-8 slides: da más valor guardable."); }
  const hasReframe = slides.some((s) => /lead|mythreality/i.test(templateName(s)));
  if (hasReframe) struct += 4; else { structNotes.push("sin reframe del dolor"); suggestions.push("Añade un slide de reframe (Lead/MythReality): dispara el compartir."); }
  const hasCta = slides.some((s) => /cta/i.test(templateName(s)));
  if (hasCta) struct += 4; else { structNotes.push("sin CTA"); suggestions.push("Cierra con un slide Cta (guardar/compartir)."); }

  // --- Accionable + específico (20) ---
  const actNotes: string[] = [];
  let act = 0;
  const devSlides = slides.filter((s) => /step|prompt/i.test(templateName(s)));
  const actionable = devSlides.filter((s) => has(contentText(s), ACTION)).length;
  const actScore = Math.min(8, actionable * 3);
  act += actScore;
  if (actScore < 8) { actNotes.push(`${actionable} slides con acción usable`); suggestions.push("Da un mini-prompt o acción usable en cada slide de desarrollo."); }
  const numbers = (allText.match(/\d+%?/g) ?? []).length;
  const numScore = Math.min(6, numbers * 2);
  act += numScore;
  if (numScore < 6) { actNotes.push("poca especificidad numérica"); suggestions.push("Suma datos concretos (números, %, precios)."); }
  const sources = slides.filter((s) => typeof (s.props as Record<string, unknown>).source === "string").length;
  const srcScore = Math.min(6, sources * 2);
  act += srcScore;
  if (srcScore === 0) { actNotes.push("sin fuentes citadas"); }

  // --- Retención (15) ---
  const retNotes: string[] = [];
  let ret = 0;
  const hasProgress = slides.some((s) => {
    const p = s.props as Record<string, unknown>;
    return typeof p.index === "number" && typeof p.total === "number";
  });
  if (hasProgress) ret += 8; else { retNotes.push("sin indicador de progreso"); suggestions.push("Añade index/total a los slides de desarrollo (barra de progreso)."); }
  const numbered = slides.some((s) => {
    const p = s.props as Record<string, unknown>;
    return (typeof p.step === "string" && p.step) || (typeof p.mythLabel === "string" && /\d/.test(String(p.mythLabel)));
  });
  if (numbered) ret += 7; else { retNotes.push("pasos sin numerar"); suggestions.push("Numera los pasos/mitos (01, 02… o Nº1, Nº2…)."); }

  // --- CTA (10) ---
  const ctaNotes: string[] = [];
  let cta = 0;
  const ctaSlide = slides.find((s) => /cta/i.test(templateName(s)));
  if (ctaSlide) {
    const p = ctaSlide.props as Record<string, unknown>;
    const ctaText = `${String(p.title ?? "")} ${String(p.cta ?? "")}`;
    if (has(ctaText, ["guarda", "guárdalo", "guardalo", "comparte", "mándaselo", "mandaselo", "descarga", "envíaselo"])) cta += 6;
    else { ctaNotes.push("CTA sin verbo de guardar/compartir"); suggestions.push("El CTA primario debe pedir guardar o compartir (tu métrica)."); }
    if (typeof p.handle === "string" && p.handle) cta += 4; else ctaNotes.push("sin handle");
  } else {
    ctaNotes.push("sin slide CTA");
  }

  // --- Marca (10, resta por infracciones) ---
  let brand = 10;
  const brandHits: string[] = [];
  for (const [label, list] of [["hype", HYPE], ["miedo", FEAR], ["jerga", JARGON], ["clickbait", CLICKBAIT]] as const) {
    const hits = countMatches(allText, list);
    if (hits > 0) { brand -= hits * 3; brandHits.push(`${label} (${hits})`); }
  }
  brand = Math.max(0, brand);
  if (brandHits.length) { penalties.push(...brandHits); suggestions.push("Quita lo que rompe la marca: " + brandHits.join(", ") + "."); }

  const dimensions: DimensionScore[] = [
    { name: "Hook", score: hook, max: 30, notes: hookNotes },
    { name: "Estructura", score: struct, max: 15, notes: structNotes },
    { name: "Accionable", score: act, max: 20, notes: actNotes },
    { name: "Retención", score: ret, max: 15, notes: retNotes },
    { name: "CTA", score: cta, max: 10, notes: ctaNotes },
    { name: "Marca", score: brand, max: 10, notes: brandHits },
  ];
  const total = Math.max(0, Math.min(100, dimensions.reduce((a, d) => a + d.score, 0)));
  return { total, grade: gradeOf(total), dimensions, penalties, suggestions };
}

function gradeOf(t: number): string {
  if (t >= 90) return "A";
  if (t >= 80) return "A-";
  if (t >= 70) return "B";
  if (t >= 60) return "C";
  return "D";
}
