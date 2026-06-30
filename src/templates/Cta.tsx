import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { fitDisplaySize } from "./fit.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface CtaProps extends BaseSlideProps {
  /** Invitación principal (ej. "Lo que importa en IA, en tu correo"). */
  title: string;
  /** Palabra del título a resaltar en cian. */
  highlight?: string;
  /** Razón concreta (ej. "Cada semana. Sin hype."). */
  reason?: string;
  /** Handle de la cuenta (sin @). */
  handle?: string;
  /** Texto de la pastilla. Por defecto "📩 Link en bio". */
  cta?: string;
}

/**
 * Rol 5 — CTA al newsletter (objetivo de negocio). Funnel al correo: invitación
 * Anton, razón en Inter, pastilla cian y handle. No es "sígueme".
 */
export function Cta({ title, highlight, reason, handle, cta, accent, ...base }: CtaProps) {
  const cyan = accent ?? theme.colors.accent;
  return (
    <Frame {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", height: "100%", gap: 36 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontSize: fitDisplaySize(title, theme.fontSize.title),
            lineHeight: 0.96,
            textTransform: "uppercase",
            letterSpacing: theme.tracking.display,
          }}
        >
          {highlightText(title, highlight, cyan, "slab")}
        </h2>
        {reason && (
          <p style={{ margin: 0, fontFamily: theme.fonts.body, fontSize: theme.fontSize.lead, lineHeight: 1.3, color: theme.colors.textMuted }}>
            {reason}
          </p>
        )}
        <span
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSize.body,
            fontWeight: 700,
            color: theme.colors.bg,
            backgroundColor: cyan,
            padding: "20px 36px",
            borderRadius: 999,
          }}
        >
          {cta ?? "📩 Link en bio"}
        </span>
        {handle && (
          <span
            style={{
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSize.label,
              letterSpacing: "0.06em",
              color: theme.colors.textMuted,
            }}
          >
            @{handle}
          </span>
        )}
      </div>
    </Frame>
  );
}
