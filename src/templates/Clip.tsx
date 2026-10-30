import { Frame } from "./Frame.tsx";
import { highlightText, frasesNowrap } from "./highlight.tsx";
import { MonoLabel } from "./ui.tsx";
import { fitDisplaySize, displayLineHeight } from "./fit.ts";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface ClipProps extends BaseSlideProps {
  /** Titular corto sobre el video (≤ 7 palabras). */
  title: string;
  /** Palabra(s) del titular a resaltar en lima. */
  highlight?: string;
  /** Etiqueta arriba del titular: modelo y costo ("Kling 3.0 · 9 créditos"). ≤ 4 palabras. */
  label?: string;
  /** Nombre del clip (.mp4) en la caché del Mac; el calendario lo mezcla tras el render. */
  archivo: string;
}

/**
 * Rol — Video generado como contenido (solo reels). El motor pinta solo el
 * texto sobre negro (la única escena oscura del look papel); después del
 * render, el calendario mezcla el clip `archivo` a pantalla completa durante
 * esta escena (`src/calendario/clips.ts`, blend lighten como `hookVideo`): el
 * blend ignora todo lo más oscuro que el video, así que el fondo debe ser
 * negro y el texto, la cabecera y la firma van en claro (`oscuro`). Sin
 * sombras de texto: el blend las ignora. El titular va en el tercio superior
 * (el calendario oscurece el video bajo él) y la acción del clip se pide en la
 * mitad inferior del cuadro.
 */
export function Clip({ title, highlight, label, archivo, accent, format, ...base }: ClipProps) {
  const lime = accent ?? theme.colors.accent;
  const size = fitDisplaySize(title, 150, { maxLines: 3, tight: true, keep: frasesNowrap(highlight) });
  return (
    <Frame format={format} {...base} oscuro color="#FFFFFF" style={{ backgroundColor: "#000000" }}>
      <div data-clip={archivo} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", flex: 1, gap: 28, paddingTop: 120 }}>
        {label && (
          <MonoLabel anim="rise" color={lime}>
            {label}
          </MonoLabel>
        )}
        <h1
          data-anim="words"
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontWeight: 700, // Inter 700 tal como se escribe: lo que mide fit.ts
            fontSize: size,
            lineHeight: displayLineHeight(title, 0.98),
            letterSpacing: "-0.04em",
            textWrap: "balance",
          }}
        >
          {highlightText(title, highlight, lime)}
        </h1>
      </div>
    </Frame>
  );
}
