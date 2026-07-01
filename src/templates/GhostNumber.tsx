import { theme } from "../theme.ts";

/** Extrae 1-2 dígitos de una etiqueta (ej. "Nº1"→"1", "01"→"01"); "" si no hay. */
export function digitsOf(label?: string): string {
  return label?.match(/\d{1,2}/)?.[0] ?? "";
}

/**
 * Número gigante Anton como TEXTURA editorial detrás del contenido (marca de agua
 * cian a baja opacidad). Da escala y ritmo sin competir con el texto: queda detrás
 * (zIndex 0), no es interactivo y lo recorta el `overflow:hidden` del Frame.
 * En la mitad superior para no invadir la zona segura inferior del Reel.
 * Si no hay `value`, no renderiza nada.
 */
export function GhostNumber({ value, color }: { value?: string; color?: string }) {
  if (!value) return null;
  return (
    <span
      style={{
        position: "absolute",
        top: -40,
        right: -20,
        fontFamily: theme.fonts.serif,
        fontWeight: 800,
        fontSize: 300,
        lineHeight: 1,
        color: color ?? theme.colors.accent,
        opacity: 0.14,
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 0,
      }}
    >
      {value}
    </span>
  );
}
