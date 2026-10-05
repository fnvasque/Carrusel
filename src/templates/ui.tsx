import type { CSSProperties, ReactNode } from "react";
import { theme, monoText } from "../theme.ts";

/**
 * Piezas visuales compartidas del look lima (tarjeta, etiqueta mono, círculo
 * de check). Son presentacionales: las marcas `data-anim` se pasan por props.
 */

/** Etiqueta mono en MAYÚSCULAS con tracking amplio (eyebrow, kicker, labels). */
export function MonoLabel({ children, color, style, anim }: { children: ReactNode; color?: string; style?: CSSProperties; anim?: string }) {
  return (
    <span
      {...(anim ? { "data-anim": anim } : {})}
      style={{
        ...monoText,
        fontSize: theme.fontSize.label,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: color ?? theme.colors.accent,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Tarjeta de UI: fondo `card`, borde `line`, radio de marca. */
export function Card({ children, style, anim, borderColor }: { children: ReactNode; style?: CSSProperties; anim?: string; borderColor?: string }) {
  return (
    <div
      {...(anim ? { "data-anim": anim } : {})}
      style={{
        backgroundColor: theme.colors.card,
        border: `2px solid ${borderColor ?? theme.colors.line}`,
        borderRadius: theme.radius,
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Círculo lima con ✓ (checklist). `data-anim="check"` lo anima en el reel. */
export function CheckCircle({ size = 52, color = theme.colors.accent }: { size?: number; color?: string }) {
  return (
    <span
      data-anim="check"
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" fill="none" stroke={theme.colors.onAccent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12 5 5 9-10" />
      </svg>
    </span>
  );
}

/** Ícono de guardar (bookmark), trazo en `color`. */
export function BookmarkIcon({ size = 96, color = theme.colors.accent }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round">
      <path d="M6 3.5h12a.5.5 0 0 1 .5.5v16.6a.4.4 0 0 1-.65.3L12 16.2l-5.85 4.7a.4.4 0 0 1-.65-.3V4a.5.5 0 0 1 .5-.5z" />
    </svg>
  );
}

/** Íconos de trazo para la pastilla del CTA (sustituyen a los emoji, que el render headless pinta mal). */
export type PillIconName = "bookmark" | "arrow" | "share";

const PILL_PATHS: Record<PillIconName, string> = {
  bookmark: "M6 3.5h12a.5.5 0 0 1 .5.5v16.6a.4.4 0 0 1-.65.3L12 16.2l-5.85 4.7a.4.4 0 0 1-.65-.3V4a.5.5 0 0 1 .5-.5z",
  arrow: "M4 12h15M13 6l6 6-6 6",
  share: "M7 17 17 7M8 7h9v9",
};

/** Ícono de trazo `name`, del tamaño del texto (1em) y en el color del texto. */
export function PillIcon({ name, color = "currentColor" }: { name: PillIconName; color?: string }) {
  return (
    <svg width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={PILL_PATHS[name]} />
    </svg>
  );
}
