import { Frame } from "./Frame.tsx";
import { GhostNumber, digitsOf } from "./GhostNumber.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme, pillarColor } from "../theme.ts";

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
  ...base
}: MythRealityProps) {
  return (
    <Frame {...base}>
      <GhostNumber value={digitsOf(mythLabel)} color={pillarColor(base.pillar)} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: theme.space.lg }}>
        <Panel label={mythLabel} labelColor={theme.colors.textMuted} text={myth} textColor={theme.colors.textMuted} />
        <Panel label={realityLabel} labelColor={theme.colors.green} text={reality} textColor={theme.colors.text} accent={theme.colors.green} />
      </div>
    </Frame>
  );
}

function Panel({
  label,
  labelColor,
  text,
  textColor,
  accent,
}: {
  label: string;
  labelColor: string;
  text: string;
  textColor: string;
  /** Acento lateral (ej. verde para "realidad"); sin acento = panel apagado. */
  accent?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: theme.colors.panel2,
        borderRadius: 20,
        padding: 48,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        border: `1px solid ${theme.surface.panelBorder}`,
        borderLeft: accent ? `6px solid ${accent}` : `1px solid ${theme.surface.panelBorder}`,
        boxShadow: theme.surface.panelShadow,
      }}
    >
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
      <p style={{ margin: 0, fontFamily: theme.fonts.display, fontSize: theme.fontSize.heading, lineHeight: 1.1, textTransform: "uppercase", color: textColor }}>
        {text}
      </p>
    </div>
  );
}
