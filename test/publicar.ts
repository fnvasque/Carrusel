import { check, done } from "./_check.ts";
import { piezasCercanas, proximoHueco, resolverCuando, semanaDe } from "../src/publicar/hueco.ts";
import type { Pieza } from "../src/calendario/plan.ts";

const igual = (a: unknown, b: unknown): void => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};
const lanza = (fn: () => unknown, texto: string): void => {
  try {
    fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!m.includes(texto)) throw new Error(`mensaje sin «${texto}»: ${m}`);
    return;
  }
  throw new Error("no lanzó");
};

check("proximoHueco: 14:20 Chile + 15 min → 15:00", () => {
  igual(proximoHueco(new Date("2026-11-03T17:20:00Z")), { dia: "2026-11-03", hora: "15:00" });
});

check("proximoHueco: 14:15 Chile exactas → 14:30", () => {
  igual(proximoHueco(new Date("2026-11-03T17:15:00Z")), { dia: "2026-11-03", hora: "14:30" });
});

check("proximoHueco: domingo 23:50 cruza a lunes 00:30 y semanaDe es el lunes", () => {
  igual(proximoHueco(new Date("2026-11-09T02:50:00Z")), { dia: "2026-11-09", hora: "00:30" });
  igual(semanaDe("2026-11-09"), "2026-11-09");
  igual(semanaDe("2026-11-08"), "2026-11-02");
});

check("resolverCuando: hora que no es :00/:30 lanza", () => {
  lanza(() => resolverCuando("2026-11-05 19:15", new Date("2026-11-03T12:00:00Z")), "HH:00 o HH:30");
});

check("resolverCuando: hora pasada lanza «ya pasó»", () => {
  lanza(() => resolverCuando("2026-11-01 19:00", new Date("2026-11-03T12:00:00Z")), "ya pasó");
});

check("resolverCuando: «ahora» y fecha futura válida", () => {
  const ahora = new Date("2026-11-03T17:20:00Z");
  igual(resolverCuando("ahora", ahora), { dia: "2026-11-03", hora: "15:00" });
  igual(resolverCuando("2026-11-05 19:30", ahora), { dia: "2026-11-05", hora: "19:30" });
});

check("piezasCercanas: ventana de 120 min en el mismo día", () => {
  const p = [{ id: "a", dia: "2026-11-05", hora: "13:00" }] as Pieza[];
  igual(piezasCercanas(p, "2026-11-05", "14:30"), ["a"]);
  igual(piezasCercanas(p, "2026-11-05", "15:00"), []);
  igual(piezasCercanas(p, "2026-11-06", "13:00"), []);
});

await done();
