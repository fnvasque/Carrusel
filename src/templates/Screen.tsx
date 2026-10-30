import { Frame } from "./Frame.tsx";
import { fitDisplaySize, CONTENT_WIDTH, displayLineHeight } from "./fit.ts";
import { contentHeight, displayHeight, interHeight, pickFill, REEL_FILL } from "./layout.ts";
import { Etiqueta, titular } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface ScreenProps extends BaseSlideProps {
  /** Nombre de la IA que contesta (ChatGPT, Gemini, NotebookLM…). ≤ 3 palabras. Es la etiqueta de su burbuja. */
  app: string;
  /** Lo que la persona escribe (se teclea en el reel). ≤ 30 palabras. */
  prompt: string;
  /** Lo que la IA contesta, textual y verificado. ≤ 45 palabras. */
  respuesta: string;
  /** Título opcional sobre el chat. ≤ 6 palabras. */
  heading?: string;
  /** Nota opcional bajo el chat (dónde está la función, si es gratis…). */
  nota?: string;
}

/** Etiqueta del mensaje de la persona. */
export const ETIQUETA_TU = "Tú";

/** Interlineado base del heading. */
const HEADING_LH = 1.03;
/** Ancho máximo de una burbuja (maqueta A3: 820 px). */
const BURBUJA_MAX = 820;
/** En el reel la burbuja puede usar casi todo el ancho útil. */
const BURBUJA_MAX_REEL = 860;
/** Alto de la etiqueta de la burbuja (24 px × 1,2) y su aire. */
const ETIQUETA_H = 29 + 10;

/**
 * Rol — La IA haciéndolo (pilar Herramienta). Chat en burbujas sobre el papel:
 * la persona («Tú», burbuja tinta con texto blanco, a la derecha) escribe el
 * prompt (`data-anim="type"`, con cursor) y la IA (burbuja blanca a la
 * izquierda, con el nombre de la app) contesta (`data-anim="words"`). Es la
 * prueba visual de la pieza: se ve la herramienta hacer lo que el reel promete.
 */
export function Screen({ app, prompt, respuesta, heading, nota, accent: _accent, format = "post", ...base }: ScreenProps) {
  const reel = format === "reel";
  const available = contentHeight(format, base.source, base.narracion);
  // De la más grande a la más chica: texto de los mensajes y título.
  const candidates = [
    // Reel: el 9:16 es alto; las burbujas suben de tamaño para no dejar media pantalla vacía.
    ...(reel ? [{ text: 54, headingMax: 132, gap: 40, pad: 44 }, { text: 50, headingMax: 124, gap: 38, pad: 42 }, { text: 46, headingMax: 120, gap: 36, pad: 40 }, { text: 42, headingMax: 112, gap: 32, pad: 38 }] : []),
    { text: 40, headingMax: reel ? 104 : theme.fontSize.heading, gap: 28, pad: 36 },
    { text: 38, headingMax: reel ? 96 : 80, gap: 28, pad: 34 },
    { text: 36, headingMax: 76, gap: 24, pad: 32 },
    { text: 34, headingMax: 72, gap: 24, pad: 30 },
    { text: 32, headingMax: 68, gap: 20, pad: 28 },
    { text: 30, headingMax: 64, gap: 20, pad: 26 },
  ];
  const height = (c: (typeof candidates)[number]) => {
    const inner = (reel ? BURBUJA_MAX_REEL : BURBUJA_MAX) - 2 * (c.pad + 4);
    let h = 2 * c.pad + ETIQUETA_H + interHeight(prompt, c.text, inner, 1.35);
    h += c.gap + 2 * c.pad + ETIQUETA_H + interHeight(respuesta, c.text, inner, 1.35);
    if (heading) h += displayHeight(heading, fitDisplaySize(heading, c.headingMax, { maxLines: 2, tight: reel }), displayLineHeight(heading, HEADING_LH), undefined, reel) + c.gap + 24;
    if (nota) h += c.gap + 24 + interHeight(nota, reel ? 36 : 32, CONTENT_WIDTH - 38, 1.35);
    return h;
  };
  const sc = pickFill(candidates, height, available * (reel ? REEL_FILL : 1), format);
  const burbuja = (lado: "tu" | "ia") => ({
    maxWidth: reel ? BURBUJA_MAX_REEL : BURBUJA_MAX,
    boxSizing: "border-box" as const,
    padding: `${sc.pad}px ${sc.pad + 4}px`,
    borderRadius: 36,
    ...(lado === "tu"
      ? { alignSelf: "flex-end" as const, backgroundColor: theme.colors.ink, color: "#FFFFFF", borderBottomRightRadius: 10 }
      : { alignSelf: "flex-start" as const, backgroundColor: theme.colors.card, color: theme.colors.ink, borderBottomLeftRadius: 10 }),
  });
  const texto = { margin: 0, fontFamily: theme.fonts.body, fontWeight: 400, fontSize: sc.text, lineHeight: 1.35, color: "inherit", whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const };
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: sc.gap }}>
        {heading && (
          <h2 data-anim="words" style={{ ...titular, fontSize: fitDisplaySize(heading, sc.headingMax, { maxLines: 2, tight: reel }), lineHeight: displayLineHeight(heading, HEADING_LH), textWrap: "balance", marginBottom: 24 }}>
            {heading}
          </h2>
        )}
        <div data-anim="rise" data-chat="tu" style={burbuja("tu")}>
          <Etiqueta color={theme.colors.accent} style={{ marginBottom: 10 }}>
            {ETIQUETA_TU}
          </Etiqueta>
          <p data-anim="type" style={texto}>
            {prompt}
            {/* El cursor va en el color del texto de la burbuja (blanco sobre tinta). */}
            <span data-anim="caret" style={{ display: "inline-block", width: 4, height: `${sc.text}px`, marginLeft: 6, verticalAlign: "-0.15em", backgroundColor: "currentColor" }} />
          </p>
        </div>
        <div data-anim="rise" data-chat="ia" style={burbuja("ia")}>
          <Etiqueta style={{ marginBottom: 10 }}>{app}</Etiqueta>
          <p data-anim="words" style={texto}>
            {respuesta}
          </p>
        </div>
        {nota && (
          <p data-anim="rise" style={{ margin: 0, marginTop: 24, fontFamily: theme.fonts.body, fontSize: reel ? 36 : 32, lineHeight: 1.35, color: theme.colors.textMuted, paddingLeft: 32, borderLeft: `6px solid ${theme.colors.accent}` }}>
            {nota}
          </p>
        )}
      </div>
    </Frame>
  );
}
