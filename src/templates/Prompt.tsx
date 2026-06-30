import { Frame } from "./Frame.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface PromptProps extends BaseSlideProps {
  /** Título del slide. ≤6 palabras. */
  heading: string;
  /** El prompt copiable (se muestra en monoespaciada sobre un panel). */
  prompt: string;
  /** Nota o variante opcional bajo el prompt. */
  note?: string;
}

/**
 * Rol — Truco / Prompt (pilar Prompt). Bloque de prompt copiable en monoespaciada
 * sobre un panel; muy guardable. La etiqueta "COPIA ESTE PROMPT" va en cian.
 */
export function Prompt({ heading, prompt, note, accent, ...base }: PromptProps) {
  const cyan = accent ?? theme.colors.accent;
  return (
    <Frame {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 32 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontSize: theme.fontSize.heading,
            lineHeight: 1.05,
            textTransform: "uppercase",
          }}
        >
          {heading}
        </h2>
        <span
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSize.label,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: cyan,
          }}
        >
          Copia este prompt
        </span>
        <div
          style={{
            backgroundColor: theme.colors.panel,
            border: `1px solid ${theme.surface.panelBorder}`,
            borderLeft: `6px solid ${cyan}`,
            borderRadius: 16,
            padding: 40,
            fontFamily: theme.fonts.mono,
            fontSize: theme.fontSize.code,
            lineHeight: 1.4,
            color: theme.colors.text,
            whiteSpace: "pre-wrap",
            boxShadow: theme.surface.panelShadow,
          }}
        >
          {prompt}
        </div>
        {note && (
          <p style={{ margin: 0, fontFamily: theme.fonts.body, fontSize: theme.fontSize.body, lineHeight: 1.4, color: theme.colors.textMuted }}>
            {note}
          </p>
        )}
      </div>
    </Frame>
  );
}
