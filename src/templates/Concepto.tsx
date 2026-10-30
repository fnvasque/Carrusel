import { Frame } from "./Frame.tsx";
import { highlightText, frasesNowrap } from "./highlight.tsx";
import { Parrafos, parrafosHeight } from "./parrafos.tsx";
import { fitDisplaySize, CONTENT_WIDTH, displayLineHeight } from "./fit.ts";
import { titular } from "./ui.tsx";
import { aire, contentHeight, displayHeight, pickFill, CHAR_EM } from "./layout.ts";
import type { BaseSlideProps, Format } from "./types.ts";
import { theme } from "../theme.ts";

export interface ConceptoProps extends BaseSlideProps {
  /** Número del concepto (ej. "1"), en un cuadro lima como el de `Step`. Opcional. */
  numero?: string;
  /** Nombre del concepto. ≤ 6 palabras. */
  titulo: string;
  /** Palabra del título con el marcador lima detrás. */
  highlight?: string;
  /** Frase del título (2-4 palabras) en Instrument Serif cursiva. */
  cursiva?: string;
  /** Lo que le pasa al lector, en 1-2 frases (≤ 25 palabras): el problema, no la teoría. */
  idea: string;
  /**
   * La distinción en negrita (≤ 16 palabras), al estilo «Un líder amable quiere… Un
   * líder bueno quiere…». Opcional: es la frase que se lee aunque se pase rápido.
   */
  contraste?: string;
  /** Rótulo del bloque de abajo, en serif cursiva, sin los dos puntos. Por defecto «En simple». "" lo quita. */
  rotulo?: string;
  /** La explicación dicha en simple, en primera persona y con la acción concreta (≤ 35 palabras). */
  enSimple: string;
}

/** Rótulo por defecto del bloque de explicación (validar.mjs tiene una copia; un test las compara). */
export const ROTULO_EN_SIMPLE = "En simple";

/** Interlineado del título (el del heading de `Step`). */
const TITULO_LH = 1.03;

/** Medidas de un Concepto a una escala dada. */
interface ConceptoScale {
  chip: number;
  tituloMax: number;
  /** Texto de `idea` (Inter 500, tinta). */
  idea: number;
  /** Texto de `contraste` (Inter 700, tinta). */
  contraste: number;
  /** Texto de `enSimple` (Inter 400). */
  cuerpo: number;
  /** Rótulo «En simple:» (serif cursiva). */
  rotulo: number;
  /** Separación entre bloques. */
  gap: number;
}

/**
 * Escalas de la más grande a la más chica. Esta plantilla lleva más texto que
 * `Step`: el cuerpo arranca en 44 px (post) y no baja de 38 salvo en el último
 * recurso, para que el párrafo largo siga legible en el celular.
 */
function scales(format: Format): ConceptoScale[] {
  const reel = format === "reel";
  const k = [...(reel ? [1.3, 1.2] : []), 1.1, 1.0, 0.92, 0.85, 0.78, 0.72];
  const out = k.map((s) => ({
    chip: Math.round((reel ? 120 : 100) * Math.min(1, Math.max(0.8, s))),
    tituloMax: Math.min(reel ? 116 : theme.fontSize.heading, Math.round((reel ? 100 : theme.fontSize.heading) * s)),
    idea: Math.max(40, Math.min(reel ? 56 : 48, Math.round((reel ? 52 : 48) * s))),
    contraste: Math.max(42, Math.min(reel ? 60 : 54, Math.round((reel ? 56 : 52) * s))),
    cuerpo: Math.max(38, Math.min(reel ? 50 : theme.fontSize.body, Math.round((reel ? 48 : theme.fontSize.body) * s))),
    rotulo: Math.round((reel ? 64 : 56) * Math.min(1, Math.max(0.8, s))),
    gap: aire(36 * Math.min(1.15, s)),
  }));
  const last = out[out.length - 1];
  out.push({ ...last, idea: 38, contraste: 40, cuerpo: 36, rotulo: 44 });
  return out;
}

/** Alto estimado del bloque completo a una escala. */
function conceptoHeight(sc: ConceptoScale, p: Pick<ConceptoProps, "numero" | "titulo" | "highlight" | "cursiva" | "idea" | "contraste" | "enSimple">, tight: boolean): number {
  const keep = frasesNowrap(p.highlight, undefined, p.cursiva);
  const tituloSize = fitDisplaySize(p.titulo, sc.tituloMax, { maxLines: 3, tight, keep });
  let h = displayHeight(p.titulo, tituloSize, displayLineHeight(p.titulo, TITULO_LH), undefined, tight, keep);
  if (p.numero) h += sc.chip + sc.gap;
  h += sc.gap + parrafosHeight(p.idea, sc.idea, CONTENT_WIDTH, 1.3, CHAR_EM.interSemibold);
  if (p.contraste) h += sc.gap + parrafosHeight(p.contraste, sc.contraste, CONTENT_WIDTH, 1.2, CHAR_EM.interSemibold);
  h += sc.gap * 1.4 + sc.rotulo * 1.15 + Math.round(sc.gap * 0.4);
  h += parrafosHeight(p.enSimple, sc.cuerpo, CONTENT_WIDTH, 1.4);
  return h;
}

/**
 * Concepto explicado en simple (carrusel explicativo). Una idea por lámina, en
 * el orden en que se lee: el nombre del concepto (Inter 700 con marcador), lo
 * que le pasa al lector (Inter 500, 1-2 frases), la distinción opcional en
 * negrita y, bajo un rótulo en serif cursiva sobre el marcador («En simple:»),
 * la explicación en primera persona con la acción concreta. Pensada para
 * el texto largo que no cabe en un `Step` sin volverse un muro: el rótulo parte
 * la lámina en «qué es» y «qué hago».
 */
export function Concepto({ numero, titulo, highlight, cursiva, idea, contraste, rotulo, enSimple, accent: _accent, format = "post", ...base }: ConceptoProps) {
  const reel = format === "reel";
  const keep = frasesNowrap(highlight, undefined, cursiva);
  const sc = pickFill(scales(format), (c) => conceptoHeight(c, { numero, titulo, highlight, cursiva, idea, contraste, enSimple }, reel), contentHeight(format, base.source, base.narracion, base.subtitulos), format);
  const tituloSize = fitDisplaySize(titulo, sc.tituloMax, { maxLines: 3, tight: reel, keep });
  const etiqueta = (rotulo === undefined ? ROTULO_EN_SIMPLE : rotulo).trim().replace(/:\s*$/, "");
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: sc.gap }}>
        {numero && (
          <span
            data-anim="rise"
            data-concepto="numero"
            style={{
              alignSelf: "flex-start",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              minWidth: sc.chip,
              height: sc.chip,
              padding: `0 ${Math.round(sc.chip * 0.14)}px`,
              borderRadius: Math.round(sc.chip * 0.255),
              backgroundColor: theme.colors.accent,
              color: theme.colors.onAccent,
              fontFamily: theme.fonts.serif,
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: Math.round(sc.chip * 0.84),
              lineHeight: 1,
            }}
          >
            {numero}
          </span>
        )}
        <h2 data-anim="words" data-concepto="titulo" style={{ ...titular, fontSize: tituloSize, lineHeight: displayLineHeight(titulo, TITULO_LH), textWrap: "balance" }}>
          {highlightText(titulo, highlight, theme.colors.accent, undefined, undefined, cursiva)}
        </h2>
        <div data-anim="rise" data-concepto="idea">
          <Parrafos text={idea} size={sc.idea} style={{ fontFamily: theme.fonts.body, fontWeight: 500, lineHeight: 1.3, letterSpacing: "-0.015em", color: theme.colors.ink, textWrap: "pretty" }} />
        </div>
        {contraste && (
          <div data-anim="rise" data-concepto="contraste">
            <Parrafos text={contraste} size={sc.contraste} style={{ fontFamily: theme.fonts.body, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.03em", color: theme.colors.ink, textWrap: "pretty" }} />
          </div>
        )}
        <div data-anim="rise" data-concepto="en-simple" style={{ display: "flex", flexDirection: "column", gap: Math.round(sc.gap * 0.4), marginTop: Math.round(sc.gap * 0.4) }}>
          {etiqueta && (
            <span style={{ fontFamily: theme.fonts.serif, fontStyle: "italic", fontWeight: 400, fontSize: sc.rotulo, lineHeight: 1.15, color: theme.colors.ink }}>
              <span style={{ backgroundImage: theme.marker, padding: "0 0.12em" }}>{etiqueta}:</span>
            </span>
          )}
          <Parrafos text={enSimple} size={sc.cuerpo} style={{ fontFamily: theme.fonts.body, fontWeight: 400, lineHeight: 1.4, letterSpacing: "-0.01em", color: theme.colors.text, textWrap: "pretty" }} />
        </div>
      </div>
    </Frame>
  );
}
