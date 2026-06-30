import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface LeadProps extends BaseSlideProps {
  /** Etiqueta superior opcional (ej. "EN 30 SEGUNDOS"). */
  kicker?: string;
  /** La promesa en 1 frase. ≤2 líneas. */
  text: string;
  /** Palabra de la frase a resaltar en cian. */
  highlight?: string;
}

/**
 * Rol 2 — Contexto / promesa. Una sola frase que baja la ansiedad, con un
 * respiro editorial (hairline). Tipografía Inter 600.
 */
export function Lead({ kicker, text, highlight, accent, ...base }: LeadProps) {
  const cyan = accent ?? theme.colors.accent;
  return (
    <Frame {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ width: 120, height: 5, backgroundColor: cyan }} />
          {kicker && (
            <span
              style={{
                fontFamily: theme.fonts.body,
                fontSize: theme.fontSize.label,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: cyan,
              }}
            >
              {kicker}
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontFamily: theme.fonts.serif, fontStyle: "italic", fontSize: theme.fontSize.title, fontWeight: 600, lineHeight: 1.12, color: theme.colors.text }}>
          {highlightText(text, highlight, cyan, "underline")}
        </p>
        <div style={{ width: "100%", height: 1, backgroundColor: theme.surface.hairline }} />
      </div>
    </Frame>
  );
}
