import { Frame } from "./Frame.tsx";
import type { BaseSlideProps } from "./types.ts";
import { theme } from "../theme.ts";

export interface CoverProps extends BaseSlideProps {
  /** Texto pequeño superior (ej. "GUÍA", "@tu_cuenta"). */
  eyebrow?: string;
  /** Título principal del carrusel. */
  title: string;
  /** Subtítulo o gancho secundario. */
  subtitle?: string;
  /** Tamaño del título en px (por defecto theme.fontSize.title). */
  titleSize?: number;
}

/** Portada del carrusel: título grande, opcionalmente sobre un fondo de IA. */
export function Cover({
  eyebrow,
  title,
  subtitle,
  titleSize,
  accent,
  ...base
}: CoverProps) {
  return (
    <Frame {...base}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 28 }}>
        {eyebrow && (
          <span
            style={{
              fontSize: theme.fontSize.caption,
              letterSpacing: 4,
              textTransform: "uppercase",
              fontWeight: 600,
              color: accent ?? theme.colors.accent,
            }}
          >
            {eyebrow}
          </span>
        )}
        <h1
          style={{
            margin: 0,
            fontSize: titleSize ?? theme.fontSize.title,
            lineHeight: 1.05,
            fontWeight: 800,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: 0, fontSize: theme.fontSize.body, lineHeight: 1.3, color: theme.colors.textMuted }}>
            {subtitle}
          </p>
        )}
      </div>
    </Frame>
  );
}
