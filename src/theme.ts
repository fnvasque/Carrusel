import type { Pillar } from "./templates/types.ts";

/**
 * Valores de diseño por defecto, reutilizables por las plantillas.
 * Fuente única de tokens de marca: look «papel con presencia» (A3, spec
 * 2026-10-29): papel claro liso, tinta, marcador lima detrás de la palabra
 * clave, titulares Inter 700 con frases en Instrument Serif cursiva.
 * Cambia aquí para ajustar el "look" global, o sobreescribe por slide vía props.
 */
export const theme = {
  // Pila de fallback si no hay Inter-*.woff2 en src/fonts/. Titulares y cuerpo
  // usan Inter (titulares a 700, tracking −0,04 em, tal como se escriben).
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  /** Familias de marca. Deben coincidir con el nombre de archivo en src/fonts/ (Familia-Peso.ext). */
  fonts: {
    display: "Inter", // titulares: Inter 700, sin mayúsculas forzadas, tracking −0,04 em
    serif: "InstrumentSerif", // frases en cursiva, n/total e iniciales de la firma
    body: "Inter", // cuerpo
    mono: "JetBrainsMono", // etiquetas, prompts y código
  },
  colors: {
    bg: "#ECECEA", // papel
    ink: "#111111", // tinta: texto principal, burbuja «Tú», barra de progreso
    card: "#FFFFFF", // tarjetas (chat, terminal, checklist)
    line: "#23232E", // borde de tarjetas y separadores (legado; el look papel no usa borde)
    accent: "#C6FF3D", // Lima — marcador detrás de la palabra clave
    onAccent: "#111111", // texto sobre lima (marcador, pastilla, círculo del check)
    violet: "#7C5CFF", // pilar Noticia
    pink: "#FF3D7F", // pilar Curiosidad; tachado del mito
    amber: "#FFB454", // pilar Trabajo (cómo cambia el trabajo con IA)
    text: "#111111", // = ink
    /** Texto secundario. */
    textSoft: "#555555",
    /** Texto apagado (etiquetas, fuente al pie). */
    textMuted: "#6B6B6B",
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
  /** Marcador lima detrás de la palabra clave: franja del 52 % al 92 % del alto de la línea. */
  marker: "linear-gradient(transparent 52%, #C6FF3D 52%, #C6FF3D 92%, transparent 92%)",
  /** Firma de la cuenta. La línea solo va en el Hook y en la story. */
  firma: {
    nombre: "@ia.punto.es",
    iniciales: "ia",
    linea: "Te ayudo a partir con la IA en tu trabajo",
  },
  /** Radio de las tarjetas (blancas, sin borde). */
  radius: 28,
  /** Escala tipográfica en px, pensada para un lienzo de 1080x1350. */
  fontSize: {
    display: 124, // Hook (Inter 700), máximo en post
    stat: 260, // valor de Stat (Inter 700 con marcador), máximo
    stepNumber: 92, // cifra del paso (serif cursiva, en el cuadro lima de 110 px)
    title: 124, // Cta, máximo
    heading: 84, // Step/Prompt/Screen (Inter 700), máximo en post
    myth: 72, // texto de la realidad (el mito va a 1,1× en serif)
    kicker: 48, // antetítulo en serif cursiva
    code: 36, // prompt / código (JetBrains Mono)
    lead: 84, // promesa (Inter 700), máximo en post
    body: 44, // cuerpo, mínimo 40 en post
    caption: 32,
    label: 24, // etiquetas (Inter 700 en mayúsculas: «Tú», «Copia esto», mito/realidad)
  },
  /** Margen interior estándar del lienzo. */
  padding: 96,
} as const;

/** Series de contenido (`config.json → series[].serie`, `plan.piezas[].serie`) → rótulo de la cabecera. */
export const SERIES: Record<string, string> = {
  "por-donde-partir": "Por dónde partir",
  "lo-que-construi": "Lo que construí",
};

/** Rótulo de una serie; `undefined` si no hay serie o no se conoce (la cabecera queda vacía). */
export function serieLabel(serie?: string): string | undefined {
  return serie ? SERIES[serie] : undefined;
}

/**
 * Estilo base de todo texto mono: JetBrains Mono SIN ligaduras, para que el
 * código se vea exactamente como se escribe (">=" no debe volverse "≥").
 */
export const monoText = {
  fontFamily: theme.fonts.mono,
  fontVariantLigatures: "none",
  fontFeatureSettings: '"liga" 0, "calt" 0',
} as const;

/** Color del pilar de contenido: herramienta/prompt → lima, noticia → violeta, curiosidad → rosa. */
export function pillarColor(pillar?: Pillar): string {
  switch (pillar) {
    case "noticia":
      return theme.colors.violet;
    case "curiosidad":
      return theme.colors.pink;
    case "trabajo":
      return theme.colors.amber;
    case "herramienta":
    case "prompt":
    default:
      return theme.colors.accent;
  }
}
