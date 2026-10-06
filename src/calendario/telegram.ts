import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { estadoEfectivo, type Estado, type MediosRender, type Pieza, type SemanaLeida } from "./plan.ts";
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

const segmentador = new Intl.Segmenter("es", { granularity: "grapheme" });

/**
 * Trunca a `max` unidades UTF-16 (como mide Telegram) con "…" al final, cortando solo
 * entre grafemas: nunca deja un surrogate suelto ni parte un emoji compuesto.
 */
export function truncar(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = "";
  for (const { segment } of segmentador.segment(s)) {
    if (out.length + segment.length + 1 > max) break;
    out += segment;
  }
  return `${out}…`;
}

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

const ARCHIVO_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Nombre del archivo de una URL de medios (último segmento), o "" si no es una URL o el
 * nombre no es seguro (`^[A-Za-z0-9._-]+$`, sin `..`). Nunca devuelve la URL (lleva el token).
 */
export function archivoDeUrl(u: string | undefined): string {
  if (!u) return "";
  let nombre: string;
  try {
    nombre = decodeURIComponent(new URL(u).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
  return nombreSeguro(nombre);
}

/** El nombre si es seguro (`^[A-Za-z0-9._-]+$`, sin `..` ni `.` inicial); si no, "". */
function nombreSeguro(nombre: string | undefined): string {
  if (!nombre) return "";
  return ARCHIVO_RE.test(nombre) && !nombre.includes("..") && !nombre.startsWith(".") ? nombre : "";
}

/**
 * Preview de una pieza recién renderizada (R44): nombre del archivo de la portada (del
 * reel), la primera imagen (del carrusel) o la story; "" si no hay. El bot lo sube desde
 * la raíz de medios: la URL pública, con `MEDIA_PUBLIC_TOKEN`, nunca va a Telegram.
 * Caption con día, hora, formato, hook y el caption de Instagram, truncado a 1024 con "…".
 */
export function formatPreview(p: Pieza, medios: MediosRender): { caption: string; archivo: string } {
  // R48: render.json ya trae nombres de archivo; solo se acepta un nombre seguro.
  const candidatos = p.formato === "carrusel" ? [medios.archivos[0], medios.story] : [medios.cover, medios.story];
  const archivo = candidatos.map(nombreSeguro).find((a) => a !== "") ?? "";
  const texto = [
    `🗓 ${diaCorto(p.dia)} ${p.hora} · ${p.formato} · ${p.id}`,
    `🪝 ${p.hook.texto}`,
    "",
    p.caption,
  ].join("\n");
  return { caption: truncar(texto, TELEGRAM_CAPTION_MAX), archivo };
}

/**
 * Ruta local de un medio: `<root>/<semana>/<id>/<archivo>`, o undefined si algún segmento
 * no es válido o la ruta resuelta sale de la raíz. (El bot además compara con `realpath`.)
 */
export function rutaMedioLocal(root: string, semana: string, id: string, archivo: string): string | undefined {
  if (!SEMANA_RE.test(semana) || !ID_RE.test(id) || !ARCHIVO_RE.test(archivo) || archivo.includes("..")) return undefined;
  const base = resolve(root);
  const ruta = resolve(base, semana, id, archivo);
  return ruta.startsWith(base + sep) ? ruta : undefined;
}

/** ¿Pieza `planificada` (sin render ni estado del bot) cuya hora aún no llega? */
function pendienteDeRender(s: SemanaLeida, p: Pieza, t: number): boolean {
  const h = horaDe(p);
  return h !== undefined && h > t && estadoEfectivo(p, s.render[p.id], s.estado[p.id]) === "planificado";
}

/**
 * Aviso de render pendiente (R41), por semana y en dos etapas:
 * - `domingo`: desde el domingo 18:00 (Chile) anterior a la semana (el plan nace el
 *   domingo 06:00, así que antes no hay piezas de la semana siguiente);
 * - `12h`: desde 12 h antes de la primera pieza pendiente, si sigue pendiente
 *   (p. ej. lunes 02:00 para un post de las 14:00).
 * Solo si hay piezas `planificadas` sin render cuya hora no pasó. La clave devuelta
 * (`"<semana>:domingo"` o `"<semana>:12h"`) se guarda y se pasa en `yaAvisado`; cada
 * etapa sale una vez por semana, y avisada la de 12 h ya no sale la del domingo.
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
      `(semana del ${s.semana}; la primera sale el ${diaCortoDe(primera)}).`;
    const k12 = `${s.semana}:12h`;
    const kDom = `${s.semana}:domingo`;
    if (ya.has(k12)) continue;
    if (t >= primera - 12 * 3_600_000) return { clave: k12, texto };
    let domingo: number;
    try {
      domingo = zonedToUtc(addDays(s.semana, -1), "18:00").getTime();
    } catch {
      continue;
    }
    if (!ya.has(kDom) && t >= domingo) return { clave: kDom, texto };
  }
  return undefined;
}

/** Etapas de `avisoRenderPendiente` (para armar `yaAvisado`). */
export const ETAPAS_RENDER = ["domingo", "12h"] as const;

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
 * Silencio del planificador: el domingo desde las 12:00 (Chile), si la semana que empieza
 * el lunes siguiente no tiene `plan.json` legible. `semanasConPlan` son las semanas con
 * plan legible (ver `semanasConPlan`): una carpeta vacía o con un plan roto cuenta como
 * ausente; un plan con `piezas: []` (latido del agente) cuenta como presente.
 */
export function silencioCalendario(semanasConPlan: string[], ahora: Date): string | undefined {
  const l = localParts(ahora);
  if (l.weekday !== 0 || l.hora < "12:00") return undefined;
  const siguiente = addDays(weekMonday(ahora), 7);
  if (semanasConPlan.includes(siguiente)) return undefined;
  return `⚠️ El planificador no corrió: no hay _calendario/${siguiente}/plan.json legible y ya es domingo 12:00. ` +
    "La semana queda sin piezas hasta que el agente la escriba (no reciclo las anteriores).";
}

/** De `semanas`, las que tienen `plan.json` legible (`leer` devuelve algo y no lanza). */
export async function semanasConPlan(
  semanas: string[],
  leer: (semana: string) => Promise<SemanaLeida | undefined>,
): Promise<string[]> {
  const out: string[] = [];
  for (const s of semanas) {
    try {
      if (await leer(s)) out.push(s);
    } catch {
      // plan.json ilegible: como si no existiera.
    }
  }
  return out;
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

/** Huella corta y estable de un id (no depende de su posición en el plan). */
const huella = (id: string): string => createHash("sha256").update(id).digest("hex").slice(0, 12);

/** `callback_data` del botón Saltar: `cal-saltar:<semana>:<id>`; si no cabe en 64 bytes, `~<huella del id>`. */
export function callbackSaltar(semana: string, id: string): string {
  const largo = `${PREFIJO_SALTAR}:${semana}:${id}`;
  return Buffer.byteLength(largo) <= CALLBACK_MAX ? largo : `${PREFIJO_SALTAR}:${semana}:~${huella(id)}`;
}

/**
 * Lee un `callback_data` de Saltar y lo resuelve contra las semanas cargadas. Con huella,
 * exige exactamente un id de la semana que coincida; si el plan cambió, undefined.
 */
export function leerCallbackSaltar(data: string, semanas: SemanaLeida[]): { semana: string; id: string } | undefined {
  const [pref, semana, ref, ...resto] = data.split(":");
  if (pref !== PREFIJO_SALTAR || resto.length || !semana || !ref || !SEMANA_RE.test(semana)) return undefined;
  const s = semanas.find((x) => x.semana === semana);
  if (!s) return undefined;
  if (ref.startsWith("~")) {
    if (!/^~[0-9a-f]{12}$/.test(ref)) return undefined;
    const ids = s.plan.piezas.filter((p) => huella(p.id) === ref.slice(1));
    return ids.length === 1 ? { semana, id: ids[0].id } : undefined;
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

/**
 * Piezas cuyo preview falta: render con medios, sin estado del bot o `programado`, hora
 * futura y sin la marca de preview entregado (`enviado(clave)`). `nueva` = aún sin
 * estado (el bot la pasa a `programado`). Un preview que no llegó se reintenta.
 */
export function previewsPendientes(
  semanas: SemanaLeida[],
  ahora: Date,
  enviado: (clave: string) => boolean,
): { semana: string; pieza: Pieza; medios: MediosRender; nueva: boolean }[] {
  const t = ahora.getTime();
  const out: { semana: string; pieza: Pieza; medios: MediosRender; nueva: boolean }[] = [];
  for (const s of semanas) {
    for (const p of s.plan.piezas) {
      const r = s.render[p.id];
      const est = s.estado[p.id];
      const h = horaDe(p);
      if (r?.estado !== "renderizado" || !r.medios || h === undefined || h <= t) continue;
      if (est && est.estado !== "programado") continue;
      if (enviado(claveFila(s.semana, p.id))) continue;
      out.push({ semana: s.semana, pieza: p, medios: r.medios, nueva: !est });
    }
  }
  return out;
}

/**
 * ¿Arranca el scheduler? (M5) Sin `CALENDARIO_MODO`, no. Con él, solo si la configuración
 * de Meta está (`metaLista` lanza si falta): sin `META_*` el bot sigue en pie (fichas,
 * DMs, /metricas, previews) y solo el scheduler queda apagado, con un aviso.
 */
export function arranqueScheduler(modo: "auto" | "aviso" | undefined, metaLista: () => void): { scheduler: boolean; aviso?: string } {
  if (!modo) return { scheduler: false };
  try {
    metaLista();
    return { scheduler: true };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    return {
      scheduler: false,
      aviso: `⚠️ CALENDARIO_MODO=${modo} pero falta la configuración de Meta (${motivo}): no publico nada del calendario ` +
        "hasta que completes META_ACCESS_TOKEN y META_IG_USER_ID y reinicies el bot. El resto del bot sigue funcionando.",
    };
  }
}

/**
 * Medios que se pueden borrar a los 7 días (M6): las publicadas desde su `publicadoEn`;
 * las saltadas o fallidas desde su hora del plan (nunca salen, sus medios solo ocupan disco).
 */
export function mediosParaLimpiar(semanas: SemanaLeida[]): { semana: string; id: string; publicadoEn: string }[] {
  const out = publicadas(semanas);
  for (const s of semanas) {
    for (const p of s.plan.piezas) {
      const e = s.estado[p.id]?.estado;
      if (e !== "saltado" && e !== "fallido") continue;
      try {
        out.push({ semana: s.semana, id: p.id, publicadoEn: zonedToUtc(p.dia, p.hora).toISOString() });
      } catch {
        // día u hora inválidos: no se borra nada
      }
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

/**
 * Lo que el bot le pasa a `sendPhoto` (R44): el caption y la ruta LOCAL del archivo
 * (bajo `root`), nunca la URL pública. Sin archivo válido, `ruta` queda undefined
 * (el bot manda solo el texto).
 */
export function argsPreview(root: string, semana: string, p: Pieza, medios: MediosRender): { caption: string; ruta?: string } {
  const { caption, archivo } = formatPreview(p, medios);
  const ruta = archivo ? rutaMedioLocal(root, semana, p.id, archivo) : undefined;
  return ruta ? { caption, ruta } : { caption };
}
