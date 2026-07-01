import type { Pillar } from "./templates/types.ts";

/**
 * Valores de diseño por defecto, reutilizables por las plantillas.
 * Fuente única de tokens de marca (deriva de .context/design-brand.md):
 * navy + cian, tipografía Anton/Inter/JetBrainsMono, regla 60-30-10.
 * Cambia aquí para ajustar el "look" global, o sobreescribe por slide vía props.
 */
export const theme = {
  // Pila de fallback si no hay Inter-*.woff2 en src/fonts/. Los titulares usan
  // Anton vía las plantillas; el cuerpo, Inter.
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  /** Familias de marca. Deben coincidir con el nombre de archivo en src/fonts/ (Familia-Peso.ext). */
  fonts: {
    display: "Anton", // (legacy) titular condensado; el rebrand usa `serif`
    serif: "PlayfairDisplay", // titulares editoriales mayúscula/minúscula
    body: "Inter", // cuerpo
    mono: "JetBrainsMono", // prompts / código
  },
  colors: {
    // Identidad CLARA/editorial (rebrand): crema + tinta oscura, acentos cian/rosa.
    bg: "#FBFAF7", // Fondo crema editorial
    panel: "#FFFFFF", // tarjetas/paneles claros
    panel2: "#F4F1EA", // panel alterno (crema)
    accent: "#22D3EE", // Cian — acento primario (marcador/subrayado)
    violet: "#8B5CF6", // chip pilar Noticia
    pink: "#F471B5", // Rosa — acento secundario
    green: "#1FA97A", // verde con contraste sobre claro (realidad)
    text: "#0B1020", // tinta (texto principal sobre claro)
    textMuted: "#5B6472", // gris cálido
  },
  /** Escala tipográfica en px, pensada para un lienzo de 1080x1350. */
  fontSize: {
    display: 128, // Hook (Anton)
    title: 96,
    heading: 64,
    kicker: 40, // número de paso (Anton)
    code: 34, // prompt / código (JetBrains Mono)
    lead: 50, // promesa (Inter 600)
    body: 44,
    caption: 32,
    label: 28, // eyebrow / chip / fuente al pie (Inter 700, UPPER)
  },
  /** Margen interior estándar del lienzo (escala de marca 96 / 120 / 160). */
  padding: 120,
  /** Tracking (letter-spacing) de titulares Anton: apretado para look poster. */
  tracking: {
    display: "-0.02em",
    tight: "-0.01em",
  },
  /**
   * Superficie de marca por defecto (cuando un slide no trae `background`):
   * navy → near-black con un glow cian. Reemplaza el navy plano "barato".
   */
  surface: {
    bgDeep: "#F1EDE3", // crema profunda para el gradiente base
    glow: "rgba(34,211,238,0.10)", // glow cian tenue sobre claro
    /** Líneas finas / bordes de baja opacidad (tinta sobre claro). */
    hairline: "rgba(11,16,32,0.10)",
    panelBorder: "rgba(11,16,32,0.08)",
    /** Sombra suave para tarjetas sobre fondo claro. */
    panelShadow: "0 14px 40px rgba(11,16,32,0.08)",
    /** Viñeta clarísima (casi nula) sobre fondo claro. */
    vignette: "radial-gradient(120% 90% at 50% 45%, transparent 70%, rgba(11,16,32,0.05) 100%)",
    /** Cuadrícula editorial sutil (papel de cuaderno). */
    grid: "repeating-linear-gradient(0deg, rgba(11,16,32,0.035) 0 1px, transparent 1px 46px), repeating-linear-gradient(90deg, rgba(11,16,32,0.035) 0 1px, transparent 1px 46px)",
  },
  /** Escala de espaciado 8-pt para un ritmo visual coherente entre plantillas. */
  space: {
    xs: 8,
    sm: 16,
    md: 24,
    lg: 40,
    xl: 64,
    xxl: 96,
  },
} as const;

/** Color del chip según el pilar de contenido (design-brand.md §5). */
export function pillarColor(pillar?: Pillar): string {
  switch (pillar) {
    case "noticia":
      return theme.colors.violet;
    case "curiosidad":
      return theme.colors.pink;
    case "herramienta":
    case "prompt":
    default:
      return theme.colors.accent;
  }
}

/**
 * Tinte del glow de la superficie de marca según el pilar (ambiente secundario,
 * NO el keyword del titular, que sigue cian). rgba a baja opacidad para textura.
 */
export function pillarGlow(pillar?: Pillar): string {
  switch (pillar) {
    case "noticia":
      return "rgba(139,92,246,0.16)"; // violeta #8B5CF6
    case "curiosidad":
      return "rgba(244,113,181,0.16)"; // rosa #F471B5
    case "herramienta":
    case "prompt":
    default:
      return "rgba(34,211,238,0.16)"; // cian #22D3EE
  }
}
