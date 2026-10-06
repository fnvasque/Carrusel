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

/** Fecha AAAA-MM-DD real (ida y vuelta por Date.UTC, como `validDate` de validar.mjs). */
export function fechaValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Instante UTC de una fecha y hora locales. Si la hora se repite (fin del horario
 * de verano) se toma la primera; si no existe (inicio), la misma hora de reloj
 * después del salto. Función pura.
 */
export function zonedToUtc(dia: string, hora: string, zone = ZONA): Date {
  if (!fechaValida(dia) || !/^\d{2}:\d{2}$/.test(hora)) throw new Error(`Fecha u hora inválida: ${dia} ${hora}`);
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

/**
 * Zona de las horas de `online_followers`. Meta documenta que los períodos de insights
 * terminan en UTC−07:00 (hora del Pacífico), así que por defecto las claves "0".."23" se
 * leen en `America/Los_Angeles`. Se puede cambiar en `config.json → zonaOnlineFollowers`
 * (supuesto: verificar al cruzar 100 seguidores).
 */
export const ZONA_ONLINE_FOLLOWERS = "America/Los_Angeles";

/** ¿`zona` es una zona IANA que Intl entiende? */
function zonaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/** `config.json → zonaOnlineFollowers` (`{ valor }` o texto); la zona del Pacífico si falta o no es válida. */
export function zonaOnlineFollowers(config: unknown): string {
  const c = typeof config === "object" && config !== null ? (config as Record<string, unknown>).zonaOnlineFollowers : undefined;
  const v = typeof c === "object" && c !== null ? (c as Record<string, unknown>).valor : c;
  return typeof v === "string" && v && zonaValida(v) ? v : ZONA_ONLINE_FOLLOWERS;
}

/**
 * Hora de Chile ("HH:MM") que corresponde a la hora `h` (0-23) de `online_followers` en
 * `zonaOrigen`, el día `dia`. Único punto de conversión: lo usan el bucle (horas del
 * calendario) y el resumen semanal (hora con más audiencia). Respeta el cambio de hora de
 * ambas zonas porque convierte el instante concreto de ese día.
 */
export function horaOnlineALocal(h: number, dia: string, zonaOrigen = ZONA_ONLINE_FOLLOWERS): string {
  return localParts(zonedToUtc(dia, `${String(h).padStart(2, "0")}:00`, zonaOrigen)).hora;
}
