import { Frame } from "./Frame.tsx";
import { fitDisplaySize } from "./fit.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface QuoteProps extends BaseSlideProps {
  /** Texto de la cita. */
  quote: string;
  /** Autor o fuente de la cita. */
  author?: string;
}

/**
 * Slide de cita destacada (sistema de marca). Comilla gigante en cian, cita en
 * Inter legible (auto-ajustada a su longitud) y autor apagado. La cita va en
 * Inter, no en Anton, para que las frases largas se lean bien.
 */
export function Quote({ quote, author, accent, ...base }: QuoteProps) {
  const cyan = accent ?? theme.colors.accent;
  return (
    <Frame {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 32 }}>
        <span style={{ fontFamily: theme.fonts.display, fontSize: 160, lineHeight: 0.6, color: cyan }}>“</span>
        <p
          style={{
            margin: 0,
            fontFamily: theme.fonts.body,
            fontWeight: 600,
            fontSize: fitDisplaySize(quote, theme.fontSize.title),
            lineHeight: 1.25,
            color: theme.colors.text,
          }}
        >
          {quote}
        </p>
        {author && (
          <span style={{ fontFamily: theme.fonts.body, fontSize: theme.fontSize.label, letterSpacing: "0.06em", color: theme.colors.textMuted }}>
            — {author}
          </span>
        )}
      </div>
    </Frame>
  );
}
