import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { fitDisplaySize } from "./fit.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface HookProps extends BaseSlideProps {
  /** Texto pequeño superior (ej. "QUÉ SE LANZÓ"). */
  eyebrow?: string;
  /** Titular que detiene el scroll. ≤9 palabras. */
  title: string;
  /** Palabra(s) del titular a resaltar en cian (1-2 palabras). */
  highlight?: string;
  /** Gancho secundario breve. */
  subtitle?: string;
  /** Tamaño del titular en px. Por defecto se calcula según la longitud. */
  titleSize?: number;
  /** Muestra "DESLIZA →" abajo-derecha (solo la portada). Por defecto true. */
  swipe?: boolean;
}

/**
 * Rol 1 — Portada / Hook (stop-scroll). Titular Anton dominante anclado abajo,
 * con la palabra clave en cian. El tamaño se ajusta a la longitud del titular
 * (cortos enormes, largos sin recortarse). Único slide con "DESLIZA →".
 */
export function Hook({ eyebrow, title, highlight, subtitle, titleSize, swipe = true, format, accent, ...base }: HookProps) {
  const cyan = accent ?? theme.colors.accent;
  const titleFont = titleSize ?? fitDisplaySize(title);
  // "DESLIZA →" solo tiene sentido en carrusel; en Reel (video) se oculta.
  const showSwipe = swipe !== false && format !== "reel";
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: theme.space.md }}>
        {eyebrow && (
          <span
            style={{
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSize.label,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: cyan,
            }}
          >
            {eyebrow}
          </span>
        )}
        <h1
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontSize: titleFont,
            lineHeight: 0.92,
            textTransform: "uppercase",
            letterSpacing: theme.tracking.display,
          }}
        >
          {highlightText(title, highlight, cyan, "slab")}
        </h1>
        {subtitle && (
          <p style={{ margin: 0, fontFamily: theme.fonts.body, fontSize: theme.fontSize.lead, lineHeight: 1.3, color: theme.colors.textMuted }}>
            {subtitle}
          </p>
        )}
        {showSwipe && (
          <span
            style={{
              alignSelf: "flex-end",
              marginTop: 8,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSize.label,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: theme.colors.textMuted,
            }}
          >
            Desliza →
          </span>
        )}
      </div>
    </Frame>
  );
}
