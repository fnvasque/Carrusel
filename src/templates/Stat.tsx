import { Frame } from "./Frame.tsx";
import { fitDisplaySize } from "./fit.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface StatProps extends BaseSlideProps {
  /** El dato (ej. "47%", "$20", "8×", "1 de 3"). Si es numérico, cuenta desde 0 en el reel. */
  value: string;
  /** Qué mide el dato, en pocas palabras (ej. "del valor llega en 3 segundos"). */
  label: string;
  /** Contexto en 1-2 frases (Inter). */
  context?: string;
}

/** Partes de un valor numérico: prefijo, número y sufijo ("$1.200/mes" → "$", "1.200", "/mes"). */
export function parseStatValue(value: string): { prefix: string; number: number; suffix: string } | null {
  const m = value.trim().match(/^([^\d-]*?)(-?\d+(?:[.,]\d+)*)(.*)$/);
  if (!m) return null;
  const n = Number(m[2].replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return { prefix: m[1], number: n, suffix: m[3] };
}

/**
 * Rol — Dato (slide de desarrollo con número). Número gigante en lima (Anton),
 * etiqueta Anton debajo, contexto en Inter y fuente al pie (vía `source`).
 * Si el valor es un porcentaje entre 0 y 100, suma una barra que lo muestra.
 * El número lleva `data-anim="count"` (en el reel cuenta desde 0).
 */
export function Stat({ value, label, context, accent, format, ...base }: StatProps) {
  const lime = accent ?? theme.colors.accent;
  const parsed = parseStatValue(value);
  const percent = parsed && /^\s*%/.test(parsed.suffix) && parsed.number >= 0 && parsed.number <= 100 ? parsed.number : null;
  const reel = format === "reel";
  const valueSize = fitDisplaySize(value, theme.fontSize.stat + (reel ? 60 : 0), { maxLines: 1, min: 120 });
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 36 }}>
        <span
          data-anim="count"
          style={{ fontFamily: theme.fonts.display, fontSize: valueSize, lineHeight: 0.86, color: lime, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}
        >
          {value}
        </span>
        {percent !== null && (
          <div data-anim="rise" data-meter="" style={{ position: "relative", height: 20, borderRadius: 10, backgroundColor: theme.colors.line, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${percent}%`, borderRadius: 10, backgroundColor: lime }} />
          </div>
        )}
        <h2
          data-anim="words"
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontWeight: 400,
            fontSize: fitDisplaySize(label, reel ? 92 : 76, { maxLines: 3 }),
            lineHeight: 1.02,
            textTransform: "uppercase",
            textWrap: "balance",
          }}
        >
          {label}
        </h2>
        {context && (
          <p data-anim="rise" style={{ margin: 0, paddingTop: 32, borderTop: `2px solid ${theme.colors.line}`, fontFamily: theme.fonts.body, fontSize: theme.fontSize.body + (reel ? 6 : 0), lineHeight: 1.4, color: theme.colors.textSoft, textWrap: "pretty" }}>
            {context}
          </p>
        )}
      </div>
    </Frame>
  );
}
