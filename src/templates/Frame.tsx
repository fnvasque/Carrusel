import type { CSSProperties, ReactNode } from "react";
import type { Background, Pillar } from "./types.ts";
import { CANVAS } from "./types.ts";
import { theme, pillarColor } from "../theme.ts";

/**
 * Capa base de cada slide: ocupa el lienzo completo (1080x1350), pinta el
 * fondo (color, degradado o imagen) y un overlay opcional para legibilidad,
 * y coloca el contenido encima. Además pinta los elementos de marca comunes a
 * todas las piezas (design-brand.md §4): logo arriba-izquierda, chip de pilar,
 * indicador de progreso y fuente al pie. Todos son opcionales: sin esas props,
 * el render es idéntico al anterior.
 *
 * Las plantillas envuelven su contenido en <Frame> para no repetir esta lógica.
 */
export function Frame({
  background,
  fontFamily,
  color,
  pillar,
  index,
  total,
  source,
  showLogo = true,
  style,
  children,
}: {
  background?: Background;
  fontFamily?: string;
  color?: string;
  pillar?: Pillar;
  index?: number;
  total?: number;
  source?: string;
  showLogo?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const hasProgress = typeof index === "number" && typeof total === "number";
  return (
    <div
      style={{
        position: "relative",
        width: CANVAS.width,
        height: CANVAS.height,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        padding: theme.padding,
        fontFamily: fontFamily ?? theme.fontFamily,
        color: color ?? theme.colors.text,
        backgroundColor: theme.colors.bg,
        ...backgroundStyle(background),
        ...style,
      }}
    >
      {overlayLayer(background)}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        {/* Marca: logo arriba-izquierda */}
        {showLogo && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 140,
              height: 56,
              backgroundImage: "var(--brand-logo)",
              backgroundSize: "contain",
              backgroundPosition: "left center",
              backgroundRepeat: "no-repeat",
            }}
          />
        )}
        {/* Marca: chip de pilar + progreso, arriba-derecha */}
        {(pillar || hasProgress) && (
          <div style={{ position: "absolute", top: 0, right: 0, display: "flex", alignItems: "center", gap: 16 }}>
            {pillar && (
              <span
                style={{
                  fontFamily: theme.fonts.body,
                  fontSize: theme.fontSize.label,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: theme.colors.bg,
                  backgroundColor: pillarColor(pillar),
                  padding: "10px 20px",
                  borderRadius: 999,
                }}
              >
                {pillar}
              </span>
            )}
            {hasProgress && (
              <span
                style={{
                  fontFamily: theme.fonts.display,
                  fontSize: theme.fontSize.label,
                  letterSpacing: "0.08em",
                  color: theme.colors.textMuted,
                }}
              >
                {pad(index!)}/{pad(total!)}
              </span>
            )}
          </div>
        )}
        {/* Contenido del slide */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>{children}</div>
        {/* Marca: fuente al pie */}
        {source && (
          <span
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSize.label,
              letterSpacing: "0.06em",
              color: theme.colors.textMuted,
            }}
          >
            {source}
          </span>
        )}
      </div>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function backgroundStyle(bg?: Background): CSSProperties {
  if (!bg) return {};
  if ("color" in bg) return { backgroundColor: bg.color };
  if ("gradient" in bg) return { backgroundImage: bg.gradient };
  if ("image" in bg) {
    return {
      backgroundImage: `url("${bg.image}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }
  // Un fondo { ai } que no fue resuelto a { image } no debería llegar aquí;
  // se deja transparente para que el error sea visible.
  return {};
}

/** Capa oscura encima del fondo para mejorar el contraste del texto. */
function overlayLayer(bg?: Background) {
  const overlay = bg && "overlay" in bg ? bg.overlay : undefined;
  if (!overlay) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: `rgba(0,0,0,${overlay})`,
      }}
    />
  );
}
