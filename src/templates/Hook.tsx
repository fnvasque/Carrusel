import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { fitDisplaySize, CONTENT_WIDTH, displayLineHeight } from "./fit.ts";
import { contentHeight, antonHeight, interHeight, pickFill, CHAR_EM } from "./layout.ts";
import { MonoLabel } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme, monoText } from "../theme.ts";

export interface HookProps extends BaseSlideProps {
  /** Texto pequeño superior (ej. "QUÉ SE LANZÓ"). */
  eyebrow?: string;
  /** Titular que detiene el scroll. ≤9 palabras. */
  title: string;
  /** Palabra(s) del titular a resaltar en lima (1-2 palabras). */
  highlight?: string;
  /** Palabra del titular con caja de color detrás (rosa), estilo "NINGUNO.". */
  mark?: string;
  /** Gancho secundario breve. */
  subtitle?: string;
  /** Tamaño del titular en px. Por defecto se calcula según la longitud. */
  titleSize?: number;
  /** Muestra "DESLIZA →" abajo-derecha (solo la portada). Por defecto true. */
  swipe?: boolean;
  /**
   * El resultado en el primer cuadro (pivote 2026-10-17): lo que la IA ya hizo,
   * tal como se ve en pantalla, en una tarjeta arriba del titular. `modo`
   * "aviso" dibuja una notificación del celular (app + "ahora" + texto);
   * "respuesta", una burbuja de chat con la respuesta de la IA. Con
   * `resultado` el titular se achica (≤ 150 px) y va debajo, como pie de foto.
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

/**
 * Rol 1 — Portada / Hook (stop-scroll). Titular Anton gigante anclado abajo
 * (centrado en el reel), con la palabra clave en lima y, opcional, una palabra
 * con caja rosa (`mark`). El tamaño se ajusta a la longitud del titular.
 * Único slide con "DESLIZA →" (solo post).
 */
export function Hook({ eyebrow, title, highlight, mark, subtitle, titleSize, swipe = true, resultado, app, modo = "aviso", format, accent, ...base }: HookProps) {
  const lime = accent ?? theme.colors.accent;
  const reel = format === "reel";
  const conResultado = typeof resultado === "string" && resultado.trim().length > 0;
  const cardW = CONTENT_WIDTH;
  const cardH = conResultado ? resultadoHeight(resultado, reel, cardW) + (reel ? 48 : 36) : 0;
  // Reel: bloque centrado y más grande; el titular toma el mayor tamaño (hasta
  // 220 px, ≤ 6 líneas) con el que el bloque llena el área útil sin desbordar.
  const subSize = reel ? 52 : 44;
  const reelTitle = (max: number) => fitDisplaySize(title, max, { maxLines: 6, tight: true, keep: [highlight, mark] });
  const titleFont =
    titleSize ??
    (reel
      ? reelTitle(
          pickFill(
            // Con resultado el titular es pie de foto: ≤ 150 px, la tarjeta manda.
            (conResultado ? [150, 140, 130, 120, 110, 100] : [220, 208, 196, 184, 172, 160, 148, 136]),
            (m) => {
              const s = reelTitle(m);
              let h = antonHeight(title, s, displayLineHeight(title, 0.98), undefined, true, [highlight, mark]) + cardH;
              if (eyebrow) h += 34 + 36;
              if (subtitle) h += 36 + interHeight(subtitle, subSize, 820, 1.3);
              return h;
            },
            contentHeight(format, base.source, base.narracion),
            format,
          ),
        )
      : fitDisplaySize(title, conResultado ? 110 : theme.fontSize.display, { maxLines: 4 }));
  const resultadoSize = reel ? RESULTADO_SIZE.reel : RESULTADO_SIZE.post;
  // "DESLIZA →" solo tiene sentido en carrusel; en Reel (video) se oculta.
  const showSwipe = swipe !== false && !reel;
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: reel ? "center" : "flex-end", flex: 1, gap: 36 }}>
        {eyebrow && (
          <MonoLabel anim="rise" color={lime}>
            {eyebrow}
          </MonoLabel>
        )}
        {conResultado && (
          // Visible desde el cuadro 0 (sin data-anim): el resultado es lo primero que se ve.
          <div
            data-resultado={modo}
            style={{
              width: cardW,
              borderRadius: 32,
              overflow: "hidden",
              backgroundColor: modo === "aviso" ? "#1B1B24" : theme.colors.card,
              border: `2px solid ${modo === "aviso" ? "#2E2E3A" : theme.colors.line}`,
              boxShadow: "0 28px 70px rgba(0,0,0,0.55)",
              ...(modo === "respuesta" ? { borderBottomLeftRadius: 10 } : {}),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "28px 40px 0" }}>
              <span style={{ width: 44, height: 44, borderRadius: modo === "aviso" ? 12 : "50%", backgroundColor: lime, display: "inline-flex", alignItems: "center", justifyContent: "center", color: theme.colors.onAccent, fontFamily: theme.fonts.display, fontSize: 28 }}>
                {(app ?? "IA").trim().charAt(0).toUpperCase()}
              </span>
              <span style={{ ...monoText, fontSize: 28, letterSpacing: "0.06em", color: theme.colors.text }}>{app ?? "IA"}</span>
              <span style={{ marginLeft: "auto", ...monoText, fontSize: 24, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.colors.textMuted }}>
                {modo === "aviso" ? "ahora" : "respuesta"}
              </span>
            </div>
            <p style={{ margin: 0, padding: "16px 40px 36px", fontFamily: theme.fonts.body, fontWeight: 600, fontSize: resultadoSize, lineHeight: 1.28, color: theme.colors.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {resultado}
            </p>
          </div>
        )}
        <h1
          data-anim="words"
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontWeight: 400,
            fontSize: titleFont,
            lineHeight: displayLineHeight(title, 0.98),
            textTransform: "uppercase",
            letterSpacing: "0.005em",
            textWrap: "balance",
          }}
        >
          {highlightText(title, highlight, lime, mark)}
        </h1>
        {subtitle && (
          <p data-anim="rise" style={{ margin: 0, maxWidth: 820, fontFamily: theme.fonts.body, fontSize: subSize, lineHeight: 1.3, color: theme.colors.textSoft, textWrap: "pretty" }}>
            {subtitle}
          </p>
        )}
        {showSwipe && (
          <MonoLabel color={theme.colors.text} style={{ alignSelf: "flex-end", marginTop: 4 }}>
            Desliza <span style={{ color: lime }}>→</span>
          </MonoLabel>
        )}
      </div>
    </Frame>
  );
}
