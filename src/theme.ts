/**
 * Valores de diseño por defecto, reutilizables por las plantillas.
 * Cambia aquí para ajustar el "look" global, o sobreescribe por slide
 * mediante props.
 */
export const theme = {
  // "Inter" se usa si dejas un Inter-*.woff2 en src/fonts/; si no, cae a la
  // pila del sistema para que el render nunca quede en una serif fea.
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  colors: {
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.72)",
    accent: "#A78BFA",
    bg: "#0A0A0A",
  },
  /** Escala tipográfica en px, pensada para un lienzo de 1080x1350. */
  fontSize: {
    title: 96,
    heading: 64,
    body: 44,
    caption: 32,
  },
  /** Margen interior estándar del lienzo. */
  padding: 96,
} as const;
