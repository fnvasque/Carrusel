import { homedir } from "node:os";

// Filtro automático de datos sensibles para /caso: limpia el texto de las sesiones antes
// de mostrarlo o convertirlo en una pieza pública. Conservador: ante la duda, tapa.

export interface Tapado {
  tipo: "clave" | "correo" | "telefono" | "rut" | "ruta" | "archivo" | "enlace";
  original: string;
}

export const DOMINIOS_PUBLICOS: readonly string[] = [
  "claude.ai", "claude.com", "anthropic.com", "suno.com", "blender.org",
  "threejs.org", "openai.com", "higgsfield.ai", "klingai.com",
];

const EXT =
  "ts|tsx|js|mjs|py|json|jsonl|md|mp4|png|jpg|jpeg|env|sql|csv|tsv|pdf|docx|xlsx|pptx|txt|mov|html|css|" +
  "yaml|yml|key|numbers|pages|gif|webp|wav|mp3|zip|ipynb|log";

// Solo el destino `(imagenes/…)` de una imagen o enlace propio: el texto alternativo sí pasa por el filtro.
const RE_IMAGEN_PROPIA = /(?<=\])\(imagenes\/(?!\S*\.\.)[^)\s]+\)/g;
// Herramientas públicas que terminan en .js: se nombran, no son archivos
const RE_HERRAMIENTA = /(?<![\w.-])(?:three|node|next|d3|p5|vue|nuxt|express|chart|react)\.js(?![\w])/gi;
// Cualquier esquema (https, postgres, redis, git+ssh…): las cadenas de conexión llevan usuario y clave.
const RE_URL = /(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/[^\s<>)"'\]]+/gi;
const RE_CLAVES: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /ghp_\w{20,}/g,
  /github_pat_\w+/g,
  /AKIA[0-9A-Z]{16}/g,
  /\b[sr]k_(?:live|test)_\w{16,}/g,
  /AIza[0-9A-Za-z_-]{35,}/g,
  /xox[bpas]-[\w-]+/g,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g,
  /Bearer\s+[\w.-]{16,}/g,
  /Authorization:\s*Basic\s+[A-Za-z0-9+\/]+={0,2}/gi,
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi,
];
const RE_CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const RE_RUT = /(?<![\w.,])\d{1,2}\.?\d{3}\.?\d{3}-[\dkK](?![\w])/g;
// Móvil chileno; los bordes evitan tomar un trozo de números largos (1.048.576, 20261101…).
const RE_TEL = /(?<![\w.,])(?:\(?\+?56\)?[\s-]?)?9[\s-]?\d{4}[\s-]?\d{4}(?![\w]|[.,]\d)/g;
// Fijo chileno: Santiago (2 2345 6789 o 22 345 6789) y regiones (32 234 5678), con o sin +56.
const RE_FIJO = /(?<![\w.,])(?:\(?\+?56\)?[\s-]?)?(?:2[\s-]?\d{4}|[2-7]\d[\s-]?\d{3})[\s-]?\d{4}(?![\w]|[.,]\d)/g;
const RE_ARCHIVO = new RegExp(`(?<![\\w.-])[\\w.-]*\\w\\.(?:${EXT})(?![\\w])`, "gi");
// Dominio sin esquema (www.cliente.cl, github.com/acme/repo); solo TLD conocidos para no tocar archivos
const TLD = "com|org|net|io|ai|dev|app|co|cl|es|mx|ar|pe|us|uk|edu|gov|me|tv|xyz|info|biz";
const RE_DOMINIO = new RegExp(
  `(?<![\\w@./:-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLD})(?![\\w@-])(?:\\/[^\\s<>)"'\\]]*)?`,
  "gi",
);

// Rutas. Dentro de una ruta sin comillas, un segmento sigue tras un espacio solo si la palabra
// siguiente empieza con mayúscula o dígito («Banco Andino SpA», «Proyecto Uno 1»), o si
// el segmento final llega a una extensión conocida. Una palabra en minúscula (o `&&`, `|`,
// signos de oración) corta la ruta. Con comillas se traga hasta la comilla de cierre.
const CH = /[^\s\/\\"'`<>)\]]/.source;
const LAST = /[^\s\/\\"'`<>)\].,;:!?]/.source;
const MAYUS = "[A-ZÁÉÍÓÚÑÜ0-9]";
const SIN_PUNTO = "(?<![.,;:!?])";
const ESP = "[ \\t]+";
const SEG = `${CH}+(?:${SIN_PUNTO}${ESP}${MAYUS}${CH}*)*`;
const SEP = /[\/\\]/.source;
const EXT_RUTA = `${EXT}|${EXT.toUpperCase()}`;
const FINAL =
  `(?:(?:${CH}*${LAST}${ESP}){0,5}${CH}*?\\.(?:${EXT_RUTA})(?![\\w])` +
  `|(?:${CH}*${LAST}(?:${SIN_PUNTO}${ESP}${MAYUS}(?:${CH}*${LAST})?)*)?)`;
// Incluye los relativos al proyecto o al usuario: ./, ../, $HOME/ y %USERPROFILE%\\.
const PREFIJOS_FIJOS =
  String.raw`\/Users\/|\/home\/|~\/|(?<![\w])[A-Za-z]:\\|(?<![\w\/\\.])\.\.?[\/\\]|\$HOME[\/\\]|%USERPROFILE%[\/\\]`;
const RE_RUTA_GENERICA = new RegExp(`(?<![\\w\\/.:<>)\\]-])\\/(?:${SEG}${SEP})+${FINAL}`, "g");

// Ruta relativa sin prefijo con dos separadores o más y letras al inicio de los dos primeros
// segmentos (Clientes/Banco Andino/plan.md). Un solo separador es prosa: y/o, 2/3, A/B, carrusel/reel.
// El primer segmento solo sigue tras un espacio si empieza con mayúscula, para no tragarse «en».
const LETRA = "[A-Za-zÀ-ÿ]";
const SEG_REL = `(?:[A-ZÁÉÍÓÚÑÜ]${CH}*(?:${SIN_PUNTO}${ESP}${MAYUS}${CH}*)*|${LETRA}${CH}*)`;
const RE_RUTA_RELATIVA = new RegExp(
  `(?<![\\w\\/\\\\.~$%:@\\[-])${SEG_REL}${SEP}${LETRA}${SEG}${SEP}(?:${SEG}${SEP})*${FINAL}`,
  "g",
);
// Lo que queda pegado a un [ruta] y aún trae un separador es la cola de la misma ruta
// («[ruta] andino/Contrato Secreto/plan»): se junta con el marcador hasta que no cambie.
const RE_COLA_RUTA = /\[ruta\](?:[ \t]+[^\s\[\]]*[\/\\][^\s\[\]]*)+/g;

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Reemplazo de una URL: solo el dominio si es público; si no, [enlace]. */
function reemplazoUrl(url: string): string {
  // La puntuación final no es parte del enlace
  const m = /^(.*?)([.,;:!?]*)$/.exec(url)!;
  const limpia = m[1]!;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(limpia) ? limpia : "http://" + limpia).hostname.replace(/^www\./, "");
    if (DOMINIOS_PUBLICOS.some((d) => host === d || host.endsWith("." + d))) return host + m[2];
  } catch {
    /* URL inválida: se tapa */
  }
  return "[enlace]" + m[2];
}

function reRutas(home: string): RegExp[] {
  const h = home.replace(/[\/\\]+$/, "");
  const conHome = h.length > 1 ? `|${escapar(h)}(?:[\\/\\\\]|(?![\\w]))` : "";
  const prefijos = PREFIJOS_FIJOS + conHome;
  const iniciosEntrecomillados = String.raw`\/[\w.-]+[\/\\]|~\/|[A-Za-z]:\\` + (h.length > 1 ? `|${escapar(h)}` : "");
  return [
    // Entre comillas: se traga hasta la comilla de cierre
    new RegExp(`(["'\`])(?:${iniciosEntrecomillados})(?:(?!\\1)[^\\n])*\\1`, "g"),
    new RegExp(`(?:${prefijos})(?:${SEG}${SEP})*${FINAL}`, "g"),
    RE_RUTA_GENERICA,
  ];
}

function motor(entrada: string, home: string): { texto: string; tapados: Tapado[] } {
  const tapados: Tapado[] = [];
  // Un NUL en la entrada podría imitar un marcador de protección
  const texto = entrada.replace(/\u0000/g, "");
  // Imágenes propias de las historias y herramientas públicas: se protegen del filtro
  const guardadas: string[] = [];
  const proteger = (m: string) => {
    guardadas.push(m);
    return `\u0000${guardadas.length - 1}\u0000`;
  };
  let t = texto.replace(RE_IMAGEN_PROPIA, proteger).replace(RE_HERRAMIENTA, proteger);

  const aplicar = (re: RegExp, tipo: Tapado["tipo"], token: string) => {
    t = t.replace(re, (m) => {
      tapados.push({ tipo, original: m });
      return token;
    });
  };
  const colas = () => {
    for (let antes = ""; antes !== t; ) {
      antes = t;
      aplicar(RE_COLA_RUTA, "ruta", "[ruta]");
    }
  };
  const enlaces = (re: RegExp) => {
    t = t.replace(re, (m) => {
      const r = reemplazoUrl(m);
      if (r !== m) tapados.push({ tipo: "enlace", original: m });
      return r;
    });
  };

  enlaces(RE_URL);
  for (const re of RE_CLAVES) aplicar(re, "clave", "[clave]");
  // Rutas antes que RUT/teléfono: así un número dentro de una carpeta no corta la ruta
  for (const re of reRutas(home)) aplicar(re, "ruta", "[ruta]");
  colas();
  aplicar(RE_CORREO, "correo", "[correo]");
  aplicar(RE_RUT, "rut", "[rut]");
  aplicar(RE_TEL, "telefono", "[teléfono]");
  aplicar(RE_FIJO, "telefono", "[teléfono]");
  enlaces(RE_DOMINIO);
  // Tras los dominios: así github.com/acme/repo sigue siendo un [enlace]
  aplicar(RE_RUTA_RELATIVA, "ruta", "[ruta]");
  colas();
  aplicar(RE_ARCHIVO, "archivo", "[archivo]");

  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => guardadas[Number(i)] ?? "");
  return { texto: t, tapados };
}

/** Tapa claves, correos, teléfonos, RUT, rutas, archivos y enlaces no públicos. */
export function taparSensible(texto: string, ctx: { home?: string } = {}): { texto: string; tapados: Tapado[] } {
  return motor(texto, ctx.home ?? homedir());
}

/** Mismo motor, sin devolver el texto: lo que quedaría tapado. Puerta para texto ya filtrado. */
export function hallazgosSensibles(texto: string, ctx: { home?: string } = {}): Tapado[] {
  return motor(texto, ctx.home ?? homedir()).tapados;
}
