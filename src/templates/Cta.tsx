import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { fitDisplaySize } from "./fit.ts";
import { contentHeight, antonHeight, interHeight, pickFill } from "./layout.ts";
import { BookmarkIcon, PillIcon, type PillIconName } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme, monoText } from "../theme.ts";

export interface CtaProps extends BaseSlideProps {
  /** Invitación principal (ej. "Lo que importa en IA, en tu correo"). */
  title: string;
  /** Palabra del título a resaltar en lima. */
  highlight?: string;
  /** Razón concreta (ej. "Cada semana. Sin hype."). */
  reason?: string;
  /** Handle de la cuenta (sin @). */
  handle?: string;
  /** Texto de la pastilla. Por defecto "Link en bio". Los emoji se quitan (el render los pinta mal). */
  cta?: string;
  /** Ícono al final de la pastilla. Por defecto: "bookmark" si el texto traía 🔖, "share" si traía ↗; si no, ninguno. */
  ctaIcon?: PillIconName | "none";
}

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/** Texto e ícono de la pastilla: sin emoji; 🔖 → ícono bookmark, ↗ → ícono share. */
export function pillContent(cta: string | undefined, icon?: PillIconName | "none"): { text: string; icon?: PillIconName } {
  const raw = cta ?? "Link en bio →";
  const text = raw.replace(EMOJI, "").replace(/\s+/g, " ").trim();
  // ↗ y otras flechas U+2194-2199 son "pictográficas": se quitan y ↗ pasa a ícono.
  const inferred: PillIconName | undefined = raw.includes("🔖") ? "bookmark" : raw.includes("↗") ? "share" : undefined;
  const chosen = icon === "none" ? undefined : (icon ?? inferred);
  return { text, icon: chosen };
}

/**
 * Rol 5 — CTA al newsletter (objetivo de negocio). Ícono de guardar en lima,
 * titular Anton gigante con la palabra clave en lima, razón en Inter, pastilla
 * lima con texto oscuro y handle mono. No es "sígueme".
 */
export function Cta({ title, highlight, reason, handle, cta, ctaIcon, accent, format, ...base }: CtaProps) {
  const lime = accent ?? theme.colors.accent;
  const pill = pillContent(cta, ctaIcon);
  const reel = format === "reel";
  // Reel: escala mayor que llena el 9:16 (el post queda con sus medidas fijas).
  const post = { title: theme.fontSize.title, icon: 104, reason: 44, pill: 40, handle: 30, gap: 44 };
  const sc = reel
    ? pickFill(
        [1.45, 1.35, 1.25, 1.15, 1.05, 1.0].map((s) => ({
          title: Math.round(theme.fontSize.title * s),
          icon: Math.min(144, Math.round(104 * s)),
          reason: s >= 1.2 ? 54 : 48,
          pill: s >= 1.2 ? 48 : 44,
          handle: s >= 1.2 ? 36 : 32,
          gap: Math.round(44 * Math.min(1.3, s)),
        })),
        (c) => {
          let h = c.icon + c.gap + antonHeight(title, fitDisplaySize(title, c.title, { maxLines: 4, tight: true, keep: [highlight] }), 0.98, undefined, true, [highlight]);
          if (reason) h += c.gap + interHeight(reason, c.reason, 840, 1.3);
          return h + c.gap + c.pill * 1.2 + 44;
        },
        contentHeight(format, base.source),
        format,
      )
    : post;
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", flex: 1, gap: sc.gap }}>
        <div data-anim="rise" style={{ display: "flex" }}>
          <BookmarkIcon size={sc.icon} color={lime} />
        </div>
        <h2
          data-anim="words"
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontWeight: 400,
            fontSize: fitDisplaySize(title, sc.title, { maxLines: 4, tight: reel, keep: [highlight] }),
            textWrap: "balance",
            lineHeight: 0.98,
            textTransform: "uppercase",
          }}
        >
          {highlightText(title, highlight, lime)}
        </h2>
        {reason && (
          <p data-anim="rise" style={{ margin: 0, maxWidth: 840, fontFamily: theme.fonts.body, fontSize: sc.reason, lineHeight: 1.3, color: theme.colors.textSoft, textWrap: "pretty" }}>
            {reason}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <span
            data-anim="rise"
            style={{
              fontFamily: theme.fonts.body,
              fontSize: sc.pill,
              fontWeight: 700,
              color: theme.colors.onAccent,
              backgroundColor: lime,
              padding: "22px 40px",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            {pill.text}
            {pill.icon && <PillIcon name={pill.icon} />}
          </span>
          {handle && (
            <span data-anim="rise" style={{ ...monoText, fontSize: sc.handle, letterSpacing: "0.04em", color: theme.colors.text }}>
              @{handle}
            </span>
          )}
        </div>
      </div>
    </Frame>
  );
}
