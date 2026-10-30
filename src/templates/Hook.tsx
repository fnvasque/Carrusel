import { Frame } from "./Frame.tsx";
import { highlightText, frasesNowrap } from "./highlight.tsx";
import { fitDisplaySize, CONTENT_WIDTH, displayLineHeight } from "./fit.ts";
import { contentHeight, displayHeight, interHeight, pickFill, CHAR_EM } from "./layout.ts";
import { Kicker, titular } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface HookProps extends BaseSlideProps {
  /** Texto pequeño superior (ej. "Qué se lanzó"), en serif cursiva. */
  eyebrow?: string;
  /** Titular que detiene el scroll. ≤9 palabras. */
  title: string;
  /** Palabra(s) del titular con el marcador lima detrás (1-2 palabras). */
  highlight?: string;
  /** Frase del titular (2-4 palabras, idealmente el inicio) en Instrument Serif cursiva. */
  cursiva?: string;
  /** Palabra del titular en una caja tinta con texto claro, estilo "NINGUNO.". */
  mark?: string;
  /** Gancho secundario breve. */
  subtitle?: string;
  /** Tamaño del titular en px. Por defecto se calcula según la longitud. */
  titleSize?: number;
  /** Muestra "Desliza →" abajo-derecha (solo la portada del carrusel). Por defecto true. */
  swipe?: boolean;
  /**
   * El resultado en el primer cuadro (pivote 2026-10-17): lo que la IA ya hizo,
   * tal como se ve en pantalla, en una tarjeta blanca arriba del titular. Solo
   * en el post: en el reel se ignora (desde 2026-11-02 la IA se ve en la escena 2). `modo`
   * "aviso" dibuja una notificación del celular (app + "ahora" + texto);
   * "respuesta", una burbuja de chat con la respuesta de la IA. Con
   * `resultado` el titular se achica y va debajo, como pie de foto.
   */
  resultado?: string;
  /** Nombre de la IA que produce el resultado (ChatGPT, NotebookLM…). Va en la tarjeta. */
  app?: string;
  /** Forma de la tarjeta de resultado: notificación ("aviso", por defecto) o burbuja de chat ("respuesta"). */
  modo?: "aviso" | "respuesta";
}

/** Tamaño (px) del texto de la tarjeta de resultado en el reel y en el post. */
const RESULTADO_SIZE = { reel: 50, post: 42 } as const;
/** Alto estimado (px) de la tarjeta de resultado: cabecera + padding + texto. */
function resultadoHeight(texto: string, reel: boolean, width: number): number {
  const size = reel ? RESULTADO_SIZE.reel : RESULTADO_SIZE.post;
  return 44 + 2 * 36 + 16 + interHeight(texto, size, width - 2 * 40, 1.28, CHAR_EM.interSemibold);
}

/** Interlineado base del titular (maqueta A3: 1,0). */
const TITLE_LH = 1.0;

/**
 * Rol 1 — Portada / Hook (stop-scroll). Titular Inter 700 grande centrado, con
 * la palabra clave sobre el marcador lima (`highlight`), una frase opcional en
 * serif cursiva (`cursiva`) y, opcional, una palabra en caja tinta (`mark`).
 * El tamaño se ajusta a la longitud del titular. En el post la firma del pie
 * lleva la línea de la cuenta y, abajo a la derecha, "Desliza →".
 */
export function Hook({ eyebrow, title, highlight, cursiva, mark, subtitle, titleSize, swipe = true, resultado, app, modo = "aviso", format, accent: _accent, firmaLinea, ...base }: HookProps) {
  const reel = format === "reel";
  // Con hookVideo el reel mezcla un video debajo (lighten): escena negra con texto claro.
  const oscuro = base.oscuro === true;
  // Reel (desde 2026-11-02, pedido de Felipe: demasiado texto en la portada): la tarjeta
  // de resultado no se pinta; la respuesta de la IA aparece en la escena siguiente (Screen).
  // En el post se mantiene.
  const conResultado = !reel && typeof resultado === "string" && resultado.trim().length > 0;
  const cardW = CONTENT_WIDTH;
  const cardH = conResultado ? resultadoHeight(resultado, reel, cardW) + (reel ? 48 : 36) : 0;
  const keep = frasesNowrap(highlight, mark, cursiva);
  const lh = displayLineHeight(title, TITLE_LH);
  // Reel: bloque centrado y más grande; el titular toma el mayor tamaño (hasta
  // 180 px, ≤ 6 líneas) con el que el bloque llena el área útil sin desbordar.
  const subSize = reel ? 48 : 40;
  const reelTitle = (max: number) => fitDisplaySize(title, max, { maxLines: 6, tight: true, keep });
  const titleFont =
    titleSize ??
    (reel
      ? reelTitle(
          pickFill(
            [180, 168, 156, 148, 140, 132, 124, 116],
            (m) => {
              const s = reelTitle(m);
              let h = displayHeight(title, s, lh, undefined, true, keep) + cardH;
              if (eyebrow) h += 56 + 36;
              if (subtitle) h += 36 + interHeight(subtitle, subSize, 820, 1.3);
              return h;
            },
            contentHeight(format, base.source, base.narracion, base.subtitulos),
            format,
          ),
        )
      : fitDisplaySize(title, conResultado ? 96 : theme.fontSize.display, { maxLines: 4 }));
  const resultadoSize = reel ? RESULTADO_SIZE.reel : RESULTADO_SIZE.post;
  // "Desliza →" solo tiene sentido en carrusel; en Reel (video) se oculta.
  const showSwipe = swipe !== false && !reel;
  return (
    <Frame format={format} firmaLinea={firmaLinea ?? !reel} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 36 }}>
        {eyebrow && <Kicker anim="rise" style={oscuro ? { color: "rgba(255,255,255,0.85)" } : undefined}>{eyebrow}</Kicker>}
        {conResultado && (
          // Visible desde el cuadro 0 (sin data-anim): el resultado es lo primero que se ve.
          <div
            data-resultado={modo}
            style={{
              width: cardW,
              borderRadius: theme.radius,
              overflow: "hidden",
              backgroundColor: theme.colors.card,
              boxShadow: "0 18px 48px rgba(17,17,17,0.10)",
              ...(modo === "respuesta" ? { borderBottomLeftRadius: 10 } : {}),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "28px 40px 0" }}>
              <span style={{ width: 44, height: 44, borderRadius: modo === "aviso" ? 12 : "50%", backgroundColor: theme.colors.ink, display: "inline-flex", alignItems: "center", justifyContent: "center", color: theme.colors.accent, fontFamily: theme.fonts.serif, fontStyle: "italic", fontSize: 30 }}>
                {(app ?? "IA").trim().charAt(0).toUpperCase()}
              </span>
              <span style={{ fontFamily: theme.fonts.body, fontWeight: 700, fontSize: 28, color: theme.colors.ink }}>{app ?? "IA"}</span>
              <span style={{ marginLeft: "auto", fontFamily: theme.fonts.body, fontSize: 24, color: theme.colors.textMuted }}>
                {modo === "aviso" ? "ahora" : "respuesta"}
              </span>
            </div>
            <p style={{ margin: 0, padding: "16px 40px 36px", fontFamily: theme.fonts.body, fontWeight: 600, fontSize: resultadoSize, lineHeight: 1.28, color: theme.colors.ink, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {resultado}
            </p>
          </div>
        )}
        <h1
          data-anim="words"
          style={{
            ...titular,
            ...(oscuro ? { color: "#FFFFFF" } : {}),
            fontSize: titleFont,
            lineHeight: lh,
            textWrap: "balance",
          }}
        >
          {highlightText(title, highlight, theme.colors.accent, mark, oscuro ? theme.colors.pink : theme.colors.ink, cursiva)}
        </h1>
        {subtitle && (
          <p data-anim="rise" style={{ margin: 0, maxWidth: 820, fontFamily: theme.fonts.body, fontWeight: 400, fontSize: subSize, lineHeight: 1.3, color: oscuro ? "rgba(255,255,255,0.85)" : theme.colors.textSoft, textWrap: "pretty" }}>
            {subtitle}
          </p>
        )}
        {showSwipe && (
          <span style={{ alignSelf: "flex-end", marginTop: 4, fontFamily: theme.fonts.body, fontWeight: 700, fontSize: 28, color: theme.colors.ink }}>
            Desliza →
          </span>
        )}
      </div>
    </Frame>
  );
}
