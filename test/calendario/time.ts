import assert from "node:assert/strict";
import { check } from "../_check.ts";
import { addDays, localParts, weekMonday, zonedToUtc } from "../../src/calendario/time.ts";

check("zonedToUtc: horario de verano de Chile (UTC-3)", () => {
  assert.equal(zonedToUtc("2026-10-12", "19:30").toISOString(), "2026-10-12T22:30:00.000Z");
});
check("zonedToUtc: horario de invierno de Chile (UTC-4)", () => {
  assert.equal(zonedToUtc("2026-06-15", "14:00").toISOString(), "2026-06-15T18:00:00.000Z");
});
check("zonedToUtc: hora que no existe (salto de septiembre) cae después del salto", () => {
  const t = zonedToUtc("2026-09-06", "00:30");
  assert.equal(t.toISOString(), "2026-09-06T04:30:00.000Z");
  assert.equal(localParts(t).hora, "01:30");
});
check("zonedToUtc: hora repetida (abril) toma la primera ocurrencia", () => {
  assert.equal(zonedToUtc("2026-04-04", "23:30").toISOString(), "2026-04-05T02:30:00.000Z");
});
check("weekMonday: domingo local pertenece a la semana que empezó el lunes anterior", () => {
  assert.equal(weekMonday(new Date("2026-10-12T02:00:00Z")), "2026-10-05"); // dom 11 23:00 en Chile
  assert.equal(weekMonday(new Date("2026-10-12T12:00:00Z")), "2026-10-12");
});
check("addDays cruza meses y años", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

// --- adversarial: cambios de hora 2026 y 2027, medianoche, bordes de semana ---
const CAMBIOS = [
  { dia: "2026-09-06", existe: (h: string) => h >= "01:00" }, // salto: 00:00-00:59 no existen
  { dia: "2027-09-05", existe: (h: string) => h >= "01:00" },
  { dia: "2026-04-04", existe: () => true },
  { dia: "2027-04-03", existe: () => true },
];
check("zonedToUtc: 00:00 y 23:59 de los días de cambio de hora son coherentes y monótonos", () => {
  for (const c of CAMBIOS) {
    for (const hora of ["00:00", "00:30", "01:00", "23:00", "23:30", "23:59"]) {
      const l = localParts(zonedToUtc(c.dia, hora));
      if (c.existe(hora)) assert.deepEqual([l.dia, l.hora], [c.dia, hora], `${c.dia} ${hora}`);
      else assert.deepEqual([l.dia, l.hora], [c.dia, "01:" + hora.slice(3)], `${c.dia} ${hora} (inexistente)`);
    }
    assert.ok(zonedToUtc(c.dia, "23:59").getTime() > zonedToUtc(c.dia, "00:00").getTime(), `${c.dia} monótono`);
  }
});
check("zonedToUtc: valores exactos en los cambios de 2026 y 2027", () => {
  assert.equal(zonedToUtc("2027-09-05", "00:00").toISOString(), "2027-09-05T04:00:00.000Z"); // 01:00 local (UTC-3)
  assert.equal(zonedToUtc("2027-04-02", "23:30").toISOString(), "2027-04-03T02:30:00.000Z");
  assert.equal(zonedToUtc("2026-04-04", "23:59").toISOString(), "2026-04-05T02:59:00.000Z");
  assert.equal(zonedToUtc("2026-04-05", "00:00").toISOString(), "2026-04-05T04:00:00.000Z"); // ya UTC-4
});
check("zonedToUtc rechaza formatos inválidos", () => {
  assert.throws(() => zonedToUtc("2026-10-12", "7:30"));
  assert.throws(() => zonedToUtc("12/10/2026", "07:30"));
  assert.throws(() => zonedToUtc("2026-02-30", "07:30"), /inválida/);
  assert.throws(() => zonedToUtc("2026-13-01", "07:30"), /inválida/);
});
check("weekMonday: medianoche local exacta de un lunes abre la semana nueva", () => {
  const lunes0 = zonedToUtc("2026-10-12", "00:00");
  assert.equal(weekMonday(lunes0), "2026-10-12");
  assert.equal(weekMonday(new Date(lunes0.getTime() - 60_000)), "2026-10-05");
});
check("weekMonday: semana del cambio de hora de septiembre", () => {
  assert.equal(weekMonday(zonedToUtc("2026-09-06", "12:00")), "2026-08-31");
  assert.equal(weekMonday(zonedToUtc("2026-09-07", "00:00")), "2026-09-07");
});
