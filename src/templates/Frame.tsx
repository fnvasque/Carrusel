import type { CSSProperties, ReactNode } from "react";
import type { Background, Format } from "./types.ts";
import { FORMATS } from "./types.ts";
import { theme, serieLabel, monoText } from "../theme.ts";
import { REEL_SAFE_BOTTOM, REEL_SAFE_TOP, POST_PAD_Y, HEADER_HEIGHT, CONTENT_GAP_TOP, SOURCE_SIZE, FIRMA_SIZE, sourceReserve, firmaReserve, subtituloReserve, opticalLift } from "./layout.ts";

export { REEL_SAFE_BOTTOM, HEADER_HEIGHT };

/**
 * Capa base de cada slide (look papel): ocupa el lienzo completo (1080x1350 o
 * 1080x1920) y pinta, de abajo arriba: papel liso, fondo opcional (color,
 * degradado o imagen, con overlay) y el contenido. Sin grilla ni viñeta.
 * Encima, los elementos de marca comunes (no se animan en el reel):
 *  - arriba-izquierda, el nombre de la serie (`serie`); sin serie queda vacío,
 *  - post: abajo, la firma (círculo con iniciales + nombre, y la línea de la
 *    cuenta con `firmaLinea`) a la izquierda y `n/total` en serif cursiva a la
 *    derecha; la fuente al pie va encima de la firma,
 *  - reel: arriba-derecha, la firma compacta; nada en el pie salvo la fuente.
 *
 * En Reel, el fondo opcional va en una capa `data-anim="bg"` (la anima el
 * runtime); en post, todo es estático. Las plantillas envuelven su contenido en
 * <Frame>. `logoEnCuadro0` y `showLogo` se aceptan sin efecto (ya no hay wordmark).
 *
 * El área de contenido va entre la cabecera y el pie (se reserva el alto real
 * de la fuente, según su nº de líneas, y el de la firma del post) y deja abajo
 * un alza óptica, para que un bloque centrado quede algo por encima del centro
 * geométrico.
 */
export function Frame({
  background,
  fontFamily,
  color,
  serie,
  index,
  total,
  source,
  format = "post",
  firmaLinea = false,
  narracion,
  style,
  children,
}: {
  background?: Background;
  fontFamily?: string;
  color?: string;
  /** Serie de la pieza: su rótulo va en la cabecera izquierda. */
  serie?: string;
  index?: number;
  total?: number;
  source?: string;
  /** Acepta el prop de las plantillas; no tiene efecto (ya no se pinta el wordmark). */
  showLogo?: boolean;
  /** Acepta el prop del calendario; no tiene efecto (ya no se pinta el wordmark). */
  logoEnCuadro0?: boolean;
  format?: Format;
  /** Post: la firma del pie lleva debajo `theme.firma.linea`. */
  firmaLinea?: boolean;
  /** Reel: la escena lleva subtítulo de narración; el contenido deja su espacio (`SUBTITULO_RESERVA`). */
  narracion?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const reel = format === "reel";
  const dim = FORMATS[format];
  const rotulo = serieLabel(serie);
  const pagina = typeof index === "number" && typeof total === "number" ? `${index}/${total}` : undefined;
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
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        {/* Cabecera de marca: serie a la izquierda; en el reel, la firma compacta a la derecha */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: HEADER_HEIGHT, flexShrink: 0 }}>
          {rotulo ? (
            <span
              data-brand="serie"
              style={{
                fontFamily: theme.fonts.body,
                fontWeight: 700,
                fontSize: 26,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: theme.colors.ink,
                whiteSpace: "nowrap",
              }}
            >
              {rotulo}
            </span>
          ) : (
            <span />
          )}
          {/* El círculo (56) es más alto que la cabecera (44): arranca arriba y se asoma al aire de abajo, sin pasar la zona segura. */}
          {reel && (
            <div style={{ alignSelf: "flex-start" }}>
              <Firma circulo={56} nombre={28} />
            </div>
          )}
        </div>
        {/* Contenido del slide */}
        <div data-content="" style={{ display: "flex", flexDirection: "column", width: "100%", flex: 1, minHeight: 0, paddingTop: CONTENT_GAP_TOP, paddingBottom: sourceReserve(source) + firmaReserve(format) + subtituloReserve(format, narracion) + opticalLift(format) }}>
          {children}
        </div>
        {/* Marca: fuente al pie (encima de la firma en el post) */}
        {source && (
          <span
            data-brand="source"
            style={{
              position: "absolute",
              bottom: firmaReserve(format),
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
        {/* Pie del post: firma a la izquierda, n/total a la derecha */}
        {!reel && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: FIRMA_SIZE, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Firma circulo={FIRMA_SIZE} nombre={32} linea={firmaLinea} />
            {pagina && (
              <span data-brand="pagina" style={{ fontFamily: theme.fonts.serif, fontStyle: "italic", fontSize: 56, lineHeight: 1, color: theme.colors.ink }}>
                {pagina}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Firma de la cuenta: círculo tinta con las iniciales en serif cursiva lima y el nombre (y, opcional, la línea). */
function Firma({ circulo, nombre, linea = false }: { circulo: number; nombre: number; linea?: boolean }) {
  return (
    <div data-brand="firma" style={{ display: "flex", alignItems: "center", gap: Math.round(circulo * 0.24), flexShrink: 0 }}>
      <div
        style={{
          width: circulo,
          height: circulo,
          borderRadius: "50%",
          backgroundColor: theme.colors.ink,
          color: theme.colors.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: theme.fonts.serif,
          fontStyle: "italic",
          fontSize: Math.round(circulo * 0.52),
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {theme.firma.iniciales}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: theme.fonts.body, fontWeight: 700, fontSize: nombre, lineHeight: 1.1, color: theme.colors.ink }}>{theme.firma.nombre}</span>
        {linea && <span style={{ fontFamily: theme.fonts.body, fontWeight: 400, fontSize: 24, lineHeight: 1.2, color: theme.colors.textMuted }}>{theme.firma.linea}</span>}
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
        backgroundColor: `rgba(6,6,10,${overlay})`,
      }}
    />
  );
}
