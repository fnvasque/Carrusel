import { Frame } from "./Frame.tsx";
import { fitDisplaySize } from "./fit.ts";
import { Card } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

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
 * con 3 puntos y título mono ("copia este prompt"), texto mono y cursor lima al
 * final (`data-anim="caret"`). Muy guardable.
 */
export function Prompt({ heading, prompt, note, accent, format, ...base }: PromptProps) {
  const lime = accent ?? theme.colors.accent;
  // Prompts largos bajan un punto para no desbordar la ventana.
  const reel = format === "reel";
  // Igual en reel: el mismo ancho útil, y un comando no debe partirse en otra línea.
  const codeSize = prompt.length > 200 ? 32 : prompt.length <= 90 ? 40 : theme.fontSize.code;
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 44 }}>
        <h2
          data-anim="words"
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontWeight: 400,
            fontSize: fitDisplaySize(heading, theme.fontSize.heading + (reel ? 16 : 0), { maxLines: 2 }),
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
            <span style={{ marginLeft: 18, fontFamily: theme.fonts.mono, fontSize: 26, letterSpacing: "0.08em", color: theme.colors.textMuted }}>
              copia-este-prompt
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: theme.fonts.mono,
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
              minHeight: codeSize * 1.5 * 4 + 92,
              boxSizing: "border-box",
              fontFamily: theme.fonts.mono,
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
            <span style={{ color: lime, fontFamily: theme.fonts.mono }}>→</span>
            <span>{note}</span>
          </p>
        )}
      </div>
    </Frame>
  );
}
