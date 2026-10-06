/**
 * Adversario T5: `kb-plantilla/_calendario/validar.mjs`.
 * Solo quedan los ataques que el validador NO resiste (cada uno cita el brief,
 * las restricciones o el manual que lo respalda).
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check } from "../_check.ts";
import { EJEMPLO, validarBorrador, validarSemana } from "../../kb-plantilla/_calendario/validar.mjs";

const base = JSON.parse(readFileSync(new URL("../../kb-plantilla/_calendario/config.json", import.meta.url), "utf8"));
const config = { ...base, audios: [EJEMPLO.borrador.audio] };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const pieza = () => clone(EJEMPLO.plan.piezas[0]) as any;
const borrador = () => clone(EJEMPLO.borrador) as any;
/** El ejemplo como carrusel (sin reglas de tiempo de lectura, para aislar la regla atacada). */
const comoCarrusel = (p: any, b: any) => {
  p.formato = "carrusel";
  delete b.pace;
  delete b.audio;
};

// Mandato T5: "emojis en el título ... Todo debe dar error". EMOJI_RE usa
// \p{Extended_Pictographic}, que no cubre banderas (indicadores regionales) ni keycaps.
check("adversario T5: emoji de bandera o keycap en el título pasa el validador", () => {
  const p1 = pieza();
  const b1 = borrador();
  comoCarrusel(p1, b1);
  b1.slides[0].props.title = "Convierte 6 PDFs en un podcast gratis 🇨🇱";
  const e1 = validarBorrador(p1, b1, config);
  assert.ok(e1.some((e: string) => /emoji/.test(e)), `bandera 🇨🇱 en Hook.title: ${JSON.stringify(e1)}`);
  const p2 = pieza();
  const b2 = borrador();
  comoCarrusel(p2, b2);
  b2.slides[2].props.heading = "1️⃣ Sube tus PDFs a NotebookLM";
  const e2 = validarBorrador(p2, b2, config);
  assert.ok(e2.some((e: string) => /emoji/.test(e)), `keycap 1️⃣ en Step.heading: ${JSON.stringify(e2)}`);
});

// Ruling: "el highlight se compara sin mayúsculas pero con tildes" (como el motor,
// `highlightText`: text.toLowerCase().indexOf(highlight.toLowerCase()), sin normalizar).
// Brief: "highlight que no aparece en title → error". El validador normaliza a NFC
// ambos lados, así que un título en NFD pasa y el motor no pinta la palabra en lima.
check("adversario T5: highlight NFC sobre título NFD pasa pero el motor no lo encuentra", () => {
  const p = pieza();
  const b = borrador();
  b.slides[0].props.title = "Convierte 6 PDFs en un podcást gratis".normalize("NFD");
  b.slides[0].props.highlight = "podcást".normalize("NFC");
  const motorLoEncuentra = b.slides[0].props.title.toLowerCase().indexOf(b.slides[0].props.highlight.toLowerCase()) !== -1;
  assert.equal(motorLoEncuentra, false);
  const errs = validarBorrador(p, b, config);
  assert.ok(errs.some((e: string) => /highlight/.test(e)), `sin error de highlight: ${JSON.stringify(errs)}`);
});

// Mandato T5: "siglas con puntos (`I.A.`)"; INSTRUCCIONES.md: 'Sin siglas con puntos ("I.A.")'.
// SIGLA_PUNTOS_RE exige punto tras cada letra: "I.A" y "I. A." no se detectan.
check("adversario T5: sigla con puntos sin el punto final o con espacio (I.A / I. A.) pasa", () => {
  for (const body of ["La I.A hace el resto del trabajo por ti.", "La I. A. hace el resto del trabajo por ti."]) {
    const p = pieza();
    const b = borrador();
    comoCarrusel(p, b);
    b.slides[2].props.body = body;
    const errs = validarBorrador(p, b, config);
    assert.ok(errs.some((e: string) => /sigla/.test(e)), `${JSON.stringify(body)} sin error de sigla: ${JSON.stringify(errs)}`);
  }
});

// Brief: siglas = palabras en mayúsculas de ≥ 2 letras, ignorando solo `siglasPermitidas`;
// INSTRUCCIONES.md: "Única excepción: la palabra clave del CTA justo después de "Comenta"".
// El código exime también tras "responde", "escribe", "escribeme", "comentame", en cualquier slide.
check("adversario T5: 'Responde LLM' en el cuerpo de un Step esquiva la regla de siglas", () => {
  const p = pieza();
  const b = borrador();
  comoCarrusel(p, b);
  b.slides[2].props.body = "Responde LLM si quieres la lista completa.";
  const errs = validarBorrador(p, b, config);
  assert.ok(errs.some((e: string) => /LLM/.test(e)), `sin error por la sigla LLM: ${JSON.stringify(errs)}`);
});

// Brief: 'Caption: ... "primer comentario" → error'. La búsqueda es por substring
// literal: dos espacios o un espacio duro (U+00A0) entre las palabras la esquivan.
check("adversario T5: 'primer  comentario' con doble espacio o espacio duro pasa", () => {
  for (const sep of ["  ", " "]) {
    const p = pieza();
    p.caption = p.caption.replace("Guárdalo", `El link está en el primer${sep}comentario. Guárdalo`);
    const errs = validarBorrador(p, borrador(), config);
    assert.ok(errs.some((e: string) => /primer comentario/.test(e)), `sep ${JSON.stringify(sep)}: ${JSON.stringify(errs)}`);
  }
});

/** Semana temporal con el ejemplo; `enlazar` decide qué archivos son symlinks a fuera. */
function semanaConSymlink(fuera: string, contenido: string, cual: "borrador" | "plan") {
  const root = mkdtempSync(join(tmpdir(), "adv-t5-"));
  const dir = join(root, "_calendario", EJEMPLO.plan.semana);
  mkdirSync(dir, { recursive: true });
  const ext = join(root, fuera);
  writeFileSync(ext, contenido);
  const id = EJEMPLO.plan.piezas[0].id;
  if (cual === "plan") {
    symlinkSync(ext, join(dir, "plan.json"));
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(EJEMPLO.borrador));
  } else {
    writeFileSync(join(dir, "plan.json"), JSON.stringify(EJEMPLO.plan));
    symlinkSync(ext, join(dir, `${id}.json`));
  }
  const avisos: string[] = [];
  const errs = validarSemana(dir, config, { avisos });
  rmSync(root, { recursive: true, force: true });
  return errs as string[];
}

// Mandato T5: "`borrador` en `plan.json` que apunta a `../../etc/passwd` ... Todo debe
// dar error". El nombre se valida, pero `leerJson` sigue symlinks: un `<id>.json` (o
// `plan.json`) que enlaza fuera de la carpeta de la semana se valida y pasa.
check("adversario T5: borrador o plan.json que es symlink a un archivo fuera de la semana pasa", () => {
  const e1 = semanaConSymlink("fuera.json", JSON.stringify(EJEMPLO.borrador), "borrador");
  assert.ok(e1.length > 0, "borrador symlink a ../fuera.json: sin errores");
  const e2 = semanaConSymlink("plan-fuera.json", JSON.stringify(EJEMPLO.plan), "plan");
  assert.ok(e2.length > 0, "plan.json symlink a ../plan-fuera.json: sin errores");
});

// Restricciones: "Nunca se imprime ni se registra un token". Con un symlink a un archivo
// que no es JSON, el error copia el mensaje de JSON.parse, que trae el inicio del archivo.
check("adversario T5: el error de un borrador symlink a un archivo con token imprime el token", () => {
  const errs = semanaConSymlink("secreto.env", "TOKEN=EAABsecreto123\n", "borrador");
  assert.ok(errs.length > 0);
  assert.ok(!errs.some((e) => e.includes("EAAB")), `el error filtra el contenido: ${JSON.stringify(errs)}`);
});
