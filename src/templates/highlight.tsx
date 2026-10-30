import type { ReactNode } from "react";
import { theme } from "../theme.ts";

/**
 * Resalta la primera aparición de `highlight` dentro de `text` con el marcador
 * lima detrás (`theme.marker`, franja 52 %–92 % del alto) y el texto en tinta
 * (hereda el color del titular), marcada `data-anim="pop"`. Look papel: el
 * parámetro `color` se conserva solo por compatibilidad de firma con los
 * llamadores existentes y ya NO pinta el texto; el «pop» del reel hace crecer
 * el marcador de izquierda a derecha (`background-size` 0 % → 100 %).
 * `cursiva` es una frase que sale en Instrument Serif cursiva ×1,13
 * (`data-cursiva`). Precedencia si se solapan: highlight > mark > cursiva
 * (la que pierde se descarta).
 * Opcionalmente, `mark` es otra palabra que va con una caja de color detrás
 * (`markColor`; el Hook pasa tinta) y texto claro (papel), estilo "NINGUNO.".
 * Búsqueda case-insensitive. Si no hay coincidencias, devuelve el texto tal cual.
 * Un resaltado de varias palabras sale como un span `pop` por palabra (ver abajo).
 */
export function highlightText(
  text: string,
  highlight: string | undefined,
  _color: string,
  mark?: string,
  markColor: string = theme.colors.pink,
  cursiva?: string,
): ReactNode {
  type Range = { start: number; end: number; kind: "pop" | "mark" | "cursiva" };
  const marcador = {
    backgroundImage: theme.marker,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "left",
    whiteSpace: "nowrap" as const,
  };
  const ranges: Range[] = [];
  const lower = text.toLowerCase();
  const find = (needle: string | undefined, kind: Range["kind"]) => {
    if (!needle) return;
    const i = lower.indexOf(needle.toLowerCase());
    if (i === -1) return;
    const r = { start: i, end: i + needle.length, kind };
    // Si se solapa con un rango anterior, se ignora (gana el resaltado).
    if (ranges.some((o) => r.start < o.end && o.start < r.end)) return;
    ranges.push(r);
  };
  find(highlight, "pop");
  find(mark, "mark");
  find(cursiva, "cursiva");
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let at = 0;
  ranges.forEach((r, k) => {
    if (r.start > at) out.push(text.slice(at, r.start));
    const match = text.slice(r.start, r.end);
    // Puntuación pegada a la palabra ("gratis,"): va en un nowrap junto con
    // ella (con la última, si el resaltado tiene varias), para que no quede sola
    // al inicio de la línea siguiente (SplitText la separa en su propia
    // "palabra" en el reel).
    const next = ranges[k + 1]?.start ?? text.length;
    const punct = (text.slice(r.end, next).match(/^[,.;:!?…)»"'”]+/) ?? [""])[0];
    const conPunct = (el: ReactNode, key: string) =>
      punct ? (
        <span key={key} style={{ whiteSpace: "nowrap" }}>
          {el}
          {punct}
        </span>
      ) : (
        el
      );
    if (r.kind === "pop") {
      // Una palabra: nowrap, no se parte entre líneas (igual en post y reel). Varias
      // palabras: cada una lleva el color en su propio span y la línea puede partirse
      // entre ellas (un nowrap de la frase entera se salía por la derecha: Hook
      // «¿Esto lo escribió la IA?», 2026-10-27). La puntuación pegada va con la última.
      const partes = match.split(/(\s+)/).filter(Boolean);
      const palabras = partes.filter((x) => !/^\s+$/.test(x)).length;
      if (palabras <= 1) {
        out.push(
          conPunct(
            <span key={k} data-anim="pop" style={marcador}>
              {match}
            </span>,
            `p${k}`,
          ),
        );
      } else {
        let n = 0;
        partes.forEach((x, j) => {
          if (/^\s+$/.test(x)) {
            out.push(x);
            return;
          }
          n++;
          const w = (
            <span key={`${k}-${j}`} data-anim="pop" style={marcador}>
              {x}
            </span>
          );
          out.push(n === palabras ? conPunct(w, `p${k}-${j}`) : w);
        });
      }
    } else if (r.kind === "cursiva") {
      // La frase puede partirse entre líneas; la puntuación pegada va dentro.
      out.push(
        <span
          key={k}
          data-cursiva=""
          style={{
            fontFamily: theme.fonts.serif,
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "1.13em",
            letterSpacing: "-0.01em",
          }}
        >
          {match + punct}
        </span>,
      );
    } else {
      out.push(
        conPunct(
          <span
            key={k}
            data-mark=""
            style={{
              color: theme.colors.bg,
              backgroundColor: markColor,
              // inline-block con interlineado propio: la caja abraza la tinta de
              // Inter (mayúsculas 0,73 em, tildes 0,95, descendentes 0,22) sin
              // pisar las líneas vecinas, y el texto claro no se sale de ella.
              display: "inline-block",
              lineHeight: 1.0,
              padding: "0.02em 0.12em 0.06em",
              borderRadius: "0.12em",
              whiteSpace: "nowrap",
            }}
          >
            {match}
          </span>,
          `p${k}`,
        ),
      );
    }
    at = r.end + punct.length;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

/**
 * Lo que se pinta en nowrap y por eso se estima como una sola «palabra» al ajustar
 * el titular (`fitDisplaySize`/`displayHeight` con `keep`): el resaltado solo si es
 * una palabra (si son varias, se parte entre ellas) y el `mark` siempre (su caja no
 * se parte). La `cursiva` se trata como el resaltado. Su ancho se estima con
 * Inter (el estimador de fit.ts), conservador: la serif es más angosta.
 */
export function frasesNowrap(highlight?: string, mark?: string, cursiva?: string): (string | undefined)[] {
  const una = (t?: string) => (t && t.trim().split(/\s+/).length === 1 ? t : undefined);
  const keep = [una(highlight), mark];
  if (una(cursiva)) keep.push(una(cursiva));
  return keep;
}
