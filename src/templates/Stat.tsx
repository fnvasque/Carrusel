import { Frame } from "./Frame.tsx";
import { fitDisplaySize, estimateLines, CONTENT_WIDTH, displayLineHeight } from "./fit.ts";
import { contentHeight, displayHeight, pickFill } from "./layout.ts";
import { titular } from "./ui.tsx";
import { Parrafos, parrafosHeight } from "./parrafos.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface StatProps extends BaseSlideProps {
  /** El dato (ej. "47%", "$20", "8×", "1 de 3"). Si es numérico, cuenta desde 0 en el reel. */
  value: string;
  /** Qué mide el dato, en pocas palabras (ej. "del valor llega en 3 segundos"). */
  label: string;
  /** Contexto en 1-2 frases (Inter 44 px). */
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
    labelMax: Math.round((reel ? 92 : 72) * Math.min(reel ? 1.35 : 1.1, s)),
    body: Math.max(40, Math.min(reel ? 56 : 46, Math.round((reel ? 48 : theme.fontSize.body) * s))),
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

/** Interlineados del valor y de la etiqueta. */
const VALUE_LH = 1.0;
const LABEL_LH = 1.06;

function statHeight(sc: StatScale, p: { value: string; label: string; context?: string; percent: boolean }, tight: boolean): number {
  const v = valueFit(p.value, sc.valueMax);
  let h = estimateLines(p.value, v.size) * v.size * displayLineHeight(p.value, VALUE_LH);
  if (p.percent) h += sc.gap + 20;
  h += sc.gap + displayHeight(p.label, fitDisplaySize(p.label, sc.labelMax, { maxLines: 3, tight }), displayLineHeight(p.label, LABEL_LH), undefined, tight);
  if (p.context) h += sc.gap + 8 + parrafosHeight(p.context, sc.body, CONTENT_WIDTH, 1.36);
  return h;
}

/**
 * Rol — Dato (slide de desarrollo con número). Número gigante en Inter 700 tinta
 * sobre el marcador lima, etiqueta Inter 700 debajo, contexto en Inter 44 px y
 * fuente al pie (vía `source`). Si el valor es un porcentaje entre 0 y 100, suma
 * una barra tinta sobre blanco que lo muestra. El número lleva
 * `data-anim="count"` (en el reel cuenta desde 0). La escala se elige para
 * llenar el área útil sin desbordar.
 */
export function Stat({ value: rawValue, label, context, accent: _accent, format = "post", ...base }: StatProps) {
  const value = String(rawValue);
  const parsed = parseStatValue(value);
  const percent = parsed && /^\s*%/.test(parsed.suffix) && parsed.number >= 0 && parsed.number <= 100 ? parsed.number : null;
  const reel = format === "reel";
  const sc = pickFill(scales(reel), (c) => statHeight(c, { value, label, context, percent: percent !== null }, reel), contentHeight(format, base.source, base.narracion), format);
  const v = valueFit(value, sc.valueMax);
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: sc.gap }}>
        {/* El marcador va en el span que cuenta (el runtime solo reescribe su texto). En una línea es
            inline-block para que la entrada (transform) del reel se vea; partido en líneas es inline,
            con el marcador repetido por línea (box-decoration-break). */}
        <div style={{ ...titular, fontSize: v.size, lineHeight: displayLineHeight(value, VALUE_LH), letterSpacing: "-0.05em" }}>
          <span
            data-anim="count"
            style={{
              backgroundImage: theme.marker,
              backgroundRepeat: "no-repeat",
              backgroundSize: "100% 100%",
              padding: "0 0.04em",
              display: v.wrap ? "inline" : "inline-block",
              whiteSpace: v.wrap ? "normal" : "nowrap",
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
              ...(v.wrap ? { textWrap: "balance" as const } : {}),
            }}
          >
            {value}
          </span>
        </div>
        {percent !== null && (
          <div data-anim="rise" data-meter="" style={{ position: "relative", height: 20, borderRadius: 10, backgroundColor: theme.colors.card, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${percent}%`, borderRadius: 10, backgroundColor: theme.colors.ink }} />
          </div>
        )}
        <h2
          data-anim="words"
          style={{
            ...titular,
            fontSize: fitDisplaySize(label, sc.labelMax, { maxLines: 3, tight: reel }),
            lineHeight: displayLineHeight(label, LABEL_LH),
            textWrap: "balance",
          }}
        >
          {label}
        </h2>
        {context && (
          <Parrafos text={context} size={sc.body} anim="rise" style={{ paddingTop: 8, fontFamily: theme.fonts.body, fontWeight: 400, lineHeight: 1.36, letterSpacing: "-0.01em", color: theme.colors.textSoft, textWrap: "pretty" }} />
        )}
      </div>
    </Frame>
  );
}
