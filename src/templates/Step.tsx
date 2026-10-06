import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { fitDisplaySize, CONTENT_WIDTH } from "./fit.ts";
import { Card, CheckCircle } from "./ui.tsx";
import { contentHeight, antonHeight, interHeight, pickFill } from "./layout.ts";
import type { BaseSlideProps, Format } from "./types.ts";
import { theme } from "../theme.ts";

export interface StepProps extends BaseSlideProps {
  /** Número o índice del paso (ej. "01"). Opcional. */
  step?: string;
  /** Título del paso. ≤6 palabras. */
  heading: string;
  /** Palabra del heading a resaltar en lima. */
  highlight?: string;
  /** Cuerpo del paso. ≤240 caracteres. */
  body?: string;
  /** Lista de viñetas (alternativa o complemento a `body`): se pintan como checklist. */
  bullets?: string[];
}

/**
 * Fill del reel para Step: su estimador sobreestima ~15 % (viñetas y tarjeta),
 * así que pide más para terminar ocupando ~75-85 % real del alto útil.
 */
const STEP_REEL_FILL = 0.96;

/** Medidas de un Step a una escala dada. */
interface StepScale {
  number: number;
  headingMax: number;
  body: number;
  /** Separación entre viñetas. */
  gap: number;
  /** Separación entre bloques (número+heading ↔ tarjeta). */
  blockGap: number;
  /** Padding de la tarjeta (vertical, horizontal). */
  padY: number;
  padX: number;
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
    number: Math.round((reel ? 192 : theme.fontSize.stepNumber) * s),
    headingMax: Math.round((reel ? 124 : theme.fontSize.heading) * s),
    body: Math.max(40, Math.min(reel ? 56 : 46, Math.round((reel ? 48 : 42) * s))),
    gap: Math.round(30 * s),
    blockGap: Math.round(44 * s),
    padY: Math.round((reel ? 56 : 48) * Math.min(1, s)),
    padX: Math.round((reel ? 56 : 52) * Math.min(1, s)),
    check: s >= 0.9 ? 52 : 44,
  }));
  // Últimos recursos: cuerpo 38 y 36 px para no cortar texto.
  const last = out[out.length - 1];
  out.push({ ...last, body: 38, gap: 14, check: 40 });
  out.push({ ...last, body: 36, gap: 12, number: Math.round(last.number * 0.9), check: 40 });
  return out;
}

/** Alto estimado del bloque completo a una escala. */
function stepHeight(sc: StepScale, p: { step?: string; heading: string; highlight?: string; body?: string; bullets?: string[] }, tight: boolean): number {
  const headingSize = fitDisplaySize(p.heading, sc.headingMax, { maxLines: 2, tight, keep: [p.highlight] });
  let h = antonHeight(p.heading, headingSize, 1.0, undefined, tight, [p.highlight]);
  if (p.step) h += sc.number * 0.9 + 12;
  const bullets = p.bullets ?? [];
  if (!p.body && bullets.length === 0) return h;
  const inner = CONTENT_WIDTH - 2 * sc.padX - 4;
  let card = 2 * sc.padY + 4;
  if (p.body) card += interHeight(p.body, sc.body, inner, 1.4);
  if (p.body && bullets.length) card += 36;
  const textW = inner - sc.check - 28;
  bullets.forEach((b, i) => {
    card += interHeight(b, sc.body, textW, 1.3);
    if (i > 0) card += sc.gap;
  });
  return h + sc.blockGap + card;
}

/**
 * Rol 3 — Paso del desarrollo (1 idea por slide). Número de paso grande en lima
 * (Anton) sobre el heading MAYÚS; el cuerpo y las viñetas van dentro de una
 * tarjeta, y las viñetas son un checklist con círculo lima y ✓. La escala se
 * elige para llenar el área útil sin desbordar (post y reel).
 */
export function Step({ step, heading, highlight, body, bullets, accent, format = "post", ...base }: StepProps) {
  const lime = accent ?? theme.colors.accent;
  const hasBullets = !!bullets && bullets.length > 0;
  const hasCard = !!body || hasBullets;
  const sc = pickFill(scales(format), (c) => stepHeight(c, { step, heading, highlight, body, bullets }, format === "reel"), contentHeight(format, base.source), format, STEP_REEL_FILL);
  const headingSize = fitDisplaySize(heading, sc.headingMax, { maxLines: 2, tight: format === "reel", keep: [highlight] });
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: sc.blockGap }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {step && (
            <span data-anim="rise" style={{ fontFamily: theme.fonts.display, fontSize: sc.number, lineHeight: 0.9, color: lime, letterSpacing: "0.01em" }}>
              {step}
            </span>
          )}
          <h2
            data-anim="words"
            style={{
              margin: 0,
              fontFamily: theme.fonts.display,
              fontWeight: 400,
              fontSize: headingSize,
              lineHeight: 1.0,
              textTransform: "uppercase",
              textWrap: "balance",
            }}
          >
            {highlightText(heading, highlight, lime)}
          </h2>
        </div>
        {hasCard && (
          <Card anim="rise" style={{ padding: `${sc.padY}px ${sc.padX}px`, display: "flex", flexDirection: "column", gap: 36 }}>
            {body && (
              <p style={{ margin: 0, fontFamily: theme.fonts.body, fontSize: sc.body, lineHeight: 1.4, color: theme.colors.textSoft, textWrap: "pretty" }}>{body}</p>
            )}
            {hasBullets && (
              <ul data-anim="stagger" style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: sc.gap }}>
                {bullets!.map((item, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 28, fontFamily: theme.fonts.body, fontSize: sc.body, lineHeight: 1.3 }}>
                    <span style={{ display: "flex", paddingTop: Math.max(0, (sc.body * 1.3 - sc.check) / 2) }}>
                      <CheckCircle color={lime} size={sc.check} />
                    </span>
                    <span style={{ color: theme.colors.text, textWrap: "pretty" }}>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </Frame>
  );
}
