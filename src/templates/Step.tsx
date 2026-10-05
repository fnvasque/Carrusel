import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { fitDisplaySize } from "./fit.ts";
import { Card, CheckCircle } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface StepProps extends BaseSlideProps {
  /** Número o índice del paso (ej. "01"). Opcional. */
  step?: string;
  /** Título del paso. ≤6 palabras. */
  heading: string;
  /** Palabra del heading a resaltar en lima. */
  highlight?: string;
  /** Cuerpo del paso. ≤240 caracteres. */
  body?: string;
  /** Lista de viñetas (alternativa o complemento a `body`): se pintan como checklist. */
  bullets?: string[];
}

/**
 * Rol 3 — Paso del desarrollo (1 idea por slide). Número de paso grande en lima
 * (Anton) junto al heading MAYÚS; el cuerpo y las viñetas van dentro de una
 * tarjeta, y las viñetas son un checklist con círculo lima y ✓.
 */
export function Step({ step, heading, highlight, body, bullets, accent, format, ...base }: StepProps) {
  const lime = accent ?? theme.colors.accent;
  const hasBullets = !!bullets && bullets.length > 0;
  const hasCard = !!body || hasBullets;
  // Texto total de la tarjeta: si es largo, el cuerpo baja a 40 px (mínimo de marca).
  const cardChars = (body?.length ?? 0) + (bullets ?? []).reduce((a, b) => a + b.length, 0);
  const reel = format === "reel";
  const bodySize = (cardChars > 200 ? 40 : theme.fontSize.body) + (reel ? 6 : 0);
  const headingSize = fitDisplaySize(heading, theme.fontSize.heading + (reel ? 24 : 0), { maxLines: 2 });
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 44 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {step && (
            <span
              data-anim="rise"
              style={{ fontFamily: theme.fonts.display, fontSize: theme.fontSize.stepNumber + (reel ? 24 : 0), lineHeight: 0.9, color: lime, letterSpacing: "0.01em" }}
            >
              {step}
            </span>
          )}
          <h2
            data-anim="words"
            style={{
              margin: 0,
              fontFamily: theme.fonts.display,
              fontWeight: 400,
              fontSize: headingSize,
              lineHeight: 1.0,
              textTransform: "uppercase",
              textWrap: "balance",
            }}
          >
            {highlightText(heading, highlight, lime)}
          </h2>
        </div>
        {hasCard && (
          <Card anim="rise" style={{ padding: reel ? "56px 56px" : "48px 52px", display: "flex", flexDirection: "column", gap: 36 }}>
            {body && (
              <p style={{ margin: 0, fontFamily: theme.fonts.body, fontSize: bodySize, lineHeight: 1.4, color: theme.colors.textSoft, textWrap: "pretty" }}>{body}</p>
            )}
            {hasBullets && (
              <ul data-anim="stagger" style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 30 }}>
                {bullets!.map((item, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 28, fontFamily: theme.fonts.body, fontSize: bodySize, lineHeight: 1.3 }}>
                    <span style={{ display: "flex", paddingTop: (bodySize * 1.3 - 52) / 2 }}>
                      <CheckCircle color={lime} />
                    </span>
                    <span style={{ color: theme.colors.text, textWrap: "pretty" }}>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </Frame>
  );
}
