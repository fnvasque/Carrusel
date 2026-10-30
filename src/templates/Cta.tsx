import { Frame } from "./Frame.tsx";
import { highlightText, frasesNowrap } from "./highlight.tsx";
import { fitDisplaySize, displayLineHeight } from "./fit.ts";
import { contentHeight, displayHeight, interHeight, pickFill } from "./layout.ts";
import { Firma } from "./Frame.tsx";
import { BookmarkIcon, PillIcon, titular, type PillIconName } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme, monoText } from "../theme.ts";

export interface CtaProps extends BaseSlideProps {
  /** Invitación principal (ej. "Lo que importa en IA, en tu correo"). */
  title: string;
  /** Palabra del título con el marcador lima detrás. */
  highlight?: string;
  /** Frase del título en Instrument Serif cursiva (como en el Hook). */
  cursiva?: string;
  /** Razón concreta (ej. "Cada semana. Sin hype."). En la caja de mensaje es la pista bajo la burbuja. */
  reason?: string;
  /** Handle de la cuenta (sin @). */
  handle?: string;
  /** Texto de la pastilla (si trae la palabra PARTIR, se dibuja como mensaje directo). Por defecto "Link en bio". Los emoji se quitan (el render los pinta mal). */
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

/** La pieza pide mandar «PARTIR» por mensaje directo (en el `cta` o en el título). */
export function pideDm(...textos: (string | undefined)[]): boolean {
  return textos.some((t) => t !== undefined && /\bPARTIR\b/.test(t));
}

/** Pista bajo la burbuja cuando la pieza no trae `reason`. */
export const DM_PISTA = "Escríbeme esto por mensaje y te respondo yo.";

/**
 * Rol 5 — Cierre. Titular Inter 700 con el marcador lima. Si la pieza pide
 * «PARTIR» (pivote a coaching), el cierre se dibuja como un mensaje directo:
 * tarjeta blanca con la firma, la burbuja tinta «PARTIR» a la derecha y la
 * pista debajo. Si no, pastilla tinta con texto blanco (e ícono) y la razón.
 * La palabra aparece una sola vez (en la burbuja) aunque el título también la
 * lleve: el título se deja tal como está escrito.
 */
export function Cta({ title, highlight, cursiva, reason, handle, cta, ctaIcon, accent: _accent, format, ...base }: CtaProps) {
  const pill = pillContent(cta, ctaIcon);
  const dm = pideDm(pill.text, title);
  // Con la caja de mensaje directo el remitente ya dice @ia.punto.es: no se repite el handle suelto.
  const verHandle = Boolean(handle) && !dm;
  const reel = format === "reel";
  const keep = frasesNowrap(highlight, undefined, cursiva);
  // Reel: escala mayor que llena el 9:16 (el post queda con sus medidas fijas).
  const post = { title: theme.fontSize.title, icon: 104, reason: 44, pill: 40, handle: 30, gap: 44, k: 1 };
  // Reel: escalas mayores que llenan el 9:16. Post: solo se achica si el titular, la caja y una
  // fuente larga no caben (si no, el handle choca con la fuente al pie).
  const escalas = reel ? [1.45, 1.35, 1.25, 1.15, 1.05, 1.0] : [1, 0.92, 0.85, 0.78, 0.72];
  const sc = pickFill(
    escalas.map((s) =>
      reel
        ? {
            title: Math.round(theme.fontSize.title * s),
            icon: Math.min(144, Math.round(104 * s)),
            reason: s >= 1.2 ? 54 : 48,
            pill: s >= 1.2 ? 48 : 44,
            handle: s >= 1.2 ? 36 : 32,
            gap: Math.round(44 * Math.min(1.3, s)),
            k: Math.min(1.25, s),
          }
        : { title: Math.round(post.title * s), icon: Math.round(post.icon * s), reason: post.reason, pill: post.pill, handle: post.handle, gap: Math.round(post.gap * Math.max(s, 0.85)), k: s },
    ),
    (c) => {
      let h = c.gap + displayHeight(title, fitDisplaySize(title, c.title, { maxLines: 4, tight: reel, keep }), displayLineHeight(title, 0.98), undefined, true, keep);
      if (dm) h += c.gap + dmHeight(c.k);
      else {
        h += c.icon + c.gap;
        if (reason) h += c.gap + interHeight(reason, c.reason, 840, 1.3);
        h += c.gap + c.pill * 1.2 + 44;
      }
      return h + (verHandle ? c.gap + c.handle * 1.3 : 0);
    },
    contentHeight(format, base.source, base.narracion, base.subtitulos),
    format,
  );
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", flex: 1, gap: sc.gap }}>
        {!dm && (
          <div data-anim="rise" style={{ display: "flex" }}>
            <BookmarkIcon size={sc.icon} color={theme.colors.ink} />
          </div>
        )}
        <h2
          data-anim="words"
          style={{
            ...titular,
            fontSize: fitDisplaySize(title, sc.title, { maxLines: 4, tight: reel, keep }),
            textWrap: "balance",
            lineHeight: displayLineHeight(title, 0.98),
          }}
        >
          {highlightText(title, highlight, theme.colors.accent, undefined, theme.colors.ink, cursiva)}
        </h2>
        {dm ? (
          <DmBox k={sc.k} pista={reason ?? DM_PISTA} />
        ) : (
          <>
            {reason && (
              <p data-anim="rise" style={{ margin: 0, maxWidth: 840, fontFamily: theme.fonts.body, fontSize: sc.reason, lineHeight: 1.3, color: theme.colors.textSoft, textWrap: "pretty" }}>
                {reason}
              </p>
            )}
            <span
              data-anim="rise"
              style={{
                fontFamily: theme.fonts.body,
                fontSize: sc.pill,
                fontWeight: 700,
                color: theme.colors.card,
                backgroundColor: theme.colors.ink,
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
          </>
        )}
        {verHandle && (
          <span data-anim="rise" data-cta="handle" style={{ ...monoText, fontSize: sc.handle, letterSpacing: "0.04em", color: theme.colors.textMuted }}>
            @{handle}
          </span>
        )}
      </div>
    </Frame>
  );
}

/** Alto estimado (px) de la caja de mensaje, a escala `k`: relleno + cabecera + burbuja + pista. */
function dmHeight(k: number): number {
  return Math.round(k * (2 * 40 + 60 + 28 + (46 * 1.2 + 44) + 18 + 26 * 1.3));
}

/** Caja de mensaje directo: tarjeta blanca, firma arriba, burbuja tinta «PARTIR» a la derecha, pista debajo. */
function DmBox({ k, pista }: { k: number; pista: string }) {
  const n = (v: number) => Math.round(v * k);
  return (
    <div
      data-cta="dm"
      data-anim="rise"
      style={{ backgroundColor: theme.colors.card, borderRadius: 40, padding: n(40), width: n(760), maxWidth: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", marginTop: n(12) }}
    >
      <div style={{ marginBottom: n(28) }}>
        <Firma circulo={n(60)} nombre={n(30)} />
      </div>
      <span
        data-cta="burbuja"
        style={{
          alignSelf: "flex-end",
          backgroundColor: theme.colors.ink,
          color: theme.colors.card,
          borderRadius: n(30),
          borderBottomRightRadius: n(8),
          padding: `${n(22)}px ${n(36)}px`,
          fontFamily: theme.fonts.body,
          fontWeight: 700,
          fontSize: n(46),
          lineHeight: 1.2,
          letterSpacing: "0.04em",
        }}
      >
        PARTIR
      </span>
      <span style={{ marginTop: n(18), textAlign: "right", fontFamily: theme.fonts.body, fontSize: n(26), lineHeight: 1.3, color: theme.colors.textMuted }}>{pista}</span>
    </div>
  );
}
