import { Frame } from "./Frame.tsx";
import { fitDisplaySize, CONTENT_WIDTH } from "./fit.ts";
import { contentHeight, antonHeight, interHeight, wrapLines, pickFill, CHAR_EM, REEL_FILL } from "./layout.ts";
import { Card } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme, monoText } from "../theme.ts";

export interface PromptProps extends BaseSlideProps {
  /** Título del slide. ≤6 palabras. */
  heading: string;
  /** El prompt copiable (se muestra en monoespaciada dentro de una ventana). */
  prompt: string;
  /** Nota o variante opcional bajo el prompt. */
  note?: string;
}

/**
 * Rol — Truco / Prompt (pilar Prompt). Ventana de terminal/chat: barra superior
 * con 3 puntos y título mono ("Copia este prompt") y botón "Copiar", texto mono y cursor lima al
 * final (`data-anim="caret"`). Muy guardable.
 */
export function Prompt({ heading, prompt, note, accent, format = "post", ...base }: PromptProps) {
  const lime = accent ?? theme.colors.accent;
  const reel = format === "reel";
  const available = contentHeight(format, base.source);
  // De la más grande a la más chica: las primeras llenan el área con un prompt
  // corto (heading mayor, ventana con más líneas de alto mínimo); las últimas
  // achican el código para que un prompt largo quepa.
  const candidates = [
    // Reel: ventana alta y heading grande para llenar el 9:16.
    ...(reel ? [12, 10].map((minLines) => ({ code: 40, minLines, headingMax: 160, gap: 64 })) : []),
    ...[6, 5].map((minLines) => ({ code: 40, minLines: minLines + (reel ? 2 : 0), headingMax: reel ? 136 : 120, gap: reel ? 60 : 52 })),
    ...[40, 38, 36, 34, 32, 30, 28, 26].map((code) => ({
      code,
      minLines: reel ? 6 : 4,
      headingMax: Math.round((reel ? 116 : theme.fontSize.heading) * Math.min(1, code / 36)),
      gap: reel ? 52 : 44,
    })),
  ];
  const codeW = CONTENT_WIDTH - 4 - 96;
  const explicitLines = prompt.split("\n").length;
  const codeLines = (code: number) => wrapLines(prompt, code * CHAR_EM.mono, codeW);
  const height = (c: (typeof candidates)[number]) => {
    const hs = fitDisplaySize(heading, c.headingMax, { maxLines: 2, tight: reel });
    let h = antonHeight(heading, hs, 1.0, undefined, reel) + c.gap + 86 + 92 + Math.max(codeLines(c.code), c.minLines) * c.code * 1.5;
    if (note) h += c.gap + interHeight(note, 40, CONTENT_WIDTH - 48, 1.35);
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
        <h2
          data-anim="words"
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontWeight: 400,
            fontSize: fitDisplaySize(heading, sc.headingMax, { maxLines: 2, tight: reel }),
            lineHeight: 1.0,
            textTransform: "uppercase",
            textWrap: "balance",
          }}
        >
          {heading}
        </h2>
        <Card anim="rise" style={{ backgroundColor: "#0E0E14", overflow: "hidden" }}>
          {/* Barra de ventana: 3 puntos + título mono + acción "copiar" */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              height: 84,
              padding: "0 36px",
              borderBottom: `2px solid ${theme.colors.line}`,
              backgroundColor: theme.colors.card,
            }}
          >
            {[theme.colors.pink, theme.colors.violet, lime].map((c) => (
              <span key={c} style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: c }} />
            ))}
            {/* Texto normal, no un nombre de archivo: "copia-este-prompt" le parecía código al lector no técnico. */}
            <span style={{ marginLeft: 18, ...monoText, fontSize: 26, letterSpacing: "0.04em", color: theme.colors.textMuted }}>
              Copia este prompt
            </span>
            <span
              style={{
                marginLeft: "auto",
                ...monoText,
                fontSize: 22,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: lime,
                border: `2px solid ${lime}`,
                borderRadius: 12,
                padding: "6px 14px",
              }}
            >
              Copiar
            </span>
          </div>
          <div
            data-anim="type"
            style={{
              padding: "44px 48px 48px",
              // Ventana con cuerpo mínimo: un prompt de 1-2 líneas no queda como una franja.
              minHeight: codeSize * 1.5 * sc.minLines + 92,
              boxSizing: "border-box",
              ...monoText,
              fontSize: codeSize,
              lineHeight: 1.5,
              color: theme.colors.text,
              whiteSpace: "pre-wrap",
            }}
          >
            {prompt}
            <span
              data-anim="caret"
              style={{ display: "inline-block", width: 18, height: codeSize * 1.1, marginLeft: 8, verticalAlign: "-0.2em", backgroundColor: lime }}
            />
          </div>
        </Card>
        {note && (
          <p data-anim="rise" style={{ margin: 0, display: "flex", gap: 20, fontFamily: theme.fonts.body, fontSize: 40, lineHeight: 1.35, color: theme.colors.textSoft }}>
            <span style={{ color: lime, ...monoText }}>→</span>
            <span>{note}</span>
          </p>
        )}
      </div>
    </Frame>
  );
}
