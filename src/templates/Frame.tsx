import type { CSSProperties, ReactNode } from "react";
import type { Background } from "./types.ts";
import { CANVAS } from "./types.ts";
import { theme } from "../theme.ts";

/**
 * Capa base de cada slide: ocupa el lienzo completo (1080x1350), pinta el
 * fondo (color, degradado o imagen) y un overlay opcional para legibilidad,
 * y coloca el contenido encima.
 *
 * Las plantillas envuelven su contenido en <Frame> para no repetir la lógica
 * de fondo en cada una.
 */
export function Frame({
  background,
  fontFamily,
  color,
  style,
  children,
}: {
  background?: Background;
  fontFamily?: string;
  color?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
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
        {children}
      </div>
    </div>
  );
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
