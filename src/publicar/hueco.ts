import type { Pieza } from "../calendario/plan.ts";
import { addDays, fechaValida, localParts, weekMonday, zonedToUtc } from "../calendario/time.ts";

export interface Hueco {
  dia: string;
  hora: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Primer hueco HH:00 / HH:30 (hora de Chile) que queda a ≥ `margenMin` minutos de `ahora`.
 * Función pura.
 */
export function proximoHueco(ahora: Date, margenMin = 15): Hueco {
  const minuto = 60_000;
  const limite = new Date(Math.ceil((ahora.getTime() + margenMin * minuto) / minuto) * minuto);
  const l = localParts(limite);
  let [hh, mm] = l.hora.split(":").map(Number);
  let dia = l.dia;
  if (mm !== 0 && mm !== 30) {
    if (mm < 30) mm = 30;
    else {
      mm = 0;
      hh += 1;
    }
  }
  if (hh === 24) {
    hh = 0;
    dia = addDays(dia, 1);
  }
  return { dia, hora: `${pad(hh)}:${pad(mm)}` };
}

/**
 * Traduce el argumento «cuándo»: `"ahora"` o `"AAAA-MM-DD HH:MM"`. Lanza si la hora
 * no es :00 / :30, si la fecha no existe o si el instante ya pasó.
 */
export function resolverCuando(cuando: string, ahora: Date): Hueco {
  const txt = cuando.trim();
  if (txt === "ahora") return proximoHueco(ahora);
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(txt);
  if (!m || !fechaValida(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59) {
    throw new Error(`«${cuando}» no es válido: usa "ahora" o "AAAA-MM-DD HH:MM".`);
  }
  if (m[3] !== "00" && m[3] !== "30") {
    throw new Error(`La hora debe ser HH:00 o HH:30 (recibí ${m[2]}:${m[3]}).`);
  }
  const hora = `${m[2]}:${m[3]}`;
  const t = zonedToUtc(m[1], hora).getTime();
  if (t < ahora.getTime()) {
    throw new Error(`${m[1]} ${hora} ya pasó.`);
  }
  // Mismo margen que «ahora»: tiene que dar tiempo a subir, que el bot lea la base y que Meta procese.
  if (t < ahora.getTime() + 15 * 60_000) {
    throw new Error(`${m[1]} ${hora} queda a menos de 15 min; usa "ahora" o una hora posterior.`);
  }
  return { dia: m[1], hora };
}

/** Lunes (AAAA-MM-DD) de la semana de `dia`. */
export function semanaDe(dia: string): string {
  return weekMonday(zonedToUtc(dia, "12:00"));
}

/** Ids de las piezas a menos de `minutos` minutos de `dia` `hora` (cruza medianoche). */
export function piezasCercanas(piezas: Pieza[], dia: string, hora: string, minutos = 120): string[] {
  const t = zonedToUtc(dia, hora).getTime();
  return piezas
    .filter((p) => Math.abs(zonedToUtc(p.dia, p.hora).getTime() - t) < minutos * 60_000)
    .map((p) => p.id);
}
