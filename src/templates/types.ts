import type { ComponentType } from "react";

/**
 * Dimensiones del lienzo. Por defecto el formato vertical de carrusel de
 * Instagram (relación 4:5), que es el que mejor aprovecha el feed.
 */
export const CANVAS = { width: 1080, height: 1350 } as const;

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
  | { ai: string; overlay?: number }
  /** Ruta a una imagen local ya existente, o forma resuelta de un fondo `ai`. */
  | { image: string; overlay?: number };

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
