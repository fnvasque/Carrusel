import type { CSSProperties, ReactNode } from "react";
import type { Background, Pillar, Format } from "./types.ts";
import { FORMATS } from "./types.ts";
import { theme, pillarColor, monoText } from "../theme.ts";
import { REEL_SAFE_BOTTOM, REEL_SAFE_TOP, POST_PAD_Y, HEADER_HEIGHT, CONTENT_GAP_TOP, SOURCE_SIZE, sourceReserve, opticalLift } from "./layout.ts";

export { REEL_SAFE_BOTTOM, HEADER_HEIGHT };

/**
 * Capa base de cada slide: ocupa el lienzo completo (1080x1350 o 1080x1920) y
 * pinta, de abajo arriba: fondo casi negro, fondo opcional (color, degradado o
 * imagen, con overlay), grilla lima, viñeta y el contenido. Encima, los
 * elementos de marca comunes (no se animan en el reel):
 *  - arriba-izquierda, etiqueta mono `NN / PILAR` (número en color del pilar),
 *  - arriba-derecha, el wordmark `ia.es`,
 *  - abajo, la fuente al pie en mono pequeña.
 *
 * En Reel, el fondo opcional va en una capa `data-anim="bg"` y la grilla en una
 * capa propia `data-grid` (más grande que el lienzo, para poder derivar); en
 * post, todo es estático. Las plantillas envuelven su contenido en <Frame>.
 *
 * El área de contenido va entre la cabecera y la fuente al pie (se reserva el
 * alto real de la fuente, según su nº de líneas) y deja abajo un alza óptica,
 * para que un bloque centrado quede algo por encima del centro geométrico.
 * `total` no se pinta (la etiqueta solo lleva el nº de slide): se acepta para
 * que las plantillas puedan pasar sus props base tal cual.
 */
export function Frame({
  background,
  fontFamily,
  color,
  pillar,
  index,
  source,
  showLogo = true,
  format = "post",
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
  format?: Format;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const reel = format === "reel";
  const dim = FORMATS[format];
  const hasImage = !!background && "image" in background;
  const label = headerLabel(pillar, index);
  return (
    <div
      style={{
        position: "relative",
        width: dim.width,
        height: dim.height,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        padding: theme.padding,
        paddingTop: reel ? REEL_SAFE_TOP : POST_PAD_Y,
        // En Reel, reserva la zona segura inferior (UI de IG) sin tapar el contenido.
        paddingBottom: reel ? REEL_SAFE_BOTTOM : POST_PAD_Y,
        fontFamily: fontFamily ?? theme.fontFamily,
        color: color ?? theme.colors.text,
        backgroundColor: theme.colors.bg,
        // En Reel el fondo va en una capa animable (data-anim="bg"); en post, en la raíz.
        ...(reel ? {} : backgroundStyle(background)),
        ...style,
      }}
    >
      {reel && background && <div data-anim="bg" style={{ position: "absolute", inset: 0, ...backgroundStyle(background) }} />}
      {overlayLayer(background)}
      {/* Grilla lima: sobre una imagen va más tenue para no ensuciarla. */}
      <div
        {...(reel ? { "data-grid": "" } : {})}
        style={{
          position: "absolute",
          // En Reel sobra una celda por lado para que la deriva no deje bordes vacíos.
          inset: reel ? -theme.grid.cell : 0,
          backgroundImage: gridImage(),
          backgroundSize: `${theme.grid.cell}px ${theme.grid.cell}px`,
          backgroundPosition: reel ? "0 0" : "-2px -2px",
          opacity: hasImage ? 0.55 : 1,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "absolute", inset: 0, backgroundImage: theme.vignette, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        {/* Cabecera de marca: etiqueta NN / PILAR + wordmark */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: HEADER_HEIGHT, flexShrink: 0 }}>
          {label ? (
            <span
              data-brand="label"
              style={{
                ...monoText,
                fontSize: theme.fontSize.label,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: theme.colors.text,
                whiteSpace: "nowrap",
              }}
            >
              {label.num && <span style={{ color: pillarColor(pillar) }}>{label.num}</span>}
              {label.num && label.text && <span style={{ color: theme.colors.textMuted }}>{" / "}</span>}
              {label.text}
            </span>
          ) : (
            <span />
          )}
          {showLogo && (
            <div
              data-brand="logo"
              style={{
                width: 110,
                height: 44,
                backgroundImage: "var(--brand-logo)",
                backgroundSize: "contain",
                backgroundPosition: "right center",
                backgroundRepeat: "no-repeat",
              }}
            />
          )}
        </div>
        {/* Contenido del slide */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%", flex: 1, minHeight: 0, paddingTop: CONTENT_GAP_TOP, paddingBottom: sourceReserve(source) + opticalLift(format) }}>
          {children}
        </div>
        {/* Marca: fuente al pie */}
        {source && (
          <span
            data-brand="source"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              ...monoText,
              fontSize: SOURCE_SIZE,
              lineHeight: 1.35,
              letterSpacing: "0.02em",
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

/** Etiqueta de cabecera: número de slide (2 dígitos) y pilar, ambos opcionales. */
function headerLabel(pillar?: Pillar, index?: number): { num?: string; text?: string } | null {
  const num = typeof index === "number" ? String(index).padStart(2, "0") : undefined;
  const text = pillar ? pillar.toUpperCase() : undefined;
  if (!num && !text) return null;
  return { num, text };
}

/** Grilla de dos degradados lineales (líneas horizontales y verticales). */
function gridImage(): string {
  const { color, line } = theme.grid;
  return `linear-gradient(${color} ${line}px, transparent ${line}px), linear-gradient(90deg, ${color} ${line}px, transparent ${line}px)`;
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
        backgroundColor: `rgba(6,6,10,${overlay})`,
      }}
    />
  );
}
