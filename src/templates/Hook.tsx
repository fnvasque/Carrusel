import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { fitDisplaySize } from "./fit.ts";
import { contentHeight, antonHeight, interHeight, pickFill } from "./layout.ts";
import { MonoLabel } from "./ui.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

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
}

/**
 * Rol 1 — Portada / Hook (stop-scroll). Titular Anton gigante anclado abajo
 * (centrado en el reel), con la palabra clave en lima y, opcional, una palabra
 * con caja rosa (`mark`). El tamaño se ajusta a la longitud del titular.
 * Único slide con "DESLIZA →" (solo post).
 */
export function Hook({ eyebrow, title, highlight, mark, subtitle, titleSize, swipe = true, format, accent, ...base }: HookProps) {
  const lime = accent ?? theme.colors.accent;
  const reel = format === "reel";
  // Reel: bloque centrado y más grande; el titular toma el mayor tamaño (hasta
  // 220 px, ≤ 6 líneas) con el que el bloque llena el área útil sin desbordar.
  const subSize = reel ? 52 : 44;
  const reelTitle = (max: number) => fitDisplaySize(title, max, { maxLines: 6, tight: true, keep: [highlight, mark] });
  const titleFont =
    titleSize ??
    (reel
      ? reelTitle(
          pickFill(
            [220, 208, 196, 184, 172, 160, 148, 136],
            (m) => {
              const s = reelTitle(m);
              let h = antonHeight(title, s, 0.98, undefined, true, [highlight, mark]);
              if (eyebrow) h += 34 + 36;
              if (subtitle) h += 36 + interHeight(subtitle, subSize, 820, 1.3);
              return h;
            },
            contentHeight(format, base.source),
            format,
          ),
        )
      : fitDisplaySize(title, theme.fontSize.display, { maxLines: 4 }));
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
        <h1
          data-anim="words"
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontWeight: 400,
            fontSize: titleFont,
            lineHeight: 0.98,
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
