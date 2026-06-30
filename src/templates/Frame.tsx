import type { CSSProperties, ReactNode } from "react";
import type { Background, Pillar, Format } from "./types.ts";
import { FORMATS } from "./types.ts";
import { theme, pillarColor } from "../theme.ts";

/** Margen inferior reservado en Reels: la UI de IG tapa los últimos ~420px. */
const REEL_SAFE_BOTTOM = 440;

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
  const hasProgress = typeof index === "number" && typeof total === "number";
  const dim = FORMATS[format];
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
        // En Reel, reserva la zona segura inferior (UI de IG) sin tapar el contenido.
        paddingBottom: format === "reel" ? REEL_SAFE_BOTTOM : theme.padding,
        fontFamily: fontFamily ?? theme.fontFamily,
        color: color ?? theme.colors.text,
        backgroundColor: theme.colors.bg,
        // Sin background explícito → superficie de marca (gradiente+glow+grano);
        // con background → se respeta el declarado.
        ...(background ? backgroundStyle(background) : brandSurfaceStyle()),
        ...style,
      }}
    >
      {scrimLayer(background)}
      {vignetteLayer()}
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

/**
 * Superficie de marca por defecto (cuando el slide no trae `background`): navy →
 * near-black con un glow cian superior y una capa de grano sutil. Sube el valor
 * percibido frente al navy plano, sin tocar los CarouselSpec.
 */
function brandSurfaceStyle(): CSSProperties {
  return {
    backgroundColor: theme.colors.bg,
    backgroundImage: [
      `radial-gradient(120% 80% at 70% 0%, ${theme.surface.glow}, transparent 55%)`,
      `linear-gradient(180deg, ${theme.colors.bg}, ${theme.surface.bgDeep})`,
      "var(--brand-grain)",
    ].join(", "),
  };
}

/**
 * Scrim DIRECCIONAL (de abajo→arriba) + viñeta sutil, para garantizar contraste
 * del texto anclado abajo sobre fondos `{image}`/`{ai}` sin apagar la imagen.
 * `overlay` controla la intensidad del scrim (default 0.9). Para fondos sin
 * imagen ni `overlay`, no se pinta nada (igual que antes).
 */
/** Viñeta sutil de bordes, SIEMPRE presente, para profundidad de "dark UI". */
function vignetteLayer() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: theme.surface.vignette,
      }}
    />
  );
}

function scrimLayer(bg?: Background) {
  if (!bg) return null;
  const hasImage = "image" in bg;
  const overlay = "overlay" in bg ? bg.overlay : undefined;
  if (!hasImage && overlay === undefined) return null;
  const a = Math.min(1, Math.max(0, overlay ?? 0.9));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          `radial-gradient(140% 100% at 50% 0%, transparent 40%, rgba(7,10,18,0.35)), ` +
          `linear-gradient(180deg, transparent 28%, rgba(7,10,18,${a}) 100%)`,
      }}
    />
  );
}
