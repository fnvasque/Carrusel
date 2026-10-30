import { Frame } from "./Frame.tsx";
import { highlightText, frasesNowrap } from "./highlight.tsx";
import { Parrafos, parrafos, esCita, PARRAFO_GAP_EM } from "./parrafos.tsx";
import { fitDisplaySize, CONTENT_WIDTH, displayLineHeight } from "./fit.ts";
import { CheckCircle, titular } from "./ui.tsx";
import { contentHeight, displayHeight, interHeight, pickFill } from "./layout.ts";
import type { BaseSlideProps, Format } from "./types.ts";
import { theme } from "../theme.ts";

export interface StepProps extends BaseSlideProps {
  /** Número o índice del paso (ej. "1"). Opcional. */
  step?: string;
  /** Título del paso. ≤6 palabras. */
  heading: string;
  /** Palabra del heading con el marcador lima detrás. */
  highlight?: string;
  /** Frase del heading (2-4 palabras) en Instrument Serif cursiva. */
  cursiva?: string;
  /** Cuerpo del paso. ≤240 caracteres. Una cita «…» va con borde lima a la izquierda. */
  body?: string;
  /** Lista de viñetas (alternativa o complemento a `body`): se pintan como checklist. */
  bullets?: string[];
}

/**
 * Fill del reel para Step: su estimador sobreestima algo (viñetas), así que
 * pide más para terminar ocupando ~75-85 % real del alto útil.
 */
const STEP_REEL_FILL = 0.96;

/** Interlineado base del heading (maqueta A3: 1,03). */
const HEADING_LH = 1.03;
/** Cita «…» del cuerpo: borde izquierdo lima y su sangría (px). */
const CITA_BORDE = 6;
const CITA_PAD = 32;

/** Medidas de un Step a una escala dada. */
interface StepScale {
  /** Lado del cuadro lima del número (px); la cifra va a 0,84 de eso. */
  chip: number;
  headingMax: number;
  body: number;
  /** Separación entre viñetas. */
  gap: number;
  /** Separación entre bloques (número ↔ heading ↔ cuerpo). */
  blockGap: number;
  check: number;
}

/**
 * Escalas de la más grande a la más chica. Las primeras llenan el área cuando
 * hay poco texto; las últimas evitan desbordes con muchas viñetas largas. El
 * cuerpo no baja de 40 px (mínimo de marca) salvo en el último recurso.
 */
function scales(format: Format): StepScale[] {
  const reel = format === "reel";
  const k = [...(reel ? [1.4, 1.3] : []), 1.2, 1.1, 1.0, 0.9, 0.8, 0.72, 0.66];
  const out = k.map((s) => ({
    chip: Math.round((reel ? 132 : 110) * Math.min(1, Math.max(0.8, s))),
    // Post: heading hasta 84 px y cuerpo 44 px (spec); las escalas mayores solo agrandan el aire.
    headingMax: Math.min(reel ? 124 : theme.fontSize.heading, Math.round((reel ? 104 : theme.fontSize.heading) * s)),
    body: Math.max(40, Math.min(reel ? 54 : theme.fontSize.body, Math.round((reel ? 48 : theme.fontSize.body) * s))),
    gap: Math.round(30 * s),
    blockGap: Math.round(40 * Math.min(1.2, s)),
    check: s >= 0.9 ? 52 : 44,
  }));
  // Últimos recursos: cuerpo 38 y 36 px para no cortar texto.
  const last = out[out.length - 1];
  out.push({ ...last, body: 38, gap: 14, check: 40 });
  out.push({ ...last, body: 36, gap: 12, check: 40 });
  return out;
}

/** Alto (px) del cuerpo en párrafos, con la sangría de las citas. */
function cuerpoHeight(body: string, size: number, width: number, lineHeight: number): number {
  const ps = parrafos(body);
  const gap = Math.round(PARRAFO_GAP_EM * size);
  return ps.reduce((h, p) => h + interHeight(p, size, esCita(p) ? width - CITA_BORDE - CITA_PAD : width, lineHeight), 0) + gap * Math.max(0, ps.length - 1);
}

/** Alto estimado del bloque completo a una escala. */
function stepHeight(sc: StepScale, p: { step?: string; heading: string; highlight?: string; cursiva?: string; body?: string; bullets?: string[] }, tight: boolean): number {
  const keep = frasesNowrap(p.highlight, undefined, p.cursiva);
  const headingSize = fitDisplaySize(p.heading, sc.headingMax, { maxLines: 3, tight, keep });
  let h = displayHeight(p.heading, headingSize, displayLineHeight(p.heading, HEADING_LH), undefined, tight, keep);
  if (p.step) h += sc.chip + sc.blockGap;
  const bullets = p.bullets ?? [];
  if (p.body) h += sc.blockGap + cuerpoHeight(p.body, sc.body, CONTENT_WIDTH, 1.36);
  const textW = CONTENT_WIDTH - sc.check - 28;
  bullets.forEach((b, i) => {
    h += interHeight(b, sc.body, textW, 1.3) + (i > 0 ? sc.gap : sc.blockGap);
  });
  return h;
}

/**
 * Rol 3 — Paso del desarrollo (1 idea por slide). El número va en serif cursiva
 * dentro de un cuadro lima; debajo, el heading en Inter 700 (con marcador y,
 * opcional, frase en serif cursiva) y el cuerpo sobre el papel, sin tarjeta: una
 * cita «…» lleva un borde lima a la izquierda. Las viñetas son un checklist con
 * círculo lima y ✓. La escala se elige para llenar el área útil sin desbordar.
 */
export function Step({ step, heading, highlight, cursiva, body, bullets, accent: _accent, format = "post", ...base }: StepProps) {
  const hasBullets = !!bullets && bullets.length > 0;
  const reel = format === "reel";
  const keep = frasesNowrap(highlight, undefined, cursiva);
  const sc = pickFill(scales(format), (c) => stepHeight(c, { step, heading, highlight, cursiva, body, bullets }, reel), contentHeight(format, base.source, base.narracion, base.subtitulos), format, STEP_REEL_FILL);
  const headingSize = fitDisplaySize(heading, sc.headingMax, { maxLines: 3, tight: reel, keep });
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: sc.blockGap }}>
        {step && (
          <span
            data-anim="rise"
            data-paso="numero"
            data-junto=""
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
            {step}
          </span>
        )}
        <h2 data-anim="words" data-paso="heading" style={{ ...titular, fontSize: headingSize, lineHeight: displayLineHeight(heading, HEADING_LH), textWrap: "balance" }}>
          {highlightText(heading, highlight, theme.colors.accent, undefined, undefined, cursiva)}
        </h2>
        {body && (
          <div data-anim="rise">
            <Parrafos
              text={body}
              size={sc.body}
              style={{ fontFamily: theme.fonts.body, fontWeight: 400, lineHeight: 1.36, letterSpacing: "-0.01em", color: theme.colors.text, textWrap: "pretty" }}
              citaStyle={{ borderLeft: `${CITA_BORDE}px solid ${theme.colors.accent}`, paddingLeft: CITA_PAD }}
            />
          </div>
        )}
        {hasBullets && (
          <ul data-anim="stagger" style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: sc.gap }}>
            {bullets!.map((item, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 28, fontFamily: theme.fonts.body, fontSize: sc.body, lineHeight: 1.3 }}>
                <span style={{ display: "flex", paddingTop: Math.max(0, (sc.body * 1.3 - sc.check) / 2) }}>
                  <CheckCircle size={sc.check} />
                </span>
                <span style={{ color: theme.colors.text, textWrap: "pretty" }}>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Frame>
  );
}
