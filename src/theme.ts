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
    display: "Anton", // titulares, SIEMPRE en MAYÚSCULAS
    body: "Inter", // cuerpo
    mono: "JetBrainsMono", // prompts / código
  },
  colors: {
    bg: "#0B1020", // Fondo Noche
    panel: "#151D33",
    panel2: "#1C2640",
    accent: "#22D3EE", // Cian — palabra clave del titular SIEMPRE en cian (≤10%)
    violet: "#8B5CF6", // chip pilar Noticia
    pink: "#F471B5", // chip pilar Curiosidad
    green: "#34D399",
    text: "#E8ECF4",
    textMuted: "#94A0B8",
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
    bgDeep: "#070A12",
    glow: "rgba(34,211,238,0.16)",
    /** Líneas finas / bordes de baja opacidad (dark UI premium). */
    hairline: "rgba(255,255,255,0.08)",
    panelBorder: "rgba(255,255,255,0.06)",
    /** Sombra suave + realce superior para dar profundidad a los paneles. */
    panelShadow: "0 12px 40px rgba(0,0,0,0.35), inset 0 1px rgba(255,255,255,0.05)",
    /** Viñeta sutil de bordes, siempre presente, para profundidad de escena. */
    vignette: "radial-gradient(120% 90% at 50% 45%, transparent 60%, rgba(0,0,0,0.35) 100%)",
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
