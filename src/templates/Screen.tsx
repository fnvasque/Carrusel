import { Frame } from "./Frame.tsx";
import { fitDisplaySize, CONTENT_WIDTH, displayLineHeight } from "./fit.ts";
import { contentHeight, antonHeight, interHeight, pickFill, CHAR_EM, REEL_FILL } from "./layout.ts";
import { Card } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme, monoText } from "../theme.ts";

export interface ScreenProps extends BaseSlideProps {
  /** Nombre de la IA que se ve en pantalla (ChatGPT, Gemini, NotebookLM…). ≤ 3 palabras. */
  app: string;
  /** Lo que la persona escribe (se teclea en el reel). ≤ 30 palabras. */
  prompt: string;
  /** Lo que la IA contesta, textual y verificado. ≤ 45 palabras. */
  respuesta: string;
  /** Título opcional sobre la ventana. ≤ 6 palabras. */
  heading?: string;
  /** Nota opcional bajo la ventana (dónde está la función, si es gratis…). */
  nota?: string;
}

/** Etiqueta del mensaje de la persona. */
export const ETIQUETA_TU = "Tú";

/**
 * Rol — La IA haciéndolo (pilar Herramienta). Ventana de chat con el prompt
 * que la persona escribe (`data-anim="type"`, con cursor) y la respuesta de la
 * IA que aparece debajo (`data-anim="words"`). Es la prueba visual de la
 * pieza: el espectador ve la herramienta hacer lo que el reel promete.
 */
export function Screen({ app, prompt, respuesta, heading, nota, accent, format = "post", ...base }: ScreenProps) {
  const lime = accent ?? theme.colors.accent;
  const reel = format === "reel";
  const available = contentHeight(format, base.source, base.narracion);
  const bubbleW = CONTENT_WIDTH - 4 - 2 * 36 - 80; // ventana − bordes − padding − sangría de la burbuja
  // De la más grande a la más chica: texto de los mensajes y título.
  const candidates = [
    ...(reel ? [{ text: 46, headingMax: 132, gap: 56, pad: 34 }] : []),
    { text: 44, headingMax: reel ? 124 : 112, gap: reel ? 52 : 44, pad: 32 },
    { text: 40, headingMax: reel ? 116 : 104, gap: reel ? 48 : 40, pad: 30 },
    { text: 36, headingMax: 100, gap: 40, pad: 28 },
    { text: 32, headingMax: 92, gap: 36, pad: 26 },
    { text: 30, headingMax: 84, gap: 32, pad: 24 },
  ];
  const height = (c: (typeof candidates)[number]) => {
    let h = 84; // barra de la ventana
    const label = 30 + 12;
    h += c.pad * 2 + label + interHeight(prompt, c.text, bubbleW - 2 * c.pad, 1.32);
    h += c.gap + label + interHeight(respuesta, c.text, bubbleW - 2 * c.pad, 1.32) + c.pad * 2;
    if (heading) h += antonHeight(heading, fitDisplaySize(heading, c.headingMax, { maxLines: 2, tight: reel }), displayLineHeight(heading, 1.0), undefined, reel) + c.gap;
    if (nota) h += c.gap + interHeight(nota, 32, CONTENT_WIDTH - 48, 1.35);
    return h;
  };
  const sc = pickFill(candidates, height, available * (reel ? REEL_FILL : 1), format);
  const burbuja = (lado: "tu" | "ia") => ({
    maxWidth: bubbleW,
    padding: `${sc.pad}px ${sc.pad + 8}px`,
    borderRadius: 28,
    ...(lado === "tu"
      ? { alignSelf: "flex-end" as const, backgroundColor: "#1B1B24", border: `2px solid ${lime}`, borderBottomRightRadius: 8 }
      : { alignSelf: "flex-start" as const, backgroundColor: theme.colors.card, border: `2px solid ${theme.colors.line}`, borderBottomLeftRadius: 8 }),
  });
  const texto = { margin: 0, fontFamily: theme.fonts.body, fontSize: sc.text, lineHeight: 1.32, color: theme.colors.text, whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const };
  const etiqueta = (color: string) => ({ ...monoText, display: "block", fontSize: 26, letterSpacing: "0.14em", textTransform: "uppercase" as const, color, marginBottom: 12 });
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: sc.gap }}>
        {heading && (
          <h2
            data-anim="words"
            style={{
              margin: 0,
              fontFamily: theme.fonts.display,
              fontWeight: 400,
              fontSize: fitDisplaySize(heading, sc.headingMax, { maxLines: 2, tight: reel }),
              lineHeight: displayLineHeight(heading, 1.0),
              textTransform: "uppercase",
              textWrap: "balance",
            }}
          >
            {heading}
          </h2>
        )}
        <Card anim="rise" style={{ backgroundColor: "#0E0E14", overflow: "hidden" }}>
          {/* Barra de la ventana: punto lima + nombre de la IA */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, height: 84, padding: "0 36px", borderBottom: `2px solid ${theme.colors.line}`, backgroundColor: theme.colors.card }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: lime }} />
            <span style={{ ...monoText, fontSize: 28, letterSpacing: "0.06em", color: theme.colors.text }}>{app}</span>
            <span style={{ marginLeft: "auto", ...monoText, fontSize: 22, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.colors.textMuted }}>en vivo</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: sc.gap, padding: `${sc.pad + 6}px 36px` }}>
            <div data-anim="rise" style={burbuja("tu")}>
              <span style={etiqueta(theme.colors.textMuted)}>{ETIQUETA_TU}</span>
              <p data-anim="type" style={texto}>
                {prompt}
                <span data-anim="caret" style={{ display: "inline-block", width: 4, height: `${sc.text}px`, marginLeft: 6, verticalAlign: "-0.15em", backgroundColor: lime }} />
              </p>
            </div>
            <div data-anim="rise" style={burbuja("ia")}>
              <span style={etiqueta(lime)}>{app}</span>
              <p data-anim="words" style={texto}>
                {respuesta}
              </p>
            </div>
          </div>
        </Card>
        {nota && (
          <p data-anim="rise" style={{ margin: 0, fontFamily: theme.fonts.body, fontSize: 32, lineHeight: 1.35, color: theme.colors.textMuted, paddingLeft: 24, borderLeft: `6px solid ${lime}` }}>
            {nota}
          </p>
        )}
      </div>
    </Frame>
  );
}
