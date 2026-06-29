import type { ComponentType } from "react";

/**
 * Formatos de salida. `post` es el carrusel 4:5 (1080×1350), el que mejor
 * aprovecha el feed. `reel` es el vertical 9:16 (1080×1920) para Reels.
 */
export type Format = "post" | "reel";

export const FORMATS = {
  post: { width: 1080, height: 1350 },
  reel: { width: 1080, height: 1920 },
} as const;

/** Alias del formato post (compatibilidad con usos existentes). */
export const CANVAS = FORMATS.post;

/**
 * Fondo de un slide. Tres formas mutuamente excluyentes:
 *  - color:   un color sólido (ej. "#0A0A0A")
 *  - gradient: un degradado CSS completo (ej. "linear-gradient(...)")
 *  - ai:      un prompt para generar la imagen de fondo con gpt-image-1
 *
 * `overlay` (0..1) oscurece el fondo para mejorar la legibilidad del texto;
 * útil sobre todo con fondos generados por IA.
 */
export type Background =
  | { color: string; overlay?: number }
  | { gradient: string; overlay?: number }
  /**
   * Prompt para generar la imagen con gpt-image-1. Por defecto se le anexa el
   * estilo visual de la marca (navy + cyan rim light); `brandStyle: false` lo
   * desactiva para usar el prompt tal cual.
   */
  | { ai: string; overlay?: number; brandStyle?: boolean }
  /** Ruta a una imagen local ya existente, o forma resuelta de un fondo `ai`. */
  | { image: string; overlay?: number };

/**
 * Pilar de contenido de la marca (design-brand.md §5/§7). Fija el color del
 * chip que pinta `Frame`: herramienta/prompt → cian, noticia → violeta,
 * curiosidad → rosa.
 */
export type Pillar = "herramienta" | "noticia" | "prompt" | "curiosidad";

/**
 * Props que comparten todas las plantillas. Cada plantilla puede añadir las
 * suyas, pero estas definen el control básico de diseño que pediste:
 * fuente, color de texto, tamaños y fondo.
 */
export interface BaseSlideProps {
  background?: Background;
  /** Familia tipográfica registrada en src/fonts (ej. "Inter"). */
  fontFamily?: string;
  /** Color del texto principal. */
  color?: string;
  /** Color de acento (subrayados, números, detalles). */
  accent?: string;
  /** Pilar de contenido → color del chip de marca en `Frame`. */
  pillar?: Pillar;
  /** Posición del slide en el carrusel (1-based) para el indicador de progreso. */
  index?: number;
  /** Total de slides del carrusel, para el indicador de progreso. */
  total?: number;
  /** Atribución al pie (ej. "Fuente: OpenAI"). */
  source?: string;
  /** Muestra el logo de marca arriba-izquierda. Por defecto true. */
  showLogo?: boolean;
  /** Formato de salida: "post" (4:5, por defecto) o "reel" (9:16). */
  format?: Format;
}

/** Un slide = una plantilla + sus props. */
export interface SlideSpec<P extends BaseSlideProps = BaseSlideProps> {
  template: ComponentType<P>;
  props: P;
}

/** Un carrusel completo. `name` define la carpeta de salida en output/. */
export interface CarouselSpec {
  name: string;
  /** Valores por defecto aplicados a todos los slides (se pueden sobreescribir). */
  defaults?: Partial<BaseSlideProps>;
  slides: SlideSpec<any>[];
}
