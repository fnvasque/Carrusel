import assert from "node:assert/strict";
import { check } from "../_check.ts";
import type { Instantanea } from "../../src/insights/snapshots.ts";
import { derivar } from "../../src/insights/derive.ts";
import {
  debeCuenta, debeResumir, domingoDeResumen, formatPost, formatResumen, formatResumenTelegram, parsearReferencia, resumirSemana,
} from "../../src/insights/summary.ts";

// Domingo 2026-10-04 (Chile en UTC-3: 05:30 local = 08:30Z).
const HASTA = "2026-10-04";
const PUB = "2026-09-27T14:00:00.000Z";
const T7D = "2026-10-04T14:05:00.000Z";

function inst(mediaId: string, extra: Partial<Instantanea> = {}): Instantanea {
  const base = { reach: 200, saved: 10, shares: 4, likes: 30, comments: 2, views: 500, descartadas: [] as string[] };
  const m = { ...base, ...extra };
  return {
    ...m, mediaId, ventana: "7d", tomadaEn: T7D, origen: "motor", piezaId: `pz-${mediaId}`,
    derivadas: derivar(m, 20000),
  } as Instantanea;
}
const reg = (mediaId: string, senal = "guardados", extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  tipo: "publicado", mediaId, piezaId: `pz-${mediaId}`, senal, publicadoEn: PUB, permalink: `https://www.instagram.com/p/${mediaId}/`, ...extra,
});
const cuenta = {
  seguidores: 250,
  porDia: { "2026-09-26": 9, "2026-09-28": 3, "2026-10-01": 4, "2026-10-04": 2, "2026-10-05": 50 },
  onlineFollowers: { "9": 10, "20": 80, "21": 60 },
  reachNoSeguidores7d: 1234,
};

check("resumirSemana: mejor y peor por señal objetivo usando solo 7d", () => {
  const r = resumirSemana(
    [inst("a", { saved: 30 }), inst("b", { saved: 5 }), inst("c", { saved: 12 }), { ...inst("a", { saved: 999 }), ventana: "24h" } as Instantanea],
    cuenta, [reg("a"), reg("b"), reg("c")], HASTA, 50,
  );
  assert.equal(r.mejor?.mediaId, "a");
  assert.equal(r.peor?.mediaId, "b");
  assert.equal(r.mejor?.senal, "guardados");
  assert.equal(r.mejor?.modo, "tasa");
  assert.equal(r.mejor?.valor, 30 / 200);
  assert.equal(r.mejor?.permalink, "https://www.instagram.com/p/a/");
  assert.equal(r.desde, "2026-09-27");
  assert.equal(r.hasta, HASTA);
});

check("resumirSemana: con alcance bajo usa conteos absolutos", () => {
  const r = resumirSemana([inst("a", { reach: 20, saved: 3 }), inst("b", { reach: 20, saved: 1 })], cuenta, [reg("a"), reg("b")], HASTA, 50);
  assert.equal(r.mejor?.modo, "absoluto");
  assert.equal(r.mejor?.valor, 3);
});

check("resumirSemana: una sola pieza no tiene peor", () => {
  const r = resumirSemana([inst("a")], cuenta, [reg("a")], HASTA, 50);
  assert.equal(r.mejor?.mediaId, "a");
  assert.equal(r.peor, undefined);
});

check("resumirSemana: pieza manual no compite y va a su sección", () => {
  const manual = { ...inst("m", { saved: 500 }), origen: "manual", piezaId: undefined } as unknown as Instantanea;
  const r = resumirSemana([inst("a", { saved: 10 }), inst("b", { saved: 2 }), manual], cuenta, [reg("a"), reg("b")], HASTA, 50);
  assert.equal(r.mejor?.mediaId, "a");
  assert.equal(r.manuales.length, 1);
  assert.equal(r.manuales[0]!.mediaId, "m");
  assert.match(formatResumen(r), /posts manuales/i);
  assert.match(formatResumenTelegram(r), /posts manuales/i);
});

check("resumirSemana: 7d tardía (desvío > 6 h) no compite y avisa", () => {
  const tarde = { ...inst("t", { saved: 900 }), tomadaEn: "2026-10-06T14:00:00.000Z" } as Instantanea;
  const r = resumirSemana([inst("a", { saved: 10 }), tarde], cuenta, [reg("a"), reg("t")], "2026-10-06", 50);
  assert.equal(r.mejor?.mediaId, "a");
  assert.ok(r.avisos.some((a) => /tard/i.test(a)));
});

check("resumirSemana: ignora instantáneas fuera de la semana", () => {
  const vieja = { ...inst("v"), tomadaEn: "2026-09-20T14:00:00.000Z" } as Instantanea;
  const r = resumirSemana([vieja], cuenta, [reg("v")], HASTA, 50);
  assert.equal(r.mejor, undefined);
});

check("resumirSemana: compara cada señal contra su propio grupo (no mezcla retención con conteos)", () => {
  const r = resumirSemana(
    [inst("a", { saved: 30 }), inst("b", { saved: 5 }), inst("r", { avg_watch_ms: 18000 })],
    cuenta, [reg("a"), reg("b"), reg("r", "retencion")], HASTA, 50,
  );
  assert.ok(r.mejor && r.peor);
  assert.notEqual(r.mejor!.mediaId, r.peor!.mediaId);
});

check("resumirSemana: seguidores ganados, hora top y no seguidores", () => {
  const r = resumirSemana([inst("a")], cuenta, [reg("a")], HASTA, 50);
  assert.equal(r.seguidoresGanados, 3 + 4 + 2); // solo días dentro de (desde, hasta]
  assert.equal(r.horaTop, "20:00");
  assert.equal(r.noSeguidores, 1234);
});

check("resumirSemana: sin onlineFollowers usa la tabla por defecto", () => {
  const r = resumirSemana([], { seguidores: 40, porDia: {} }, [], HASTA, 50);
  assert.match(r.horaTop ?? "", /tabla por defecto \(menos de 100 seguidores\)/);
  assert.equal(r.seguidoresGanados, undefined);
});

check("resumirSemana y formatos: sin instantáneas dice 'Sin datos todavía' y no lanza", () => {
  for (const c of [undefined, null, 5, {}, { porDia: "x", onlineFollowers: [] }]) {
    const r = resumirSemana([], c, [null, 3, "x", {}], HASTA, 50);
    assert.match(formatResumen(r), /Sin datos todavía/);
    assert.match(formatResumenTelegram(r), /Sin datos todavía/);
  }
});

check("formatResumenTelegram escapa HTML de los datos", () => {
  const r = resumirSemana([{ ...inst("a"), piezaId: "<i>x</i>" }], cuenta, [reg("a")], HASTA, 50);
  const t = formatResumenTelegram(r);
  assert.ok(!t.includes("<i>x</i>"));
  assert.match(t, /&lt;i&gt;x&lt;\/i&gt;/);
});

check("formatPost: todas las ventanas en orden, marca tardías, vacío no lanza", () => {
  const a = { ...inst("a"), ventana: "24h", tomadaEn: "2026-09-28T14:00:00.000Z" } as Instantanea;
  const b = inst("a");
  const tarde = { ...inst("a"), ventana: "14d", tomadaEn: "2026-10-20T14:00:00.000Z" } as Instantanea;
  const t = formatPost([tarde, b, a], PUB);
  assert.ok(t.indexOf("24h") < t.indexOf("7d") && t.indexOf("7d") < t.indexOf("14d"));
  assert.match(t, /tardía/);
  assert.match(formatPost([]), /Sin instantáneas/);
});

check("debeResumir: domingo 05:30 local sí, 05:29 no", () => {
  assert.equal(debeResumir(new Date("2026-10-04T08:30:00Z")), true);
  assert.equal(debeResumir(new Date("2026-10-04T08:29:00Z"), "2026-09-27"), false);
});

check("debeResumir: no si ya se hizo esa semana", () => {
  assert.equal(debeResumir(new Date("2026-10-04T12:00:00Z"), "2026-10-04"), false);
  assert.equal(debeResumir(new Date("2026-10-06T12:00:00Z"), "2026-10-04"), false);
});

check("debeResumir: el lunes sí si el domingo no se pudo; el domingo anterior no cuenta", () => {
  assert.equal(debeResumir(new Date("2026-10-05T12:00:00Z"), "2026-09-27"), true);
  assert.equal(debeResumir(new Date("2026-10-05T12:00:00Z")), true);
  // domingo 04:00 local: todavía vale el domingo anterior.
  assert.equal(debeResumir(new Date("2026-10-04T07:00:00Z"), "2026-09-27"), false);
});

check("debeResumir: valor ilegible de 'ultimo' no bloquea", () => {
  assert.equal(debeResumir(new Date("2026-10-04T12:00:00Z"), "basura"), true);
});

check("domingoDeResumen: el domingo vigente", () => {
  assert.equal(domingoDeResumen(new Date("2026-10-04T08:30:00Z")), "2026-10-04");
  assert.equal(domingoDeResumen(new Date("2026-10-04T08:29:00Z")), "2026-09-27");
  assert.equal(domingoDeResumen(new Date("2026-10-07T12:00:00Z")), "2026-10-04");
});

check("debeCuenta: una vez por día local", () => {
  const now = new Date("2026-10-06T15:00:00Z");
  assert.equal(debeCuenta(now), true);
  assert.equal(debeCuenta(now, "2026-10-06"), false);
  assert.equal(debeCuenta(now, "2026-10-05"), true);
  assert.equal(debeCuenta(now, "basura"), true);
});

check("parsearReferencia: permalink, media_id y piezaId", () => {
  assert.deepEqual(parsearReferencia("https://www.instagram.com/reel/Cx1_ab-Z/?igsh=zz"), { tipo: "shortcode", valor: "Cx1_ab-Z" });
  assert.deepEqual(parsearReferencia("17895695668004550"), { tipo: "id", valor: "17895695668004550" });
  assert.deepEqual(parsearReferencia(" lun-reel-x "), { tipo: "pieza", valor: "lun-reel-x" });
  assert.equal(parsearReferencia("   "), undefined);
});
