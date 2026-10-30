import { Frame } from "./Frame.tsx";
import { fitDisplaySize, CONTENT_WIDTH, displayLineHeight } from "./fit.ts";
import { contentHeight, displayHeight, wrapLines, pickFill, CHAR_EM, REEL_FILL } from "./layout.ts";
import { Card, Etiqueta, titular } from "./ui.tsx";
import { parrafos, parrafosHeight, PARRAFO_GAP_EM } from "./parrafos.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme, monoText } from "../theme.ts";

export interface PromptProps extends BaseSlideProps {
  /** Título del slide. ≤6 palabras. */
  heading: string;
  /** El prompt copiable (se muestra en monoespaciada dentro de una tarjeta blanca). */
  prompt: string;
  /** Nota o variante opcional bajo el prompt. */
  note?: string;
}

/** Etiqueta de la tarjeta del prompt (el lector frío de validar.mjs la copia). */
export const ETIQUETA_PROMPT = "Copia esto";

/** Interlineado base del heading. */
const HEADING_LH = 1.03;
/** Tarjeta: padding (vertical, horizontal) y alto de la fila de la etiqueta con su aire. */
const PAD = { y: 40, x: 48 } as const;
const FILA = 29 + 20;

/**
 * Rol — Truco / Prompt. Heading Inter 700 y, debajo, una tarjeta blanca con la
 * etiqueta «Copia esto» y el prompt en mono tinta, con un cursor tinta al final
 * (`data-anim="caret"`). Muy guardable.
 */
export function Prompt({ heading, prompt, note, accent: _accent, format = "post", ...base }: PromptProps) {
  const reel = format === "reel";
  const available = contentHeight(format, base.source, base.narracion, base.subtitulos);
  // De la más grande a la más chica: las primeras llenan el área con un prompt
  // corto (heading mayor, tarjeta con más líneas de alto mínimo); las últimas
  // achican el código para que un prompt largo quepa.
  const candidates = [
    // Reel: tarjeta alta y heading grande para llenar el 9:16.
    ...(reel ? [12, 10].map((minLines) => ({ code: 40, minLines, headingMax: 132, gap: 64 })) : []),
    ...[6, 5].map((minLines) => ({ code: reel ? 40 : theme.fontSize.code, minLines: minLines + (reel ? 2 : 0), headingMax: reel ? 116 : theme.fontSize.heading, gap: reel ? 60 : 52 })),
    ...[36, 34, 32, 30, 28, 26].map((code) => ({
      code,
      minLines: reel ? 6 : 4,
      headingMax: Math.round((reel ? 104 : theme.fontSize.heading) * Math.min(1, code / 36)),
      gap: reel ? 52 : 44,
    })),
  ];
  const codeW = CONTENT_WIDTH - 2 * PAD.x;
  const explicitLines = prompt.split("\n").length;
  const codeLines = (code: number) => wrapLines(prompt, code * CHAR_EM.mono, codeW);
  const height = (c: (typeof candidates)[number]) => {
    const hs = fitDisplaySize(heading, c.headingMax, { maxLines: 2, tight: reel });
    let h = displayHeight(heading, hs, displayLineHeight(heading, HEADING_LH), undefined, reel) + c.gap + 2 * PAD.y + FILA + Math.max(codeLines(c.code), c.minLines) * c.code * 1.5;
    if (note) h += c.gap + parrafosHeight(note, 40, CONTENT_WIDTH - 48, 1.35);
    return h;
  };
  // Prefiere el mayor tamaño que cabe sin partir ninguna línea del código; si
  // no hay, el mayor que cabe (un comando partido es peor que un punto menos).
  // (Solo si ese tamaño sigue siendo legible: un prompt en prosa sí puede partirse.)
  const sc =
    candidates.find((c) => c.code >= 34 && height(c) <= available * (reel ? REEL_FILL : 1) && codeLines(c.code) === explicitLines) ??
    candidates.find((c) => c.code >= 34 && height(c) <= available && codeLines(c.code) === explicitLines) ??
    pickFill(candidates, height, available, format);
  const codeSize = sc.code;
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: sc.gap }}>
        <h2 data-anim="words" style={{ ...titular, fontSize: fitDisplaySize(heading, sc.headingMax, { maxLines: 2, tight: reel }), lineHeight: displayLineHeight(heading, HEADING_LH), textWrap: "balance" }}>
          {heading}
        </h2>
        <Card anim="rise" style={{ padding: `${PAD.y}px ${PAD.x}px`, display: "flex", flexDirection: "column", gap: 20 }}>
          <Etiqueta>{ETIQUETA_PROMPT}</Etiqueta>
          <div
            data-anim="type"
            style={{
              // Tarjeta con cuerpo mínimo: un prompt de 1-2 líneas no queda como una franja.
              minHeight: codeSize * 1.5 * sc.minLines,
              boxSizing: "border-box",
              ...monoText,
              fontSize: codeSize,
              lineHeight: 1.5,
              color: theme.colors.ink,
              whiteSpace: "pre-wrap",
            }}
          >
            {prompt}
            <span data-anim="caret" style={{ display: "inline-block", width: 16, height: codeSize * 1.1, marginLeft: 8, verticalAlign: "-0.2em", backgroundColor: theme.colors.ink }} />
          </div>
        </Card>
        {note && (
          <p data-anim="rise" style={{ margin: 0, display: "flex", gap: 20, fontFamily: theme.fonts.body, fontSize: 40, lineHeight: 1.35, color: theme.colors.textSoft }}>
            <span style={{ color: theme.colors.ink, fontWeight: 700 }}>→</span>
            {parrafos(note).length > 1 ? (
              <span data-parrafos={parrafos(note).length} style={{ display: "flex", flexDirection: "column", gap: Math.round(PARRAFO_GAP_EM * 40) }}>
                {parrafos(note).map((x, i) => (
                  <span key={i}>{x}</span>
                ))}
              </span>
            ) : (
              <span>{note}</span>
            )}
          </p>
        )}
      </div>
    </Frame>
  );
}
