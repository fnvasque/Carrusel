import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { MonoLabel } from "./ui.tsx";
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
  // Frase grande: protagonista del slide. Si es larga, baja un escalón.
  const size = (text.length <= 72 ? 80 : text.length <= 110 ? theme.fontSize.lead : 58) + (reel ? 10 : 0);
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
