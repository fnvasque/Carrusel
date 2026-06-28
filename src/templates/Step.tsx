import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface StepProps extends BaseSlideProps {
  /** Número o índice del paso (ej. "01"). Opcional. */
  step?: string;
  /** Título del paso. ≤6 palabras. */
  heading: string;
  /** Palabra del heading a resaltar en cian. */
  highlight?: string;
  /** Cuerpo del paso. ≤240 caracteres. */
  body?: string;
  /** Lista de viñetas (alternativa o complemento a `body`). */
  bullets?: string[];
}

/**
 * Rol 3 — Paso del desarrollo (1 idea por slide). Número grande Anton + heading
 * MAYÚS + cuerpo o viñetas. El progreso NN/MM lo pinta `Frame` (index/total).
 */
export function Step({ step, heading, highlight, body, bullets, accent, ...base }: StepProps) {
  const cyan = accent ?? theme.colors.accent;
  return (
    <Frame {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 32 }}>
        {step && (
          <span style={{ fontFamily: theme.fonts.display, fontSize: theme.fontSize.kicker, color: cyan }}>{step}</span>
        )}
        <h2
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontSize: theme.fontSize.heading,
            lineHeight: 1.05,
            textTransform: "uppercase",
          }}
        >
          {highlightText(heading, highlight, cyan)}
        </h2>
        {body && (
          <p style={{ margin: 0, fontFamily: theme.fonts.body, fontSize: theme.fontSize.body, lineHeight: 1.45, color: theme.colors.textMuted }}>
            {body}
          </p>
        )}
        {bullets && bullets.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 20 }}>
            {bullets.map((item, i) => (
              <li key={i} style={{ display: "flex", gap: 20, fontFamily: theme.fonts.body, fontSize: theme.fontSize.body, lineHeight: 1.4 }}>
                <span style={{ color: cyan, fontWeight: 700 }}>—</span>
                <span style={{ color: theme.colors.textMuted }}>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Frame>
  );
}
