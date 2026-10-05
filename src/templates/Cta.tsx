import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { fitDisplaySize } from "./fit.ts";
import { BookmarkIcon } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface CtaProps extends BaseSlideProps {
  /** Invitación principal (ej. "Lo que importa en IA, en tu correo"). */
  title: string;
  /** Palabra del título a resaltar en lima. */
  highlight?: string;
  /** Razón concreta (ej. "Cada semana. Sin hype."). */
  reason?: string;
  /** Handle de la cuenta (sin @). */
  handle?: string;
  /** Texto de la pastilla. Por defecto "Link en bio". */
  cta?: string;
}

/**
 * Rol 5 — CTA al newsletter (objetivo de negocio). Ícono de guardar en lima,
 * titular Anton gigante con la palabra clave en lima, razón en Inter, pastilla
 * lima con texto oscuro y handle mono. No es "sígueme".
 */
export function Cta({ title, highlight, reason, handle, cta, accent, format, ...base }: CtaProps) {
  const lime = accent ?? theme.colors.accent;
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", flex: 1, gap: 44 }}>
        <div data-anim="rise" style={{ display: "flex" }}>
          <BookmarkIcon size={104} color={lime} />
        </div>
        <h2
          data-anim="words"
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontWeight: 400,
            fontSize: fitDisplaySize(title, theme.fontSize.title + (format === "reel" ? 20 : 0), { maxLines: 4 }),
            textWrap: "balance",
            lineHeight: 0.98,
            textTransform: "uppercase",
          }}
        >
          {highlightText(title, highlight, lime)}
        </h2>
        {reason && (
          <p data-anim="rise" style={{ margin: 0, maxWidth: 840, fontFamily: theme.fonts.body, fontSize: format === "reel" ? 48 : 44, lineHeight: 1.3, color: theme.colors.textSoft, textWrap: "pretty" }}>
            {reason}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <span
            data-anim="rise"
            style={{
              fontFamily: theme.fonts.body,
              fontSize: 40,
              fontWeight: 700,
              color: theme.colors.onAccent,
              backgroundColor: lime,
              padding: "22px 40px",
              borderRadius: 999,
            }}
          >
            {cta ?? "Link en bio →"}
          </span>
          {handle && (
            <span data-anim="rise" style={{ fontFamily: theme.fonts.mono, fontSize: 30, letterSpacing: "0.04em", color: theme.colors.text }}>
              @{handle}
            </span>
          )}
        </div>
      </div>
    </Frame>
  );
}
