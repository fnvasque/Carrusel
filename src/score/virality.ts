import type { CarouselSpec, SlideSpec } from "../templates/types.ts";

/**
 * Indicador de viralidad PRE-publicación. No predice el futuro: mide si la
 * pieza TIENE las palancas que disparan guardados/compartidos. Es un proxy
 * reproducible. Hay dos rúbricas: `scoreCarousel` (carrusel: filtro de calidad
 * .context/04-quality-gate-viral.md) y `scoreReel` (reel narrado, pivote
 * 2026-10-17). El indicador real (saves/shares) se mide después con `npm run record`.
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
  "value", "label", "context", "prompt", "respuesta", "nota", "app", "resultado",
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
    if (typeof p.highlight === "string" && p.highlight) { hook += 5; } else { hookNotes.push("sin palabra clave en lima"); suggestions.push("Define `highlight` para resaltar 1-2 palabras en lima."); }
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
  // Stat cuenta como slide de desarrollo (con número); Screen muestra la IA haciéndolo (prompt + respuesta).
  const devSlides = slides.filter((s) => /step|prompt|stat|screen/i.test(templateName(s)));
  const actionable = devSlides.filter((s) => has(contentText(s), ACTION) || (/screen/i.test(templateName(s)) && typeof (s.props as Record<string, unknown>).prompt === "string")).length;
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
    return (
      (typeof p.step === "string" && p.step) ||
      (typeof p.mythLabel === "string" && /\d/.test(String(p.mythLabel))) ||
      (/stat/i.test(templateName(s)) && typeof p.value === "string" && /\d/.test(p.value))
    );
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

// ---------------------------------------------------------------------------
// Reel narrado (pivote 2026-10-17)
// ---------------------------------------------------------------------------

/** Lo mínimo que el score necesita de un borrador de reel (forma de `Borrador`). */
export interface ReelDraftLike {
  pace?: string;
  slides: { template: string; props: Record<string, unknown>; narracion?: string }[];
}

/** Verbos con los que el Cta (o su voz) pide el gesto que mide la cuenta. */
const GESTO = ["guarda", "guárda", "guardalo", "comparte", "compárte", "comenta", "coméntame", "comentame", "cuéntame", "cuentame", "dime ", "escríbeme", "escribeme", "mándaselo", "mandaselo", "mándale", "mandale", "envíaselo", "enviaselo", "envíalo", "envialo", "pásaselo", "pasaselo", "sígueme", "sigueme", "síguenos", "siguenos", "descarga", "etiqueta"];
/** Destinatario del envío antes del segundo 5 (regla 7): va en el Hook, no solo en el Cta. */
const DESTINATARIO = ["para tu", "para quien", "a quien", "si estudias", "si trabajas", "si siempre", "si tienes", "si eres", "si usas", "si vendes", "si anotas", "si pagas", "si olvidas", "si te ", "tu amigo", "tu jefe", "tu equipo", "tu hijo", "tu mamá", "tu papá", "alguien que"];

const palabras = (t: unknown): number => (typeof t === "string" && t.trim() ? t.trim().split(/\s+/).length : 0);
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const tokens = (t: string): Set<string> => new Set(t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-zñ0-9]{3,}/g) ?? []);

/** Proporción de palabras (≥ 3 letras) de `a` que también están en `b`. */
function solape(a: string, b: string): number {
  const ta = tokens(a);
  if (!ta.size) return 0;
  const tb = tokens(b);
  let c = 0;
  for (const w of ta) if (tb.has(w)) c++;
  return c / ta.size;
}

/**
 * Score léxico de un REEL narrado: mide si tiene las palancas del pivote del
 * 2026-10-17 (manual, reglas duras 7 a 10): el resultado de la IA visible en el
 * primer cuadro, voz en cada escena que explica en vez de leer, la IA en
 * pantalla (`Screen`, o un `Clip` con el modelo en `label`; o la fuente, si es
 * una pieza de evidencia), ritmo gancho
 * corto y un Cta que pide el gesto (guardar, mandar, comentar). No mide
 * lo que el validador ya rechaza (duración exacta, props del catálogo).
 */
export function scoreReel(draft: ReelDraftLike): ViralityResult {
  const slides = draft.slides ?? [];
  const suggestions: string[] = [];
  const penalties: string[] = [];
  const narraciones = slides.map((s) => txt(s.narracion));
  const allText = slides.map((s) => contentText({ template: () => null, props: s.props } as unknown as SlideSpec)).concat(narraciones).join(" ");

  // --- Hook (25): el resultado en el primer cuadro ---
  const hookNotes: string[] = [];
  let hook = 0;
  const hs = slides.find((s) => /hook/i.test(s.template));
  const esClip = (s: { template: string }) => /^clip$/i.test(s.template);
  // Portada: el Hook o, si no hay, un Clip en la escena 0 (video generado como contenido).
  const portadaClip = !hs && slides[0] && esClip(slides[0]) ? slides[0] : undefined;
  const portada = hs ?? portadaClip;
  if (portadaClip) {
    const p = portadaClip.props;
    const title = txt(p.title);
    if (txt(p.archivo).trim()) hook += 8; else { hookNotes.push("Clip sin archivo"); suggestions.push("El Clip de portada lleva `archivo` (el clip en la caché del Mac)."); }
    if (txt(p.label).trim()) hook += 5; else { hookNotes.push("Clip sin label"); suggestions.push("Pon en `label` el modelo y el costo («Kling 3.0 · 9 créditos»): es la tarjeta de la portada."); }
    if (txt(p.highlight).trim()) hook += 4; else { hookNotes.push("sin palabra clave en lima"); suggestions.push("Define `highlight` para resaltar 1-2 palabras del titular."); }
    const nTit = palabras(title);
    const gancho = /[¿?]/.test(title) || /\d/.test(title) || has(title, ENEMY);
    if (gancho) hook += 5; else { hookNotes.push("titular sin pregunta, número ni tensión"); suggestions.push("Haz del titular una pregunta corta, o mete un número o una tensión (gratis, sin, no)."); }
    if (nTit >= 2 && nTit <= 8) hook += 3; else { hookNotes.push(`titular de ${nTit} palabras (2 a 8)`); suggestions.push("El titular sobre el video: 2 a 8 palabras."); }
  } else if (!hs) {
    hookNotes.push("sin slide Hook");
    suggestions.push("Falta la portada (Hook): sin ella no hay primer cuadro.");
  } else {
    const p = hs.props;
    const title = txt(p.title);
    const nRes = palabras(p.resultado);
    if (nRes >= 2 && nRes <= 20) hook += 8;
    else { hookNotes.push(nRes ? `resultado de ${nRes} palabras (2 a 20)` : "sin resultado en el primer cuadro"); suggestions.push("Pon en `resultado` lo que la IA ya hizo, tal cual se ve en pantalla (2 a 20 palabras)."); }
    const app = txt(p.app).trim();
    const modo = txt(p.modo);
    if (app && (modo === "aviso" || modo === "respuesta")) hook += 5;
    else { hookNotes.push("sin app + modo en la tarjeta"); suggestions.push("Indica `app` (la IA) y `modo` (aviso | respuesta) en el Hook."); }
    if (txt(p.highlight).trim()) hook += 4; else { hookNotes.push("sin palabra clave en lima"); suggestions.push("Define `highlight` para resaltar 1-2 palabras del titular."); }
    const nTit = palabras(title);
    const gancho = /[¿?]/.test(title) || /\d/.test(title) || has(title, ENEMY);
    if (gancho) hook += 5; else { hookNotes.push("titular sin pregunta, número ni tensión"); suggestions.push("Haz del titular una pregunta corta, o mete un número o una tensión (gratis, sin, no)."); }
    if (nTit >= 2 && nTit <= 8) hook += 3; else { hookNotes.push(`titular de ${nTit} palabras (2 a 8)`); suggestions.push("El titular es pie de foto: 2 a 8 palabras."); }
  }

  // --- Narración (20): la voz explica, no lee ---
  const narNotes: string[] = [];
  let nar = 0;
  const conVoz = slides.filter((s) => { const n = palabras(s.narracion); return n >= 3 && n <= 24; }).length;
  if (slides.length && conVoz === slides.length) nar += 8;
  else { nar += Math.min(4, conVoz); narNotes.push(`${conVoz}/${slides.length} escenas con narración de 3 a 24 palabras`); suggestions.push("Cada escena lleva `narracion` (3 a 24 palabras): lo que dice la voz."); }
  if (portada) {
    const hookNar = txt(portada.narracion);
    const lee = solape(hookNar, txt(portada.props.title)) >= 0.8 && palabras(hookNar) <= palabras(portada.props.title) + 1;
    if (hookNar && !lee) nar += 4; else { narNotes.push("la voz del Hook repite el titular"); suggestions.push("La narración del Hook dice el resultado con otras palabras; no lee el titular."); }
    const dest = has(`${hookNar} ${txt(portada.props.subtitle)} ${narraciones[1] ?? ""}`, DESTINATARIO);
    if (dest) nar += 3; else { narNotes.push("sin destinatario antes del segundo 5"); suggestions.push("Nombra a quién le sirve en la voz del Hook o de la segunda escena («si siempre olvidas…», «para tu amigo que…»)."); }
  }
  const cta = slides.find((s) => /cta/i.test(s.template));
  if (cta && has(txt(cta.narracion), GESTO)) nar += 3; else { narNotes.push("la voz del Cta no pide el gesto"); suggestions.push("La narración del Cta pide guardar o mandárselo a alguien."); }
  const totalPal = narraciones.reduce((a, n) => a + palabras(n), 0);
  if (totalPal >= 20 && totalPal <= 60) nar += 2; else { narNotes.push(`${totalPal} palabras de voz (20 a 60 para caber en 20 s)`); if (totalPal > 60) suggestions.push("Acorta la narración: con más de 60 palabras el reel no cabe en 20 s."); }

  // --- Pantalla (20): la IA se ve haciéndolo ---
  const scrNotes: string[] = [];
  let scr = 0;
  const screens = slides.filter((s) => /screen/i.test(s.template));
  const clips = slides.filter(esClip);
  if (!screens.length && clips.length) {
    // El video generado es la IA haciéndolo: vale como pantalla si dice con qué modelo se hizo.
    if (clips.some((s) => txt(s.props.label).trim())) scr += 10; else { scr += 4; scrNotes.push("Clip sin label"); suggestions.push("Algún Clip lleva `label` con el modelo («Seedance 2.0 · 18 créditos»)."); }
    if (slides.some((s) => txt(s.props.source).trim())) scr += 5; else { scrNotes.push("sin fuente"); suggestions.push("Cita en `source` la herramienta con que se generó el clip."); }
    const idx = slides.findIndex(esClip);
    if (idx <= Math.ceil(slides.length / 2)) scr += 5; else { scrNotes.push("el Clip llega tarde"); suggestions.push("Muestra el video en la primera mitad del reel."); }
  } else if (!screens.length) {
    // Una pieza de evidencia (estudio, dato) puede no mostrar la IA; entonces la fuente hace de prueba.
    const conFuente = slides.filter((s) => txt(s.props.source).trim()).length;
    if (conFuente) { scr += 10; scrNotes.push("sin Screen: pieza de evidencia con fuente"); }
    else scrNotes.push("sin slide Screen ni fuente");
    suggestions.push("Agrega una slide Screen con la IA haciendo lo que la pieza promete (app, prompt y respuesta)" + (conFuente ? ", salvo que sea una pieza de evidencia." : " o cita la fuente en `source`."));
  } else {
    const ok = screens.find((s) => txt(s.props.app).trim() && palabras(s.props.prompt) >= 2 && palabras(s.props.prompt) <= 30 && palabras(s.props.respuesta) >= 3 && palabras(s.props.respuesta) <= 45);
    if (ok) scr += 10; else { scr += 4; scrNotes.push("Screen incompleta (app, prompt ≤ 30 palabras, respuesta 3 a 45)"); suggestions.push("La Screen lleva `app`, `prompt` (≤ 30 palabras) y `respuesta` (3 a 45 palabras)."); }
    const concreta = screens.some((s) => /\d|\n|[.;]\s+\S/.test(txt(s.props.respuesta)) || palabras(s.props.respuesta) >= 8);
    if (concreta) scr += 5; else { scrNotes.push("respuesta de la IA poco concreta"); suggestions.push("La respuesta de la IA muestra el resultado (una lista, un dato, una frase hecha), no un «listo»."); }
    const idx = slides.findIndex((s) => /screen/i.test(s.template));
    if (idx > 0 && idx <= Math.ceil(slides.length / 2)) scr += 5; else { scrNotes.push("la Screen llega tarde"); suggestions.push("Muestra la IA en la primera mitad del reel: con 3 a 5 s de visionado medio, lo que va al final no se ve."); }
  }

  // --- Estructura (15): ritmo gancho, corto ---
  const structNotes: string[] = [];
  let struct = 0;
  const n = slides.length;
  if (n >= 4 && n <= 6) struct += 7; else { struct += n === 3 || n === 7 ? 3 : 0; structNotes.push(`${n} escenas (ideal 4 a 6)`); suggestions.push(n > 6 ? "Quita escenas: en gancho caben 4 a 6 en 20 s." : "Suma una escena: el reel se queda sin desarrollo."); }
  if (draft.pace === "gancho") struct += 4; else { structNotes.push(`ritmo ${draft.pace ?? "sin definir"} (la puerta pide gancho)`); suggestions.push("Pon `pace: \"gancho\"`: los reels en enseñar se abandonan antes del segundo 3."); }
  if (cta && slides[slides.length - 1] === cta) struct += 4; else { structNotes.push("sin Cta al cierre"); suggestions.push("Cierra con un slide Cta."); }

  // --- CTA (10) ---
  const ctaNotes: string[] = [];
  let ctaScore = 0;
  if (cta) {
    const ctaText = `${txt(cta.props.title)} ${txt(cta.props.cta)}`;
    if (has(ctaText, GESTO)) ctaScore += 6; else { ctaNotes.push("CTA sin verbo de guardar/compartir"); suggestions.push("El título del Cta pide guardar o compartir (tu métrica)."); }
    if (txt(cta.props.handle).trim()) ctaScore += 4; else ctaNotes.push("sin handle");
  } else {
    ctaNotes.push("sin slide CTA");
  }

  // --- Marca (10, resta por infracciones; la voz también cuenta) ---
  let brand = 10;
  const brandHits: string[] = [];
  for (const [label, list] of [["hype", HYPE], ["miedo", FEAR], ["jerga", JARGON], ["clickbait", CLICKBAIT]] as const) {
    const hits = countMatches(allText, list);
    if (hits > 0) { brand -= hits * 3; brandHits.push(`${label} (${hits})`); }
  }
  brand = Math.max(0, brand);
  if (brandHits.length) { penalties.push(...brandHits); suggestions.push("Quita lo que rompe la marca: " + brandHits.join(", ") + "."); }

  const dimensions: DimensionScore[] = [
    { name: "Hook", score: hook, max: 25, notes: hookNotes },
    { name: "Narración", score: nar, max: 20, notes: narNotes },
    { name: "Pantalla", score: scr, max: 20, notes: scrNotes },
    { name: "Estructura", score: struct, max: 15, notes: structNotes },
    { name: "CTA", score: ctaScore, max: 10, notes: ctaNotes },
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
