import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { MonoLabel } from "./ui.tsx";
import { CONTENT_WIDTH } from "./fit.ts";
import { contentHeight, wrapLines, pickFill, CHAR_EM } from "./layout.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface LeadProps extends BaseSlideProps {
  /** Etiqueta superior opcional (ej. "EN 30 SEGUNDOS"). */
  kicker?: string;
  /** La promesa en 1 frase. ≤2 líneas. */
  text: string;
  /** Palabra de la frase a resaltar en lima. */
  highlight?: string;
}

/**
 * Rol 2 — Contexto / promesa. Una sola frase grande (Inter 600) con la palabra
 * clave en lima, precedida de una barra lima corta y un kicker mono.
 */
export function Lead({ kicker, text, highlight, accent, format, ...base }: LeadProps) {
  const lime = accent ?? theme.colors.accent;
  const reel = format === "reel";
  // Frase grande: el mayor tamaño (con tope) que cabe en ≤ 5 líneas (6 en el
  // reel, más alto) y en el área útil.
  const max = reel ? 116 : 84;
  const maxLines = reel ? 6 : 5;
  const lines = (s: number) => wrapLines(text, s * CHAR_EM.interSemibold, CONTENT_WIDTH);
  const size = pickFill(
    [116, 108, 100, 92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52].filter((s) => s <= max),
    (s) => (lines(s) > maxLines ? Infinity : 48 + lines(s) * s * 1.18),
    contentHeight(format, base.source),
    format,
  );
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div data-anim="rise" style={{ width: 72, height: 8, borderRadius: 4, backgroundColor: lime }} />
          {kicker && (
            <MonoLabel anim="rise" color={lime}>
              {kicker}
            </MonoLabel>
          )}
        </div>
        <p data-anim="words" style={{ margin: 0, fontFamily: theme.fonts.body, fontSize: size, fontWeight: 600, lineHeight: 1.18, letterSpacing: "-0.02em", textWrap: "pretty" }}>
          {highlightText(text, highlight, lime)}
        </p>
      </div>
    </Frame>
  );
}
