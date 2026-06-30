import type { ReactNode } from "react";
import { theme } from "../theme.ts";

/**
 * Tarjeta clara (mock de UI) con un CÍRCULO dibujado a mano superpuesto, al
 * estilo "apuntes" del referente: para contenido demostrativo (screenshots
 * anotados). El círculo es un SVG (elipse) en cian o rosa, ligeramente rotado.
 * Presentacional puro; se usa envolviendo el mock de una captura.
 */
export function Annotated({ children, circle }: { children: ReactNode; circle?: "cyan" | "pink" }) {
  const stroke = circle === "pink" ? theme.colors.pink : theme.colors.accent;
  return (
    <div
      style={{
        position: "relative",
        backgroundColor: theme.colors.panel,
        border: `1px solid ${theme.surface.panelBorder}`,
        borderRadius: 18,
        padding: theme.space.lg,
        boxShadow: theme.surface.panelShadow,
      }}
    >
      {children}
      {circle && (
        <svg
          width="260"
          height="110"
          viewBox="0 0 260 110"
          fill="none"
          style={{ position: "absolute", right: 24, bottom: 28, transform: "rotate(-4deg)", pointerEvents: "none" }}
        >
          <ellipse cx="130" cy="55" rx="124" ry="48" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
