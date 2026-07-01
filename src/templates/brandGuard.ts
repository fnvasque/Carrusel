import type { Background, CarouselSpec, SlideSpec } from "./types.ts";
import { theme } from "../theme.ts";

/**
 * Guard de MARCA determinista sobre un CarouselSpec (sin render). Hace
 * estructuralmente imposible shipear un slide que viole la identidad clara:
 *  - fondo OSCURO (`color`/`gradient` de baja luminancia): el texto es tinta
 *    oscura fija, así que un fondo oscuro lo vuelve ilegible. Los fondos
 *    `ai`/`image` están EXENTOS (llevan scrim claro en Frame.scrimLayer).
 *  - handle incorrecto: toda prop `handle` debe ser exactamente
 *    `theme.brand.handle` ("ia.punto.es"). El wordmark `ia.es` del logo es otra
 *    cosa y no pasa por aquí.
 *
 * Es fail-closed: `assertBrandOk` lanza si hay violaciones (lo usan renderCarousel
 * y renderReel). Sin env de escape: bajo la identidad clara no hay caso legítimo.
 */

/** Luminancia mínima aceptable de un fondo `color`/`gradient` (WCAG rel. luminance). */
export const MIN_BG_LUMINANCE = 0.5;

export interface BrandViolation {
  /** Índice 1-based del slide. */
  slide: number;
  kind: "dark-background" | "wrong-handle";
  message: string;
  fix: string;
}

/** Luminancia relativa WCAG de un color hex (#rgb o #rrggbb). Hex inválido → 1 (no marca). */
export function relLuminance(hex: string): number {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return 1;
  const chan = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}

/** Extrae todos los colores hex de un string (color sólido o gradiente CSS). */
export function extractHexColors(input: string): string[] {
  return input.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) ?? [];
}

/** Luminancia de la stop MÁS oscura de un fondo `color`/`gradient`; null si no aplica. */
function darkestLuminance(bg: Background): number | null {
  const source = "color" in bg ? bg.color : "gradient" in bg ? bg.gradient : null;
  if (source == null) return null; // ai/image: exentos
  const hexes = extractHexColors(source);
  if (!hexes.length) return null; // sin hex (ej. rgba puro): nada que evaluar
  return Math.min(...hexes.map(relLuminance));
}

/** Detecta violaciones de marca en un carrusel. Vacío = todo OK. */
export function lintBrand(spec: CarouselSpec): BrandViolation[] {
  const violations: BrandViolation[] = [];
  const slides = spec.slides ?? [];
  slides.forEach((slide: SlideSpec, i) => {
    const idx = i + 1;
    const props = { ...spec.defaults, ...slide.props } as Record<string, unknown>;

    // 1) Fondo oscuro (solo color/gradient; ai/image exentos).
    const bg = props.background as Background | undefined;
    if (bg) {
      const lum = darkestLuminance(bg);
      if (lum !== null && lum < MIN_BG_LUMINANCE) {
        violations.push({
          slide: idx,
          kind: "dark-background",
          message: `Slide ${idx}: fondo oscuro (luminancia ${lum.toFixed(3)} < ${MIN_BG_LUMINANCE}). El texto es tinta oscura → ilegible.`,
          fix: "Quita el `background` (hereda la superficie crema de marca) o usa `{ ai }`/`{ image }` con overlay.",
        });
      }
    }

    // 2) Handle incorrecto (solo si el slide declara `handle`).
    const handle = props.handle;
    if (typeof handle === "string" && handle !== theme.brand.handle) {
      violations.push({
        slide: idx,
        kind: "wrong-handle",
        message: `Slide ${idx}: handle "${handle}" != "${theme.brand.handle}".`,
        fix: `Usa el handle de marca "${theme.brand.handle}" (o quita la prop para tomar el default).`,
      });
    }
  });
  return violations;
}

export function printBrandViolations(name: string, violations: BrandViolation[]): void {
  console.error(`\n⛔ Guard de marca — ${name}: ${violations.length} violación(es)\n`);
  for (const v of violations) {
    console.error(`  • [${v.kind}] ${v.message}`);
    console.error(`      fix: ${v.fix}`);
  }
  console.error("");
}

/** Fail-closed: lanza si el carrusel viola la marca. Lo usan renderCarousel/renderReel. */
export function assertBrandOk(spec: CarouselSpec): void {
  const violations = lintBrand(spec);
  if (violations.length) {
    printBrandViolations(spec.name, violations);
    throw new Error(
      `Guard de marca: ${violations.length} violación(es) en "${spec.name}" (fondo oscuro / handle). No se renderiza.`,
    );
  }
}
