import { Frame } from "./Frame.tsx";
import { highlightText, frasesNowrap } from "./highlight.tsx";
import { Kicker, titular } from "./ui.tsx";
import { estimateLines, displayLineHeight } from "./fit.ts";
import { aire, contentHeight, pickFill } from "./layout.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface LeadProps extends BaseSlideProps {
  /** Antetítulo opcional en serif cursiva (ej. "En 30 segundos"). */
  kicker?: string;
  /** La promesa en 1 frase. ≤2 líneas. */
  text: string;
  /** Palabra de la frase con el marcador lima detrás. */
  highlight?: string;
  /** Frase (2-4 palabras) en Instrument Serif cursiva. */
  cursiva?: string;
}

/** Interlineado base de la frase (algo más abierto que el Hook: suele ir en 3-5 líneas). */
const LEAD_LH = 1.06;

/**
 * Rol 2 — Contexto / promesa. Una sola frase grande en Inter 700 (la escala de
 * los titulares) con la palabra clave sobre el marcador y, opcional, una frase
 * en serif cursiva; encima, un antetítulo en serif cursiva.
 */
export function Lead({ kicker, text, highlight, cursiva, accent: _accent, format, ...base }: LeadProps) {
  const reel = format === "reel";
  // Frase grande: el mayor tamaño (con tope) que cabe en ≤ 5 líneas (6 en el
  // reel, más alto) y en el área útil.
  const max = reel ? 116 : theme.fontSize.lead;
  const maxLines = reel ? 6 : 5;
  const keep = frasesNowrap(highlight, undefined, cursiva);
  const lh = displayLineHeight(text, LEAD_LH);
  const lines = (s: number) => estimateLines(text, s, undefined, reel, keep);
  const size = pickFill(
    [116, 108, 100, 92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52].filter((s) => s <= max),
    (s) => (lines(s) > maxLines ? Infinity : (kicker ? 56 + aire(40) : 0) + lines(s) * s * lh),
    contentHeight(format, base.source, base.narracion, base.subtitulos),
    format,
  );
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: aire(40) }}>
        {kicker && <Kicker anim="rise">{kicker}</Kicker>}
        <p data-anim="words" style={{ ...titular, fontSize: size, lineHeight: lh, textWrap: "pretty" }}>
          {highlightText(text, highlight, theme.colors.accent, undefined, undefined, cursiva)}
        </p>
      </div>
    </Frame>
  );
}
