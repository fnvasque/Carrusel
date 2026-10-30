import type { CSSProperties, ReactNode } from "react";
import { theme, monoText } from "../theme.ts";

/**
 * Piezas visuales compartidas del look papel (titular, antetítulo en serif,
 * etiqueta, tarjeta blanca, círculo de check). Son presentacionales: las marcas
 * `data-anim` se pasan por props.
 */

/** Estilo de todo titular: Inter 700 en tinta, tal como se escribe, tracking −0,04 em. */
export const titular = {
  margin: 0,
  fontFamily: theme.fonts.display,
  fontWeight: 700,
  letterSpacing: "-0.04em",
  color: theme.colors.ink,
} as const;

/** Antetítulo (eyebrow, kicker): Instrument Serif cursiva, gris oscuro. */
export function Kicker({ children, size = theme.fontSize.kicker, style, anim }: { children: ReactNode; size?: number; style?: CSSProperties; anim?: string }) {
  return (
    <span
      {...(anim ? { "data-anim": anim } : {})}
      style={{ fontFamily: theme.fonts.serif, fontStyle: "italic", fontWeight: 400, fontSize: size, lineHeight: 1.15, letterSpacing: "-0.01em", color: theme.colors.textSoft, ...style }}
    >
      {children}
    </span>
  );
}

/** Etiqueta corta en Inter 700 MAYÚSCULAS (quién habla en el chat, «Copia esto», mito/realidad). */
export function Etiqueta({ children, color, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "block",
        fontFamily: theme.fonts.body,
        fontWeight: 700,
        fontSize: theme.fontSize.label,
        lineHeight: 1.2,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: color ?? theme.colors.textMuted,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Etiqueta mono en MAYÚSCULAS con tracking amplio (legado; las plantillas de marca usan `Kicker`/`Etiqueta`). */
export function MonoLabel({ children, color, style, anim }: { children: ReactNode; color?: string; style?: CSSProperties; anim?: string }) {
  return (
    <span
      {...(anim ? { "data-anim": anim } : {})}
      style={{
        ...monoText,
        fontSize: theme.fontSize.label,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: color ?? theme.colors.textMuted,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Tarjeta de UI: blanca, sin borde (salvo `borderColor`), radio de marca. */
export function Card({ children, style, anim, borderColor }: { children: ReactNode; style?: CSSProperties; anim?: string; borderColor?: string }) {
  return (
    <div
      {...(anim ? { "data-anim": anim } : {})}
      style={{
        backgroundColor: theme.colors.card,
        ...(borderColor ? { border: `2px solid ${borderColor}` } : {}),
        borderRadius: theme.radius,
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
export function BookmarkIcon({ size = 96, color = theme.colors.ink }: { size?: number; color?: string }) {
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
