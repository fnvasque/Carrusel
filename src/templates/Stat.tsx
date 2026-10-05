import { Frame } from "./Frame.tsx";
import { fitDisplaySize, estimateLines, CONTENT_WIDTH } from "./fit.ts";
import { contentHeight, antonHeight, interHeight, pickFill } from "./layout.ts";
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

/** Medidas de un Stat a una escala dada. */
interface StatScale {
  valueMax: number;
  labelMax: number;
  body: number;
  gap: number;
}

function scales(reel: boolean): StatScale[] {
  return [...(reel ? [1.4, 1.3] : []), 1.2, 1.1, 1.0, 0.9, 0.8, 0.7].map((s) => ({
    valueMax: Math.min(reel ? 420 : Infinity, Math.round((reel ? 340 : theme.fontSize.stat) * s)),
    labelMax: Math.round((reel ? 92 : 76) * Math.min(reel ? 1.35 : 1.1, s)),
    body: Math.max(40, Math.min(reel ? 56 : 46, Math.round((reel ? 48 : 42) * s))),
    gap: Math.round(36 * Math.min(reel ? 1.4 : 1.1, s)),
  }));
}

/**
 * Tamaño del valor: una línea si cabe a ≥ 160 px; si no (un valor largo no
 * numérico, ej. "1 de cada 3 personas"), hasta 3 líneas con corte por palabras.
 */
function valueFit(value: string, max: number): { size: number; wrap: boolean } {
  const one = fitDisplaySize(value, max, { maxLines: 1, min: 158 });
  if (one > 158 || estimateLines(value, one) === 1) return { size: one, wrap: false };
  return { size: fitDisplaySize(value, Math.min(max, 200), { maxLines: 3, min: 72 }), wrap: true };
}

function statHeight(sc: StatScale, p: { value: string; label: string; context?: string; percent: boolean }, tight: boolean): number {
  const v = valueFit(p.value, sc.valueMax);
  let h = estimateLines(p.value, v.size) * v.size * 0.86;
  if (p.percent) h += sc.gap + 20;
  h += sc.gap + antonHeight(p.label, fitDisplaySize(p.label, sc.labelMax, { maxLines: 3, tight }), 1.02, undefined, tight);
  if (p.context) h += sc.gap + 34 + interHeight(p.context, sc.body, CONTENT_WIDTH, 1.4);
  return h;
}

/**
 * Rol — Dato (slide de desarrollo con número). Número gigante en lima (Anton),
 * etiqueta Anton debajo, contexto en Inter y fuente al pie (vía `source`).
 * Si el valor es un porcentaje entre 0 y 100, suma una barra que lo muestra.
 * El número lleva `data-anim="count"` (en el reel cuenta desde 0). La escala
 * se elige para llenar el área útil sin desbordar.
 */
export function Stat({ value: rawValue, label, context, accent, format = "post", ...base }: StatProps) {
  const value = String(rawValue);
  const lime = accent ?? theme.colors.accent;
  const parsed = parseStatValue(value);
  const percent = parsed && /^\s*%/.test(parsed.suffix) && parsed.number >= 0 && parsed.number <= 100 ? parsed.number : null;
  const reel = format === "reel";
  const sc = pickFill(scales(reel), (c) => statHeight(c, { value, label, context, percent: percent !== null }, reel), contentHeight(format, base.source), format);
  const v = valueFit(value, sc.valueMax);
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: sc.gap }}>
        <span
          data-anim="count"
          style={{
            fontFamily: theme.fonts.display,
            fontSize: v.size,
            lineHeight: 0.86,
            color: lime,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
            whiteSpace: v.wrap ? "normal" : "nowrap",
            ...(v.wrap ? { textWrap: "balance" as const } : {}),
          }}
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
            fontSize: fitDisplaySize(label, sc.labelMax, { maxLines: 3, tight: reel }),
            lineHeight: 1.02,
            textTransform: "uppercase",
            textWrap: "balance",
          }}
        >
          {label}
        </h2>
        {context && (
          <p data-anim="rise" style={{ margin: 0, paddingTop: 32, borderTop: `2px solid ${theme.colors.line}`, fontFamily: theme.fonts.body, fontSize: sc.body, lineHeight: 1.4, color: theme.colors.textSoft, textWrap: "pretty" }}>
            {context}
          </p>
        )}
      </div>
    </Frame>
  );
}
