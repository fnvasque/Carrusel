import type { Pillar } from "./templates/types.ts";

/**
 * Valores de diseño por defecto, reutilizables por las plantillas.
 * Fuente única de tokens de marca: look "lima" (spec 2026-10-05, tomado de
 * promo/reel-biblioteca/reel.html): fondo casi negro con grilla lima tenue y
 * viñeta, acento lima + violeta + rosa, tipografía Anton/Inter/JetBrainsMono.
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
    mono: "JetBrainsMono", // etiquetas, prompts y código
  },
  colors: {
    bg: "#06060A", // casi negro
    card: "#13131A", // tarjetas (chat, terminal, checklist)
    line: "#23232E", // borde de tarjetas y separadores
    accent: "#C6FF3D", // Lima — palabra clave del titular y números
    onAccent: "#06060A", // texto sobre lima (pastilla, círculo del check)
    violet: "#7C5CFF", // pilar Noticia
    pink: "#FF3D7F", // pilar Curiosidad; tachado del mito
    text: "#F4F4F6",
    /** Texto secundario dentro de tarjetas (más claro que textMuted). */
    textSoft: "#D8D8E0",
    textMuted: "#8A8A99",
    // Alias del look anterior (Cover/Bullet/Quote no se rediseñan).
    panel: "#13131A",
    panel2: "#1B1B24",
    green: "#C6FF3D",
  },
  /** Grilla de fondo: líneas lima al 7 %, 2 px, celda de 120 px. */
  grid: {
    color: "rgba(198,255,61,0.07)",
    line: 2,
    cell: 120,
  },
  /** Viñeta radial: transparente al 40 % → negro al 75 %. */
  vignette: "radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(0,0,0,0.75) 100%)",
  /** Radio de las tarjetas (rango de marca 36-44 px). */
  radius: 40,
  /** Escala tipográfica en px, pensada para un lienzo de 1080x1350. */
  fontSize: {
    display: 150, // Hook (Anton), máximo
    stat: 300, // número de Stat (Anton), máximo
    stepNumber: 168, // número de paso (Anton)
    title: 124, // Cta (Anton), máximo
    heading: 100, // Step/Prompt (Anton), máximo
    myth: 68, // texto de mito/realidad (Anton)
    kicker: 40,
    code: 36, // prompt / código (JetBrains Mono)
    lead: 68, // promesa (Inter 600)
    body: 42, // cuerpo, mínimo 40 en post
    caption: 32,
    label: 28, // etiquetas mono (cabecera, eyebrow, fuente)
  },
  /** Margen interior estándar del lienzo. */
  padding: 96,
} as const;

/** Color del pilar de contenido: herramienta/prompt → lima, noticia → violeta, curiosidad → rosa. */
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
