import { Frame } from "./Frame.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface QuoteProps extends BaseSlideProps {
  /** Texto de la cita. */
  quote: string;
  /** Autor o fuente de la cita. */
  author?: string;
}

/** Slide de cita destacada, centrada. */
export function Quote({ quote, author, accent, ...base }: QuoteProps) {
  return (
    <Frame {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 40 }}>
        <span style={{ fontSize: 160, lineHeight: 0.5, fontWeight: 800, color: accent ?? theme.colors.accent }}>
          “
        </span>
        <p style={{ margin: 0, fontSize: theme.fontSize.heading, lineHeight: 1.25, fontWeight: 700 }}>{quote}</p>
        {author && (
          <span style={{ fontSize: theme.fontSize.body, color: theme.colors.textMuted }}>— {author}</span>
        )}
      </div>
    </Frame>
  );
}
