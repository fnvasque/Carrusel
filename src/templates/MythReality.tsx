import { Frame } from "./Frame.tsx";
import { Card, Etiqueta, titular } from "./ui.tsx";
import { highlightText, frasesNowrap } from "./highlight.tsx";
import { CONTENT_WIDTH, displayLineHeight, estimateLines } from "./fit.ts";
import { aire, cardPad, contentHeight, displayHeight, pickFill } from "./layout.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface MythRealityProps extends BaseSlideProps {
  /** Lo que se cree. */
  myth: string;
  /** Lo que de verdad pasa. */
  reality: string;
  /** Palabra(s) de `reality` con el marcador lima detrás. */
  highlight?: string;
  /** Etiqueta del bloque del mito. Por defecto "Lo que se cree". */
  mythLabel?: string;
  /** Etiqueta del bloque de la realidad. Por defecto "Lo que pasa". */
  realityLabel?: string;
}

/** Etiquetas por defecto (el lector frío de validar.mjs las copia; un test las compara). */
export const ETIQUETA_MITO = "Lo que se cree";
export const ETIQUETA_REALIDAD = "Lo que pasa";

/** La serif cursiva del mito es más angosta que Inter 700: se estima con el ancho de Inter × esto. */
const SERIF_ANCHO = 0.82;
/** Interlineados del mito (serif) y de la realidad (Inter 700). */
const MYTH_LH = 1.12;
const REAL_LH = 1.08;

/** Alto de la fila de la etiqueta (ícono 44 px) + su separación del texto. */
const FILA = 44 + 20;

/**
 * Rol — Mito vs Realidad (anti-hype). Arriba, lo que se cree: en serif cursiva
 * gris, con un ✕ gris, sobre el papel (sin tachado). Abajo, lo que pasa: en una
 * tarjeta blanca, Inter 700 tinta con el marcador en el `highlight` y un ✓ en
 * círculo lima. La realidad es la que pesa; el mito queda apagado.
 */
export function MythReality({ myth, reality, highlight, mythLabel = ETIQUETA_MITO, realityLabel = ETIQUETA_REALIDAD, format, accent: _accent, ...base }: MythRealityProps) {
  const reel = format === "reel";
  const PAD = cardPad(format);
  const keep = frasesNowrap(highlight);
  // Mayor tamaño (con tope) que deja los dos bloques dentro del área útil. El
  // mito va a 1,1× el tamaño de la realidad (la serif se ve más chica).
  const max = reel ? 96 : theme.fontSize.myth;
  const textW = CONTENT_WIDTH - 2 * PAD.x;
  const mythH = (size: number) => FILA + estimateLines(myth, size * 1.1 * SERIF_ANCHO, CONTENT_WIDTH) * size * 1.1 * MYTH_LH;
  const realH = (size: number) => 2 * PAD.y + FILA + displayHeight(reality, size, displayLineHeight(reality, REAL_LH), textW, reel, keep);
  const gap = aire(reel ? 56 : 44);
  const size = pickFill(
    [96, 88, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40].filter((s) => s <= max),
    (s) => mythH(s) + gap + realH(s),
    contentHeight(format, base.source, base.narracion, base.subtitulos),
    format,
  );
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap }}>
        <div data-anim="rise" data-mito="" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Fila tipo="mito" label={mythLabel} />
          <p style={{ margin: 0, fontFamily: theme.fonts.serif, fontStyle: "italic", fontWeight: 400, fontSize: Math.round(size * 1.1), lineHeight: MYTH_LH, letterSpacing: "-0.01em", color: theme.colors.textMuted, textWrap: "pretty" }}>
            {myth}
          </p>
        </div>
        <Card anim="rise" style={{ padding: `${PAD.y}px ${PAD.x}px`, display: "flex", flexDirection: "column", gap: 20 }}>
          <Fila tipo="realidad" label={realityLabel} />
          <p data-realidad="" style={{ ...titular, fontSize: size, lineHeight: displayLineHeight(reality, REAL_LH), textWrap: "pretty" }}>
            {highlightText(reality, highlight, theme.colors.accent)}
          </p>
        </Card>
      </div>
    </Frame>
  );
}

/** Ícono (✕ gris o ✓ en lima) + etiqueta. Sin etiqueta (""), solo el ícono. */
function Fila({ tipo, label }: { tipo: "mito" | "realidad"; label: string }) {
  const mito = tipo === "mito";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, height: 44 }}>
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxSizing: "border-box",
          backgroundColor: mito ? "transparent" : theme.colors.accent,
          border: mito ? `3px solid ${theme.colors.textMuted}` : "none",
        }}
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={mito ? theme.colors.textMuted : theme.colors.onAccent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
          {mito ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="m5 12 5 5 9-10" />}
        </svg>
      </span>
      {label && <Etiqueta color={mito ? theme.colors.textMuted : theme.colors.ink}>{label}</Etiqueta>}
    </div>
  );
}
