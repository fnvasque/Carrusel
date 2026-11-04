import { check, done } from "./_check.ts";
import { piezasCercanas, proximoHueco, resolverCuando, semanaDe } from "../src/publicar/hueco.ts";
import type { Pieza, Plan } from "../src/calendario/plan.ts";
import { PlanSchema } from "../src/calendario/plan.ts";
import { parseBorrador } from "../src/calendario/draft.ts";
import { armarPieza, borradorDe, idDe, insertarPieza, problemasCaption } from "../src/publicar/pieza.ts";

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

const HOOK = "Hice este video en 2 días, sin saber animar";
const planFixture = (): Plan =>
  PlanSchema.parse({
    semana: "2026-11-02",
    zona: "America/Santiago",
    experimento: null,
    piezas: [
      {
        id: "vie-reel-otra", dia: "2026-11-06", hora: "10:00", formato: "reel", arquetipo: "atemporal", senal: "retencion",
        tema: "", pilar: "trabajo", hook: { categoria: "x", texto: "x", score: 1 }, emocion: "curiosidad", entregable: "x",
        fraseAmigo: "x", lectorFrio: { intentos: 0, resultado: "manual", notas: "" }, origen: { fichas: [], referencias: [] },
        caption: "x", borrador: "vie-reel-otra.json",
      },
    ],
  });
const piezaNueva = (id = "jue-reel-x"): Pieza =>
  armarPieza({ id, dia: "2026-11-05", hora: "19:00", hook: HOOK, caption: "Hola #ia", hoy: "2026-11-03" });

check("idDe: día de la semana, reel y slug sin tildes", () => {
  igual(idDe("2026-11-05", HOOK), "jue-reel-hice-este-video-en-2-dias-sin-saber-animar");
});

check("idDe: hook de 200 caracteres da id ≤ 80 sin guion final", () => {
  const id = idDe("2026-11-05", "palabra ".repeat(25));
  if (id.length > 80 || id.endsWith("-") || !/^[a-z0-9-]{3,80}$/.test(id)) throw new Error(id);
});

check("insertarPieza: el plan sigue válido, ordenado y la pieza queda hecha a mano", () => {
  const plan = insertarPieza(planFixture(), piezaNueva());
  PlanSchema.parse(plan);
  igual(plan.piezas.map((p) => p.id), ["jue-reel-x", "vie-reel-otra"]);
  const p = plan.piezas[0];
  if (p.parametros?.hechaAMano !== true || p.parametros.origen !== "publicar") throw new Error("parametros");
  igual(p.lectorFrio, { intentos: 0, resultado: "manual", notas: "Pieza publicada con /publicar (2026-11-03), fuera del planificador." });
  igual([p.hook.score, p.estado, p.borrador], [0, "planificado", "jue-reel-x.json"]);
});

check("insertarPieza: no muta el plan y un id repetido lanza", () => {
  const plan = planFixture();
  const nuevo = insertarPieza(plan, piezaNueva());
  igual(plan.piezas.length, 1);
  lanza(() => insertarPieza(nuevo, piezaNueva()), "id repetido: jue-reel-x");
});

check("borradorDe: pasa parseBorrador", () => {
  const b = parseBorrador(JSON.stringify(borradorDe("jue-reel-x", HOOK)));
  igual([b.name, b.pillar, b.angle, b.slides.length], ["jue-reel-x", "trabajo", HOOK, 1]);
});

check("problemasCaption: largo y exceso de hashtags", () => {
  igual(problemasCaption("a".repeat(2201)).length, 1);
  igual(problemasCaption(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ")).length, 1);
  igual(problemasCaption("Hola #ia"), []);
});

await done();
