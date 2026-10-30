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
   * estilo visual de la marca (casi negro con acentos lima); `brandStyle: false` lo
   * desactiva para usar el prompt tal cual.
   */
  | { ai: string; overlay?: number; brandStyle?: boolean }
  /** Ruta a una imagen local ya existente, o forma resuelta de un fondo `ai`. */
  | { image: string; overlay?: number };

/**
 * Pilar de contenido de la marca (design-brand.md §5/§7). Fija el color del
 * chip que pinta `Frame`: herramienta/prompt → lima, noticia → violeta,
 * curiosidad → rosa.
 */
export type Pillar = "herramienta" | "noticia" | "prompt" | "curiosidad" | "trabajo";

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
  /** Sin efecto desde el look papel (ya no hay wordmark); se acepta para no romper borradores. */
  showLogo?: boolean;
  /**
   * Sin efecto desde el look papel (el wordmark `ia.es` ya no se pinta). Se
   * acepta para que los borradores y el calendario antiguos sigan validando.
   */
  logoEnCuadro0?: boolean;
  /**
   * Reel: la escena va sobre fondo negro con texto claro porque un video se mezcla debajo en
   * blend `lighten` (Clip; el Hook de un reel con `hookVideo`). Lo marca el calendario, no el usuario.
   */
  oscuro?: boolean;
  /** Serie de la pieza (`por-donde-partir`, `lo-que-construi`): su nombre va en la cabecera izquierda. */
  serie?: string;
  /** Post: la firma del pie lleva debajo la línea de la cuenta (`theme.firma.linea`). Por defecto false. */
  firmaLinea?: boolean;
  /** Formato de salida: "post" (4:5, por defecto) o "reel" (9:16). */
  format?: Format;
  /**
   * Reel: lo que la voz dice mientras se ve esta escena (6–18 palabras). El
   * motor la sintetiza (Kokoro) y alarga la escena hasta que quepa. Las
   * plantillas no la dibujan; en el carrusel se ignora.
   */
  narracion?: string;
  /**
   * Reel: pinta la narración como subtítulo quemado abajo (y el contenido le
   * deja su espacio). Por defecto apagado desde 2026-11-02 (pedido de Felipe:
   * demasiado texto); lo enciende `npm run reel -- --subtitulos` o
   * `_calendario/config.json → subtitulos: true`.
   */
  subtitulos?: boolean;
}

/** Un slide = una plantilla + sus props. */
export interface SlideSpec<P extends BaseSlideProps = BaseSlideProps> {
  template: ComponentType<P>;
  props: P;
}

/**
 * Ritmo del reel animado: `ensenar` (por defecto) deja leer, con escenas más
 * largas, entradas más lentas y bullets de a uno cada 1.8 s; `rapido` es el
 * ritmo ágil original; `gancho` (experimento de retención) arranca con el hook
 * en movimiento y ≤ 3 s, va rápido hasta el 20 % del reel, frena en el medio y
 * cierra más lento. No afecta al carrusel estático.
 */
export type Pace = "ensenar" | "rapido" | "gancho";

/** Un carrusel completo. `name` define la carpeta de salida en output/. */
export interface CarouselSpec {
  name: string;
  /** Ritmo del reel (`npm run reel`); por defecto "ensenar". `--pace` lo sobrescribe. */
  pace?: Pace;
  /** Valores por defecto aplicados a todos los slides (se pueden sobreescribir). */
  defaults?: Partial<BaseSlideProps>;
  slides: SlideSpec<any>[];
}
