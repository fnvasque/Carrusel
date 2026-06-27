import { Frame } from "./Frame.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface BulletProps extends BaseSlideProps {
  /** Número o índice del slide (ej. "01"). Opcional. */
  step?: string;
  /** Título del punto. */
  heading: string;
  /** Cuerpo de texto. */
  body?: string;
  /** Lista de viñetas (alternativa o complemento a `body`). */
  bullets?: string[];
}

/** Slide de contenido: un punto con título y desarrollo. */
export function Bullet({
  step,
  heading,
  body,
  bullets,
  accent,
  ...base
}: BulletProps) {
  return (
    <Frame {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 36 }}>
        {step && (
          <span style={{ fontSize: theme.fontSize.heading, fontWeight: 800, color: accent ?? theme.colors.accent }}>
            {step}
          </span>
        )}
        <h2 style={{ margin: 0, fontSize: theme.fontSize.heading, lineHeight: 1.1, fontWeight: 700 }}>{heading}</h2>
        {body && (
          <p style={{ margin: 0, fontSize: theme.fontSize.body, lineHeight: 1.4, color: theme.colors.textMuted }}>
            {body}
          </p>
        )}
        {bullets && bullets.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 20 }}>
            {bullets.map((item, i) => (
              <li key={i} style={{ display: "flex", gap: 20, fontSize: theme.fontSize.body, lineHeight: 1.35 }}>
                <span style={{ color: accent ?? theme.colors.accent, fontWeight: 800 }}>•</span>
                <span style={{ color: theme.colors.textMuted }}>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Frame>
  );
}
