import { Frame } from "./Frame.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface MythRealityProps extends BaseSlideProps {
  /** El mito / lo que se cree. */
  myth: string;
  /** La realidad / lo que de verdad pasa. */
  reality: string;
  /** Etiqueta del bloque mito. Por defecto "EL MITO". */
  mythLabel?: string;
  /** Etiqueta del bloque realidad. Por defecto "LA REALIDAD". */
  realityLabel?: string;
}

/**
 * Rol — Mito vs Realidad (pilar Curiosidad, anti-hype). Dos paneles contrastados:
 * el mito apagado, la realidad en verde. El contraste de color hace el trabajo,
 * sin alarmismo.
 */
export function MythReality({
  myth,
  reality,
  mythLabel = "El mito",
  realityLabel = "La realidad",
  format,
  ...base
}: MythRealityProps) {
  return (
    <Frame format={format} {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 32 }}>
        <Panel label={mythLabel} labelColor={theme.colors.textMuted} text={myth} textColor={theme.colors.textMuted} strike={format === "reel"} />
        <Panel label={realityLabel} labelColor={theme.colors.green} text={reality} textColor={theme.colors.text} />
      </div>
    </Frame>
  );
}

function Panel({
  label,
  labelColor,
  text,
  textColor,
  strike,
}: {
  label: string;
  labelColor: string;
  text: string;
  textColor: string;
  /** Solo reel: línea animable que tacha el texto del mito. */
  strike?: boolean;
}) {
  const p = (
    <p style={{ margin: 0, fontFamily: theme.fonts.display, fontSize: theme.fontSize.heading, lineHeight: 1.1, textTransform: "uppercase", color: textColor }}>
      {text}
    </p>
  );
  return (
    <div data-anim="rise" style={{ backgroundColor: theme.colors.panel2, borderRadius: 20, padding: 48, display: "flex", flexDirection: "column", gap: 20 }}>
      <span
        style={{
          fontFamily: theme.fonts.body,
          fontSize: theme.fontSize.label,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: labelColor,
        }}
      >
        {label}
      </span>
      {/* El wrapper solo existe con strike para no alterar el DOM del post. */}
      {strike ? (
        <div style={{ position: "relative" }}>
          {p}
          <div
            data-anim="strike"
            style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 8, marginTop: -4, backgroundColor: theme.colors.textMuted, transformOrigin: "left center" }}
          />
        </div>
      ) : (
        p
      )}
    </div>
  );
}
