import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
import { fitDisplaySize } from "./fit.ts";
import { contentHeight, antonHeight, pickFill } from "./layout.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface StoryCoverProps extends BaseSlideProps {
  /** Titular de la portada (el `title` del Hook de la pieza). */
  title: string;
  /** Palabra(s) del titular a resaltar en lima (el `highlight` del Hook). */
  highlight?: string;
  /** Texto de la píldora lima de abajo. Por defecto "Nuevo en el feed ↑". */
  rotulo?: string;
}

/** Rótulo por defecto: la story avisa que hay una pieza nueva en el feed. */
export const STORY_ROTULO = "Nuevo en el feed ↑";

/** Píldora del rótulo: Inter 700 a 46 px, mismo estilo que la del Cta. */
const PILL = { size: 46, padY: 24, padX: 44, gap: 56 };
const PILL_HEIGHT = Math.round(PILL.size * 1.2) + 2 * PILL.padY;
/**
 * Interlineado del titular: algo más abierto que el 0.98 del Hook, porque en la
 * story el titular suele ir en 5-6 líneas y las tildes (Á, É) de una línea
 * tocaban la de arriba.
 */
const TITLE_LH = 1.12;

/**
 * Portada de la story (1080×1920, siempre 9:16): el hook de la pieza en el look
 * lima, titular Anton centrado y grande (franja ~15–75 % del alto) y, abajo, una
 * píldora lima con el rótulo, por encima de la zona segura inferior (440 px, la
 * reserva `Frame`). Es una imagen fija: no lleva marcas `data-anim` de entrada.
 * Solo la usa el motor del calendario; no está en el catálogo del remix.
 */
export function StoryCover({ title, highlight, rotulo = STORY_ROTULO, accent, format: _format, ...base }: StoryCoverProps) {
  const lime = accent ?? theme.colors.accent;
  const available = contentHeight("reel", base.source) - PILL_HEIGHT - PILL.gap;
  // Estimación holgada (sin `tight`): con titulares largos la ajustada del reel
  // contaba una línea de menos y el bloque empujaba la píldora.
  const fit = (max: number) => fitDisplaySize(title, max, { maxLines: 5 });
  const titleFont = fit(
    pickFill(
      [230, 216, 204, 192, 180, 168, 156, 144, 132],
      (m) => antonHeight(title, fit(m), TITLE_LH),
      available,
      "reel",
    ),
  );
  return (
    <Frame format="reel" {...base}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center" }}>
        <div style={{ display: "flex", flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", width: "100%" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: theme.fonts.display,
              fontWeight: 400,
              fontSize: titleFont,
              lineHeight: TITLE_LH,
              textTransform: "uppercase",
              letterSpacing: "0.005em",
              textAlign: "center",
              textWrap: "balance",
            }}
          >
            {highlightText(title, highlight, lime)}
          </h1>
        </div>
        <span
          data-story="rotulo"
          style={{
            marginTop: PILL.gap,
            fontFamily: theme.fonts.body,
            fontSize: PILL.size,
            lineHeight: 1.2,
            fontWeight: 700,
            color: theme.colors.onAccent,
            backgroundColor: lime,
            padding: `${PILL.padY}px ${PILL.padX}px`,
            borderRadius: 999,
            whiteSpace: "nowrap",
          }}
        >
          {rotulo}
        </span>
      </div>
    </Frame>
  );
}
