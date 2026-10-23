import { Frame } from "./Frame.tsx";
import { highlightText } from "./highlight.tsx";
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
 * texto sobre el fondo casi negro de marca; después del render, el calendario
 * mezcla el clip `archivo` a pantalla completa durante esta escena
 * (`src/calendario/clips.ts`, blend lighten como `hookVideo`). Por eso el
 * titular va en el tercio superior, con sombra, y la acción del clip se pide
 * en la mitad inferior del cuadro.
 */
export function Clip({ title, highlight, label, archivo, accent, format, ...base }: ClipProps) {
  const lime = accent ?? theme.colors.accent;
  const size = fitDisplaySize(title, 150, { maxLines: 3, tight: true, keep: [highlight] });
  return (
    <Frame format={format} {...base}>
      <div data-clip={archivo} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", flex: 1, gap: 28, paddingTop: 120 }}>
        {label && (
          <MonoLabel anim="rise" color={lime} style={{ textShadow: "0 4px 18px rgba(0,0,0,0.9)" }}>
            {label}
          </MonoLabel>
        )}
        <h1
          data-anim="words"
          style={{
            margin: 0,
            fontFamily: theme.fonts.display,
            fontWeight: 400,
            fontSize: size,
            lineHeight: displayLineHeight(title, 0.98),
            textTransform: "uppercase",
            letterSpacing: "0.005em",
            textWrap: "balance",
            textShadow: "0 6px 28px rgba(0,0,0,0.9)",
          }}
        >
          {highlightText(title, highlight, lime)}
        </h1>
      </div>
    </Frame>
  );
}
