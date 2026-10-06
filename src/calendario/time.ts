/** Zona del calendario: todas las horas de plan.json son locales de Chile continental. */
export const ZONA = "America/Santiago";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface LocalParts {
  dia: string;
  hora: string;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
}

/** Fecha y hora local de un instante en `zone`. Función pura. */
export function localParts(at: Date, zone = ZONA): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string): string => parts.find((p) => p.type === t)!.value;
  return {
    dia: `${get("year")}-${get("month")}-${get("day")}`,
    hora: `${get("hour")}:${get("minute")}`,
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** Minutos que `zone` le suma a UTC en ese instante (Chile: -180 o -240). */
function offsetMinutes(at: Date, zone: string): number {
  const l = localParts(at, zone);
  const [y, m, d] = l.dia.split("-").map(Number);
  const [hh, mm] = l.hora.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * Instante UTC de una fecha y hora locales. Si la hora se repite (fin del horario
 * de verano) se toma la primera; si no existe (inicio), la misma hora de reloj
 * después del salto. Función pura.
 */
export function zonedToUtc(dia: string, hora: string, zone = ZONA): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) throw new Error(`Fecha u hora inválida: ${dia} ${hora}`);
  const [y, m, d] = dia.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const before = offsetMinutes(new Date(guess - 12 * 3_600_000), zone);
  const after = offsetMinutes(new Date(guess + 12 * 3_600_000), zone);
  const candidates = [...new Set([before, after])].map((o) => guess - o * 60_000).sort((a, b) => a - b);
  for (const t of candidates) {
    const l = localParts(new Date(t), zone);
    if (l.dia === dia && l.hora === hora) return new Date(t);
  }
  return new Date(guess - before * 60_000);
}

/** Suma días a una fecha AAAA-MM-DD (calendario, sin zona). */
export function addDays(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Lunes (AAAA-MM-DD) de la semana local que contiene `at`. */
export function weekMonday(at: Date, zone = ZONA): string {
  const l = localParts(at, zone);
  return addDays(l.dia, -((l.weekday + 6) % 7));
}
