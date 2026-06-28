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
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 32 }}>
        <div style={{ width: 96, height: 4, backgroundColor: cyan }} />
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
        <p style={{ margin: 0, fontFamily: theme.fonts.body, fontSize: theme.fontSize.lead, fontWeight: 600, lineHeight: 1.3 }}>
          {highlightText(text, highlight, cyan)}
        </p>
      </div>
    </Frame>
  );
}
