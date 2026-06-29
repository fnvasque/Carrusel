import type { Pillar, Format } from "../templates/types.ts";

/**
 * Tipos del pipeline de "remix de Instagram": ingesta → análisis → 2 variaciones.
 * Reutiliza los tipos de marca de `templates/types.ts` (Pillar, Format); no los
 * redefine. Todo aquí es estructura de datos plana, sin lógica.
 */

/** Tipo de pieza de Instagram detectada a partir de la URL. */
export type MediaType = "reel" | "post" | "carousel" | "unknown";

/** De dónde salió la `InstagramSource`: scraping público o input manual. */
export type SourceMode = "fetch" | "manual";

/** Confianza del análisis (baja cuando solo hay thumbnail o caption pobre). */
export type Confidence = "low" | "medium" | "high";

/** Variante de español del copy emitido. */
export type SpanishVariant = "neutro" | "cl";

/** Plantillas de marca soportadas por el remix (subconjunto de templates/index). */
export type TemplateName = "Hook" | "Lead" | "Step" | "Prompt" | "MythReality" | "Cta";

/** Contenido normalizado de un post de IG, listo para analizar. */
export interface InstagramSource {
  url?: string;
  type: MediaType;
  caption: string;
  hashtags: string[];
  /**
   * Todas las imágenes capturadas (data URIs): todas las slides de un carrusel o
   * varios frames de un reel. Es lo que consume analyzePost para el análisis
   * slide-por-slide.
   */
  mediaDataUris: string[];
  /** Thumbnail = primera imagen de mediaDataUris (compat con la caché de análisis). */
  thumbnailDataUri?: string;
  /** Rutas locales de imágenes pasadas manualmente con --image. */
  imagePaths?: string[];
  source: SourceMode;
  /** true cuando el análisis es parcial (reel sin caption, solo thumbnail, etc.). */
  partial: boolean;
}

/** Una unidad de copy del post original, mapeada a un rol de slide. */
export interface SlideCopy {
  role: string;
  text: string;
}

/** Análisis estructurado del post, salida del modelo multimodal. */
export interface PostAnalysis {
  hook: string;
  narrative: string[];
  pillar: Pillar;
  format: Format;
  copyPerSlide: SlideCopy[];
  visualStyle: string;
  languageDetected: string;
  tone: string;
  viralityHooks: string[];
  confidence: Confidence;
}

/** Fondo lógico de un slide, antes de serializarse a `Background`. */
export interface LogicalBackground {
  ai?: string;
  gradient?: string;
  color?: string;
  overlay?: number;
}

/** Un slide lógico: plantilla + props textuales + fondo, antes de emitir a .ts. */
export interface LogicalSlide {
  template: TemplateName;
  props: Record<string, string | string[] | number | boolean>;
  pillar?: Pillar;
  background?: LogicalBackground;
}

/** Una variación completa lista para serializarse a un CarouselSpec .ts. */
export interface VariationDraft {
  name: string;
  /** Ángulo/enfoque que diferencia esta variación de la otra. */
  angle: string;
  pillar: Pillar;
  slides: LogicalSlide[];
}

/** Opciones de invocación del comando remix. */
export interface RemixOptions {
  url?: string;
  caption?: string;
  image?: string[];
  es: SpanishVariant;
  outDir: string;
  /** Tras emitir, renderizar PNGs 4:5 de cada variación (--render). */
  render?: boolean;
  /** Tras emitir, componer el Reel 9:16 de cada variación (--reel). */
  reel?: boolean;
  /** Frames a extraer de un reel para el análisis (--frames=N, default 5). */
  frames?: number;
  /** Ruta a un archivo cookies.txt (Netscape) para yt-dlp (vence login wall). */
  cookies?: string;
  /** Navegador del que yt-dlp toma cookies (chrome/firefox/…). */
  cookiesFromBrowser?: string;
  /** Score de viralidad objetivo del loop de calidad (--min-score, default THRESHOLD=75). */
  minScore?: number;
  /** Intentos máximos de mejora por variación (--max-tries, default 3). */
  maxTries?: number;
  /** Desactiva el loop de calidad (--no-improve). */
  noImprove?: boolean;
}
