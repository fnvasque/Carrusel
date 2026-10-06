import { estadoEfectivo, type Estado, type Medios, type Pieza, type SemanaLeida } from "./plan.ts";
import { claveFila } from "./scheduler.ts";
import { addDays, localParts, weekMonday, zonedToUtc } from "./time.ts";

/**
 * Textos y decisiones del calendario en Telegram (servidor). Todo es puro: `bot.ts`
 * solo lee, llama a estas funciones y envía. Ningún texto lleva URLs de medios (el
 * token de `MEDIA_PUBLIC_TOKEN` va dentro de ellas).
 */

export { ordenesDesde, type Ordenes } from "./scheduler.ts";

/** Límite de caption de una foto en Telegram. */
export const TELEGRAM_CAPTION_MAX = 1024;
/** Límite de `callback_data` de un botón inline (bytes). */
const CALLBACK_MAX = 64;
const PREFIJO_SALTAR = "cal-saltar";

const ID_RE = /^[a-z0-9-]{3,80}$/;
const SEMANA_RE = /^\d{4}-\d{2}-\d{2}$/;

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const EMOJI: Record<Estado, string> = {
  planificado: "📝",
  renderizado: "🎬",
  programado: "⏰",
  publicado: "✅",
  saltado: "⏭️",
  fallido: "❌",
};

/** "lun 12/10" de una fecha AAAA-MM-DD (calendario, sin zona). */
function diaCorto(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Instante de la pieza, o undefined si su día/hora no se puede convertir. */
function horaDe(p: Pieza): number | undefined {
  try {
    return zonedToUtc(p.dia, p.hora).getTime();
  } catch {
    return undefined;
  }
}

const truncar = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** `/calendario`: una línea por pieza con emoji, día, hora, formato, id y estado; marca la próxima. */
export function formatSemana(s: SemanaLeida, ahora: Date): string {
  const cab = `📅 Semana del ${s.semana}`;
  if (!s.plan.piezas.length) return `${cab}\nSin piezas${s.plan.motivo ? `: ${s.plan.motivo}` : "."}`;
  let proximaMarcada = false;
  const lineas = [...s.plan.piezas]
    .sort((a, b) => (horaDe(a) ?? 0) - (horaDe(b) ?? 0))
    .map((p) => {
      const est = s.estado[p.id];
      const ef = estadoEfectivo(p, s.render[p.id], est);
      const motivo = est?.motivo ?? (ef === "fallido" ? s.render[p.id]?.motivo : undefined);
      let l = `${EMOJI[ef]} ${diaCorto(p.dia)} ${p.hora} · ${p.formato} · ${p.id} — ${ef}`;
      if (motivo) l += ` (${truncar(motivo, 120)})`;
      if (est?.story) l += ` · story ${est.story.estado}`;
      const h = horaDe(p);
      if (!proximaMarcada && h !== undefined && h > ahora.getTime() && (ef === "programado" || ef === "renderizado" || ef === "planificado")) {
        l += " ← próxima";
        proximaMarcada = true;
      }
      return l;
    });
  return [cab, ...lineas].join("\n");
}

/**
 * Preview de una pieza recién renderizada: foto (portada del reel, primera imagen del
 * carrusel; si no hay, la story; si nada, "") y caption con día, hora, formato, hook y
 * el caption de Instagram, truncado a 1024 con "…".
 */
export function formatPreview(p: Pieza, medios: Medios): { caption: string; foto: string } {
  const foto = p.formato === "carrusel" ? (medios.urls[0] ?? medios.story ?? "") : (medios.cover ?? medios.story ?? "");
  const texto = [
    `🗓 ${diaCorto(p.dia)} ${p.hora} · ${p.formato} · ${p.id}`,
    `🪝 ${p.hook.texto}`,
    "",
    p.caption,
  ].join("\n");
  return { caption: truncar(texto, TELEGRAM_CAPTION_MAX), foto };
}

/** ¿Pieza `planificada` (sin render ni estado del bot) cuya hora aún no llega? */
function pendienteDeRender(s: SemanaLeida, p: Pieza, t: number): boolean {
  const h = horaDe(p);
  return h !== undefined && h > t && estadoEfectivo(p, s.render[p.id], s.estado[p.id]) === "planificado";
}

/**
 * Aviso de render pendiente, por semana y en dos etapas:
 * - `sabado`: desde el sábado 12:00 anterior a la semana;
 * - `12h`: desde 12 h antes de la primera pieza pendiente.
 * Solo si hay piezas `planificadas` sin render cuya hora no pasó. La clave devuelta
 * (`"<semana>:sabado"` o `"<semana>:12h"`) se guarda y se pasa en `yaAvisado`; avisada la
 * etapa `12h`, la del sábado ya no sale. Nunca dos veces la misma etapa.
 */
export function avisoRenderPendiente(
  semanas: SemanaLeida[],
  ahora: Date,
  yaAvisado: string[] = [],
): { clave: string; texto: string } | undefined {
  const t = ahora.getTime();
  const ya = new Set(yaAvisado);
  for (const s of semanas) {
    const pendientes = s.plan.piezas.filter((p) => pendienteDeRender(s, p, t));
    if (!pendientes.length) continue;
    const primera = Math.min(...pendientes.map((p) => horaDe(p)!));
    const texto = `🖥 Prende el Mac: faltan ${pendientes.length} ${pendientes.length === 1 ? "pieza" : "piezas"} por renderizar ` +
      `(semana del ${s.semana}; la primera sale ${diaCortoDe(primera)}).`;
    const k12 = `${s.semana}:12h`;
    const kSab = `${s.semana}:sabado`;
    if (ya.has(k12)) continue;
    if (t >= primera - 12 * 3_600_000) return { clave: k12, texto };
    let sabado: number;
    try {
      sabado = zonedToUtc(addDays(s.semana, -2), "12:00").getTime();
    } catch {
      continue;
    }
    if (!ya.has(kSab) && t >= sabado) return { clave: kSab, texto };
  }
  return undefined;
}

function diaCortoDe(t: number): string {
  const l = localParts(new Date(t));
  return `${diaCorto(l.dia)} ${l.hora}`;
}

/** Recordatorio del lunes ≥ 09:00 (hora de Chile), una vez por semana (`ultimo` = lunes del último envío). */
export function recordatorioLunes(ahora: Date, ultimo?: string): boolean {
  const l = localParts(ahora);
  return l.weekday === 1 && l.hora >= "09:00" && ultimo !== l.dia;
}

export const TEXTO_RECORDATORIO_LUNES = "💬 Esta semana: 30-60 min de interacción en el nicho.";
export const TEXTO_POST_PUBLICACION = "Responde los comentarios en la primera hora.";

/**
 * Silencio del planificador: el domingo desde las 12:00 (Chile), si no existe la carpeta
 * `_calendario/<lunes siguiente>/` (aunque traiga `piezas: []`, existir basta).
 */
export function silencioCalendario(semanas: string[], ahora: Date): string | undefined {
  const l = localParts(ahora);
  if (l.weekday !== 0 || l.hora < "12:00") return undefined;
  const siguiente = addDays(weekMonday(ahora), 7);
  if (semanas.includes(siguiente)) return undefined;
  return `⚠️ El planificador no corrió: no hay _calendario/${siguiente}/ y ya es domingo 12:00. ` +
    "La semana queda sin piezas hasta que el agente la escriba (no reciclo las anteriores).";
}

/**
 * Pieza desde el argumento de `/publicar` o `/saltar`: `id`, `semana/id` o un prefijo
 * único del id, solo entre las semanas dadas. Ambiguo o desconocido → undefined.
 */
export function idDesdeArgumento(arg: string, semanas: SemanaLeida[]): { semana: string; id: string } | undefined {
  const a = arg.trim().toLowerCase();
  if (!a) return undefined;
  const todas = semanas.flatMap((s) => s.plan.piezas.map((p) => ({ semana: s.semana, id: p.id })));
  const m = /^(\d{4}-\d{2}-\d{2})\/(.+)$/.exec(a);
  if (m) {
    if (!SEMANA_RE.test(m[1]) || !ID_RE.test(m[2])) return undefined;
    return todas.find((x) => x.semana === m[1] && x.id === m[2]);
  }
  if (!/^[a-z0-9-]+$/.test(a)) return undefined;
  const exactas = todas.filter((x) => x.id === a);
  if (exactas.length) return exactas.length === 1 ? exactas[0] : undefined;
  const prefijo = todas.filter((x) => x.id.startsWith(a));
  return prefijo.length === 1 ? prefijo[0] : undefined;
}

/** `callback_data` del botón Saltar: `cal-saltar:<semana>:<id>`; si no cabe en 64 bytes, `#<índice en el plan>`. */
export function callbackSaltar(semana: string, id: string, s: SemanaLeida): string {
  const largo = `${PREFIJO_SALTAR}:${semana}:${id}`;
  if (Buffer.byteLength(largo) <= CALLBACK_MAX) return largo;
  return `${PREFIJO_SALTAR}:${semana}:#${s.plan.piezas.findIndex((p) => p.id === id)}`;
}

/** Lee un `callback_data` de Saltar y lo resuelve contra las semanas cargadas. */
export function leerCallbackSaltar(data: string, semanas: SemanaLeida[]): { semana: string; id: string } | undefined {
  const [pref, semana, ref, ...resto] = data.split(":");
  if (pref !== PREFIJO_SALTAR || resto.length || !semana || !ref || !SEMANA_RE.test(semana)) return undefined;
  const s = semanas.find((x) => x.semana === semana);
  if (!s) return undefined;
  if (ref.startsWith("#")) {
    if (!/^#\d{1,3}$/.test(ref)) return undefined;
    const p = s.plan.piezas[Number(ref.slice(1))];
    return p ? { semana, id: p.id } : undefined;
  }
  return s.plan.piezas.some((p) => p.id === ref) ? { semana, id: ref } : undefined;
}

/** Ventana del aviso post-publicación: desde 2 min después del publish hasta 1 h. */
const POST_DESDE_MS = 2 * 60_000;
const POST_HASTA_MS = 60 * 60_000;

/**
 * Piezas publicadas hace ≥ 2 min (y < 1 h) cuyo aviso post-publicación no salió
 * (`yaAvisado` = claves `"<semana>/<id>"`). Ignora el modo aviso (`mediaId` `aviso-…`).
 */
export function avisosPostPublicacion(
  semanas: SemanaLeida[],
  ahora: Date,
  yaAvisado: string[],
): { clave: string; semana: string; id: string; mediaId: string }[] {
  const t = ahora.getTime();
  const ya = new Set(yaAvisado);
  const out: { clave: string; semana: string; id: string; mediaId: string }[] = [];
  for (const s of semanas) {
    for (const p of s.plan.piezas) {
      const est = s.estado[p.id];
      if (est?.estado !== "publicado" || !est.mediaId || est.mediaId.startsWith("aviso-")) continue;
      const pub = Date.parse(est.publicadoEn ?? "");
      if (Number.isNaN(pub) || t < pub + POST_DESDE_MS || t >= pub + POST_HASTA_MS) continue;
      const clave = claveFila(s.semana, p.id);
      if (!ya.has(clave)) out.push({ clave, semana: s.semana, id: p.id, mediaId: est.mediaId });
    }
  }
  return out;
}

/**
 * `CALENDARIO_MODO`: `auto` o `aviso`. Sin la variable (o vacía) → undefined (el
 * scheduler no corre). Cualquier otro valor lanza: el bot no arranca con un modo dudoso.
 */
export function modoCalendario(v: string | undefined): "auto" | "aviso" | undefined {
  const m = v?.trim();
  if (!m) return undefined;
  if (m === "auto" || m === "aviso") return m;
  throw new Error(`CALENDARIO_MODO="${m}" no es válido: usa "auto" (publica) o "aviso" (todo menos publicar), o quítala para apagar el calendario.`);
}

/** Piezas `renderizadas` sin estado del bot cuya hora no llegó: el bot las pasa a `programado` y manda el preview. */
export function porProgramar(semanas: SemanaLeida[], ahora: Date): { semana: string; pieza: Pieza; medios: Medios }[] {
  const t = ahora.getTime();
  const out: { semana: string; pieza: Pieza; medios: Medios }[] = [];
  for (const s of semanas) {
    for (const p of s.plan.piezas) {
      const r = s.render[p.id];
      const h = horaDe(p);
      if (s.estado[p.id] || r?.estado !== "renderizado" || !r.medios || h === undefined || h <= t) continue;
      out.push({ semana: s.semana, pieza: p, medios: r.medios });
    }
  }
  return out;
}

/** Publicadas con fecha válida (para borrar sus medios a los 7 días). */
export function publicadas(semanas: SemanaLeida[]): { semana: string; id: string; publicadoEn: string }[] {
  return semanas.flatMap((s) =>
    Object.entries(s.estado)
      .filter(([, e]) => e.estado === "publicado" && typeof e.publicadoEn === "string")
      .map(([id, e]) => ({ semana: s.semana, id, publicadoEn: e.publicadoEn! })),
  );
}
