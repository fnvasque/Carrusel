import type { ReactNode } from "react";
import { theme } from "../theme.ts";

/**
 * Resalta la primera aparición de `highlight` dentro de `text` pintándola con
 * `color` (la "palabra clave en lima" de la marca, marcada `data-anim="pop"`).
 * Opcionalmente, `mark` es otra palabra que va con una caja de color detrás
 * (`markColor`, rosa por defecto) y texto oscuro, estilo "NINGUNO.".
 * Búsqueda case-insensitive. Si no hay coincidencias, devuelve el texto tal cual.
 * Un resaltado de varias palabras sale como un span `pop` por palabra (ver abajo).
 */
export function highlightText(
  text: string,
  highlight: string | undefined,
  color: string,
  mark?: string,
  markColor: string = theme.colors.pink,
): ReactNode {
  type Range = { start: number; end: number; kind: "pop" | "mark" };
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
            <span key={k} data-anim="pop" style={{ color, whiteSpace: "nowrap" }}>
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
            <span key={`${k}-${j}`} data-anim="pop" style={{ color, whiteSpace: "nowrap" }}>
              {x}
            </span>
          );
          out.push(n === palabras ? conPunct(w, `p${k}-${j}`) : w);
        });
      }
    } else {
      out.push(
        conPunct(
          <span
            key={k}
            data-mark=""
            style={{
              color: theme.colors.bg,
              backgroundColor: markColor,
              // inline-block con interlineado propio: la caja abraza la altura de
              // las mayúsculas y no pisa las líneas vecinas (un inline pintaría
              // todo el alto de la fuente, más que el interlineado 0.98 del titular).
              display: "inline-block",
              lineHeight: 0.9,
              padding: "0.07em 0.1em 0.01em",
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
 * el titular (`fitDisplaySize`/`antonHeight` con `keep`): el resaltado solo si es
 * una palabra (si son varias, se parte entre ellas) y el `mark` siempre (su caja no
 * se parte).
 */
export function frasesNowrap(highlight?: string, mark?: string): (string | undefined)[] {
  const una = highlight && highlight.trim().split(/\s+/).length === 1 ? highlight : undefined;
  return [una, mark];
}
