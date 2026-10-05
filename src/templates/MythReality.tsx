import { Frame } from "./Frame.tsx";
import { Card } from "./ui.tsx";
import { CONTENT_WIDTH } from "./fit.ts";
import { contentHeight, antonHeight, pickFit } from "./layout.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme, monoText } from "../theme.ts";

export interface MythRealityProps extends BaseSlideProps {
  /** El mito / lo que se cree. */
  myth: string;
  /** La realidad / lo que de verdad pasa. */
  reality: string;
  /** Etiqueta del bloque mito. Por defecto "EL MITO". */
  mythLabel?: string;
  /** Etiqueta del bloque realidad. Por defecto "LA REALIDAD". */
  realityLabel?: string;
}

/**
 * Rol — Mito vs Realidad (pilar Curiosidad, anti-hype). Dos tarjetas: el mito
 * apagado y tachado en rosa (línea estática en post, animada por línea en el
 * reel), la realidad con borde lima y texto blanco.
 */
export function MythReality({
  myth,
  reality,
  mythLabel = "El mito",
  realityLabel = "La realidad",
  format,
  accent,
  ...base
}: MythRealityProps) {
  const lime = accent ?? theme.colors.accent;
  const reel = format === "reel";
  // Mayor tamaño (con tope) que deja las dos tarjetas dentro del área útil.
  const max = reel ? 84 : 76;
  const textW = CONTENT_WIDTH - 104 - 6;
  const cardH = (t: string, size: number) => 44 + 52 + 6 + 44 + 24 + antonHeight(t, size, 1.08, textW);
  const size = pickFit(
    [96, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44].filter((s) => s <= max),
    (s) => cardH(myth, s) + cardH(reality, s) + 28,
    contentHeight(format, base.source),
  );
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 28 }}>
        <Panel kind="myth" label={mythLabel} text={myth} size={size} reel={reel} lime={lime} />
        <Panel kind="reality" label={realityLabel} text={reality} size={size} reel={reel} lime={lime} />
      </div>
    </Frame>
  );
}

function Panel({ kind, label, text, size, reel, lime }: { kind: "myth" | "reality"; label: string; text: string; size: number; reel: boolean; lime: string }) {
  const myth = kind === "myth";
  const tone = myth ? theme.colors.pink : lime;
  const p = (
    <p
      style={{
        margin: 0,
        fontFamily: theme.fonts.display,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1.08,
        textTransform: "uppercase",
        color: myth ? theme.colors.textMuted : theme.colors.text,
        // Post: tachado rosa estático (sigue cada línea). En el reel lo dibuja el runtime.
        ...(myth && !reel
          ? { textDecorationLine: "line-through", textDecorationColor: theme.colors.pink, textDecorationThickness: 6 }
          : {}),
      }}
    >
      {text}
    </p>
  );
  return (
    <Card
      anim="rise"
      borderColor={myth ? theme.colors.line : lime}
      style={{
        padding: "44px 52px 52px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        ...(myth ? { backgroundColor: "#0E0E14" } : { borderWidth: 3, boxShadow: "0 24px 60px rgba(0,0,0,0.45), 0 0 0 8px rgba(198,255,61,0.06)" }),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: myth ? "transparent" : lime,
            border: myth ? `3px solid ${tone}` : "none",
            boxSizing: "border-box",
          }}
        >
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={myth ? tone : theme.colors.onAccent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            {myth ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="m5 12 5 5 9-10" />}
          </svg>
        </span>
        <span style={{ ...monoText, fontSize: theme.fontSize.label, letterSpacing: "0.16em", textTransform: "uppercase", color: tone }}>
          {label}
        </span>
      </div>
      {/* El wrapper solo existe con strike (reel) para no alterar el DOM del post. */}
      {myth && reel ? (
        <div style={{ position: "relative" }}>
          {p}
          <div
            data-anim="strike"
            style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 8, marginTop: -4, backgroundColor: theme.colors.pink, transformOrigin: "left center" }}
          />
        </div>
      ) : (
        p
      )}
    </Card>
  );
}
