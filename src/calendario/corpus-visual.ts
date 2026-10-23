/** Resultado de re-renderizar una pieza del corpus (sin subir nada). */
export type ResultadoCorpus = { semana: string; id: string; estado: "limpia" | "visual" | "otro"; motivos: string[] };

/** Resumen del corpus: solo las `visual` cuentan como violaciones; las `otro` se listan aparte con su motivo. */
export function resumirCorpus(r: ResultadoCorpus[]): { texto: string; violaciones: number } {
  const visuales = r.filter((x) => x.estado === "visual");
  const otras = r.filter((x) => x.estado === "otro");
  const limpias = r.filter((x) => x.estado === "limpia").length;
  const lineas = [`Corpus: ${r.length} pieza(s): ${limpias} limpia(s), ${visuales.length} con violación visual, ${otras.length} otra(s).`];
  for (const v of visuales) lineas.push(`  VISUAL ${v.semana}/${v.id}: ${v.motivos.join(" | ")}`);
  if (otras.length) {
    lineas.push("Sin revisar (no cuentan como violación):");
    for (const o of otras) lineas.push(`  OTRO ${o.semana}/${o.id}: ${o.motivos.join(" | ")}`);
  }
  return { texto: lineas.join("\n"), violaciones: visuales.length };
}
