import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, checkAsync, done } from "./_check.ts";
import { numerosCaso } from "../src/caso/numeros.ts";
import { hallazgosSensibles, taparSensible } from "../src/caso/filtro.ts";
import { carpetaCaso, dentroDeCaso } from "../src/caso/carpeta.ts";
import { aprobar, estadoAprobacion, hashHistoria } from "../src/caso/aprobacion.ts";
import { historiaAHtml } from "../src/caso/pdf.ts";
import { trozarSesion } from "../src/caso/trozos.ts";
import { generarCaso, puertaGenerar, puertaGenerarDe } from "../src/caso/generar.ts";
import { carpetasDeSesiones, codificarRuta, lineaCarpetas, listarSesiones, type SesionResumen } from "../src/caso/sesiones.ts";
import { parseBorrador } from "../src/calendario/draft.ts";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures/caso/projects");
const PROYECTO = "/tmp/Mi Proyecto 1";

check("codificarRuta reemplaza todo lo no alfanumérico por guion", () => {
  const r = codificarRuta("/Users/x/Documents/Mis_Proyectos/Proyecto Uno 1");
  if (r !== "-Users-x-Documents-Mis-Proyectos-Proyecto-Uno-1") throw new Error(r);
});

check("carpetasDeSesiones incluye la exacta y los worktrees, no hermanas", () => {
  const c = carpetasDeSesiones(PROYECTO, FIX);
  if (c.length !== 2) throw new Error(`largo ${c.length}`);
  if (c.some((x) => x.endsWith("-otro"))) throw new Error("incluye -otro");
});

check("carpetasDeSesiones lanza si no hay conversaciones", () => {
  try {
    carpetasDeSesiones("/tmp/No Existe", FIX);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("No encontré conversaciones")) throw e;
    return;
  }
  throw new Error("no lanzó");
});

await checkAsync("listarSesiones resume las 3 sesiones del proyecto", async () => {
  const s = await listarSesiones(PROYECTO, { projectsDir: FIX });
  if (s.length !== 3) throw new Error(`sesiones ${s.length}`);
  if (s.map((x) => x.id).join() !== "aaaa1111,cccc3333,bbbb2222") throw new Error("orden " + s.map((x) => x.id));
  const a = s[0]!;
  if (a.mensajesUsuario.join("|") !== "Quiero armar un reporte de ventas|Ahora agrega un gráfico")
    throw new Error("mensajes " + JSON.stringify(a.mensajesUsuario));
  if (a.subagentes !== 1) throw new Error("subagentes " + a.subagentes);
  if (a.inicio !== "2026-10-30T11:57:00.000Z" || a.fin !== "2026-10-30T12:25:00.000Z") throw new Error("fechas");
  if (a.archivosTocados.length !== 2) throw new Error("archivos " + a.archivosTocados);
  if (a.herramientas.Write !== 1 || a.herramientas.Agent !== 1) throw new Error("herramientas");
  if (a.modelos.length !== 2) throw new Error("modelos");
  const t = a.tokens;
  if (t.entrada !== 13 || t.salida !== 25 || t.cacheLeida !== 107 || t.cacheCreada !== 14) throw new Error(JSON.stringify(t));
  if (s[1]!.subagentes !== 1) throw new Error("subagente de la rama");
});

await checkAsync("trozarSesion corta entre mensajes, sin salidas de herramientas", async () => {
  const archivo = join(FIX, "-tmp-Mi-Proyecto-1/aaaa1111.jsonl");
  const trozos: string[] = [];
  for await (const t of trozarSesion(archivo, 150)) trozos.push(t);
  if (trozos.length < 2) throw new Error(`trozos ${trozos.length}`);
  const todo = trozos.join("\n");
  if (todo.includes("SALIDA_SECRETA_DE_HERRAMIENTA")) throw new Error("incluye tool_result");
  for (const m of ["Quiero armar un reporte de ventas", "Ahora agrega un gráfico"])
    if (!todo.includes(m)) throw new Error("falta " + m);
  if (!todo.includes("· herramienta: Write /tmp/Mi Proyecto 1/reporte.md")) throw new Error("falta herramienta");
  if (!todo.includes("## Usuario") || !todo.includes("## Claude")) throw new Error("faltan encabezados");
});

// Mensajes de usuario como arreglo de bloques (prompts con capturas): cuentan si no traen tool_result.
const MENSAJES_BBBB = ["Revisemos los números de noviembre", "Ahora ordénalo por región", "[imagen adjunta]\nMira esta captura del gráfico"];

await checkAsync("resumirSesion cuenta mensajes de usuario en bloques (texto e imagen), no tool_result", async () => {
  const s = await listarSesiones(PROYECTO, { projectsDir: FIX });
  const b = s.find((x) => x.id === "bbbb2222")!;
  if (JSON.stringify(b.mensajesUsuario) !== JSON.stringify(MENSAJES_BBBB)) throw new Error("mensajes " + JSON.stringify(b.mensajesUsuario));
  const todo = b.mensajesUsuario.join("\n");
  for (const fuera of ["SALIDA_EN_ARREGLO", "TEXTO_JUNTO_A_TOOL_RESULT", "RECORDATORIO_INTERNO", "iVBORw0KGgo"])
    if (todo.includes(fuera)) throw new Error("incluye " + fuera);
});

await checkAsync("trozarSesion incluye mensajes de usuario en bloques, no tool_result ni imágenes crudas", async () => {
  const trozos: string[] = [];
  for await (const t of trozarSesion(join(FIX, "-tmp-Mi-Proyecto-1/bbbb2222.jsonl"))) trozos.push(t);
  const todo = trozos.join("\n");
  for (const m of MENSAJES_BBBB) if (!todo.includes(`## Usuario\n${m}\n`)) throw new Error("falta " + JSON.stringify(m));
  for (const fuera of ["SALIDA_EN_ARREGLO", "TEXTO_JUNTO_A_TOOL_RESULT", "RECORDATORIO_INTERNO", "iVBORw0KGgo"])
    if (todo.includes(fuera)) throw new Error("incluye " + fuera);
});

await checkAsync("numerosCaso cuenta versiones, renders y líneas de código", async () => {
  const dir = mkdtempSync(join(tmpdir(), "caso-num-"));
  try {
    for (const d of ["out", "app", "node_modules"]) mkdirSync(join(dir, d));
    for (const f of ["letra.md", "letra_v2.md", "guion_v1.md", "out/a.mp4", "node_modules/y.js"])
      writeFileSync(join(dir, f), "x\ny\n");
    writeFileSync(join(dir, "app/x.ts"), "a\nb\nc\n");
    const sesiones = await listarSesiones(PROYECTO, { projectsDir: FIX });
    const n = numerosCaso(dir, sesiones);
    if (JSON.stringify(n.versiones) !== '{"letra":2}') throw new Error("versiones " + JSON.stringify(n.versiones));
    if (n.renders !== 1) throw new Error("renders " + n.renders);
    if (n.lineasCodigo !== 3 || n.archivosCodigo !== 1) throw new Error(`código ${n.lineasCodigo}/${n.archivosCodigo}`);
    if (n.sesiones !== 3 || n.subagentes !== 2) throw new Error("sesiones/subagentes");
    if (n.dias !== 3 || numerosCaso(dir, [sesiones[0]!]).dias !== 1 || n.inicio !== sesiones[0]!.inicio) throw new Error("fechas " + n.dias);
    if (n.tokensTotales < n.tokensSalida || n.tokensSalida <= 0) throw new Error("tokens");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const CASOS_FILTRO: Array<[string, string, string, string]> = [
  // [descripción, entrada, tipo esperado, texto que debe quedar fuera]
  ["clave sk-", "mi clave sk-abcdefghijklmnop1234 va aquí", "clave", "sk-abcdefghijklmnop1234"],
  ["clave ghp_", "ghp_abcdefghijklmnopqrstu1234", "clave", "ghp_abcdefghijklmnopqrstu1234"],
  ["clave github_pat", "github_pat_11ABCDEF0abc", "clave", "11ABCDEF0abc"],
  ["clave AKIA", "AKIAABCDEFGHIJKLMNOP", "clave", "AKIAABCDEFGHIJKLMNOP"],
  ["clave slack", "xoxb-1234-abcd-efgh", "clave", "xoxb-1234"],
  ["clave JWT", "eyJhbGciOi.eyJzdWIiOiIx.firma_abc", "clave", "eyJhbGciOi"],
  ["clave api_key=", "api_key=hunter2supersecreto", "clave", "hunter2supersecreto"],
  ["correo", "escríbeme a felipe.v@ejemplo.cl hoy", "correo", "felipe.v@ejemplo.cl"],
  ["teléfono con prefijo", "llama al +56 9 1234 5678 ya", "telefono", "1234 5678"],
  ["teléfono pegado", "mi cel 912345678.", "telefono", "912345678"],
  ["RUT sin puntos", "rut 12345678-9 ok", "rut", "12345678-9"],
  ["RUT con puntos y K", "rut 12.345.678-K ok", "rut", "12.345.678-K"],
  ["ruta Users", "abrí /Users/felipevasquez/Documents/Proyectos/x y listo", "ruta", "felipevasquez"],
  ["ruta home Linux", "en /home/ana/proyecto/datos", "ruta", "/home/ana"],
  ["ruta ~", "ver ~/Documents/secreto", "ruta", "~/Documents"],
  ["ruta Windows", "en C:\\Users\\ana\\x", "ruta", "ana"],
  ["archivo", "revisé analisis_video.md antes", "archivo", "analisis_video"],
  ["enlace con token en query", "ver https://api.ejemplo.cl/v1?token=abc123 ahora", "enlace", "abc123"],
];

for (const [desc, entrada, tipo, fuera] of CASOS_FILTRO) {
  check(`filtro tapa ${desc}`, () => {
    const r = taparSensible(entrada, { home: "/Users/felipevasquez" });
    if (!r.tapados.some((x) => x.tipo === tipo)) throw new Error(`sin tipo ${tipo}: ${JSON.stringify(r)}`);
    if (r.texto.includes(fuera)) throw new Error("queda: " + r.texto);
    const otra = hallazgosSensibles(r.texto);
    if (otra.length) throw new Error("no idempotente: " + JSON.stringify(otra) + " en " + r.texto);
  });
}

check("filtro: tokens de reemplazo concretos", () => {
  const t = (s: string) => taparSensible(s).texto;
  if (t("12345678-9") !== "[rut]") throw new Error(t("12345678-9"));
  if (t("12.345.678-K") !== "[rut]") throw new Error(t("12.345.678-K"));
  if (t("/Users/felipevasquez/Documents/Proyectos/x") !== "[ruta]") throw new Error(t("/Users/felipevasquez/Documents/Proyectos/x"));
  if (t("analisis_video.md") !== "[archivo]") throw new Error(t("analisis_video.md"));
  if (t("https://api.ejemplo.cl/v1?token=abc123") !== "[enlace]") throw new Error(t("https://api.ejemplo.cl/v1?token=abc123"));
  if (t("+56 9 1234 5678") !== "[teléfono]") throw new Error(t("+56 9 1234 5678"));
});

check("filtro: dominio público queda solo como dominio", () => {
  const r = taparSensible("la canción: https://suno.com/s/oIoxXq2c?x=1 listo");
  if (r.texto !== "la canción: suno.com listo") throw new Error(r.texto);
  if (hallazgosSensibles(r.texto).length) throw new Error("no idempotente");
});

check("filtro: usa ctx.home para rutas", () => {
  const r = taparSensible("guardé en /Volumes/Disco/Mias/x.dat y en /srv/extra/y", { home: "/srv/extra" });
  if (r.texto.includes("/srv/extra")) throw new Error(r.texto);
  if (r.texto.includes("Disco") || r.texto.includes("Mias")) throw new Error("queda carpeta: " + r.texto);
});

check("filtro: texto limpio sale idéntico", () => {
  const t = "usé Claude y Blender";
  const r = taparSensible(t);
  if (r.texto !== t || r.tapados.length) throw new Error(JSON.stringify(r));
});

check("filtro: números normales de prosa no se confunden con RUT ni teléfono", () => {
  const t =
    "En 2026 usé Opus 5.5 a las 3 a.m., pagué $30 por la versión 1.2.3 y escribí 6.176 líneas, " +
    "con un tope de 1.048.576 filas el 01-11-2026; salieron 12 de 40 (30 %), 9 de 10 y 120.000 pesos.";
  const r = taparSensible(t);
  if (r.texto !== t || r.tapados.length) throw new Error(JSON.stringify(r.tapados));
  if (hallazgosSensibles(t).length) throw new Error("hallazgos en texto limpio");
});

check("filtro: imágenes propias ![](imagenes/x) no se tocan, otras sí", () => {
  const img = "![foto](imagenes/cuadro_1.png)";
  const r = taparSensible(img);
  if (r.tapados.length || r.texto !== img) throw new Error(JSON.stringify(r));
  if (hallazgosSensibles(img).length) throw new Error("hallazgos en imagen propia");
  const mala = taparSensible("![](/Users/felipevasquez/x.png) y ![](../x.png)", { home: "/Users/felipevasquez" });
  if (mala.texto.includes("felipevasquez") || mala.texto.includes("x.png")) throw new Error(mala.texto);
  const trampa = taparSensible("![a](imagenes/../secreto.png)");
  if (trampa.texto.includes("secreto")) throw new Error(trampa.texto);
});

check("filtro: rutas con espacios no dejan nombres de carpeta", () => {
  const home = "/Users/felipevasquez";
  const casos: Array<[string, string[]]> = [
    ["/Users/felipevasquez/Documents/Clientes/Banco Andino SpA/informe final.pdf", ["Andino", "Banco", "informe"]],
    ["cd ~/Documents/Proyecto Minera Escondida/datos", ["Minera", "Escondida"]],
    ["/Users/x/Documents/Mis_Proyectos/Proyecto Uno 1/Video/out/a.mp4", ["Proyecto", "Video", "a.mp4"]],
    ["C:\\Users\\Ana Perez\\Clientes\\x", ["Perez", "Clientes"]],
    ['abrí "/Users/x/Mis Clientes/Banco Andino/nota" y listo', ["Banco", "Clientes", "nota"]],
    ["en '/Volumes/Disco Externo/Obra Norte/v1' ok", ["Disco", "Obra", "Norte"]],
  ];
  for (const [entrada, prohibidos] of casos) {
    const r = taparSensible(entrada, { home });
    for (const x of prohibidos) if (r.texto.includes(x)) throw new Error(`queda ${x}: ${r.texto}`);
    if (!r.tapados.some((z) => z.tipo === "ruta")) throw new Error("sin ruta: " + r.texto);
    if (hallazgosSensibles(r.texto, { home }).length) throw new Error("no idempotente: " + r.texto);
  }
  if (taparSensible('abrí "/Users/x/Mis Clientes/Banco Andino/nota" y listo', { home }).texto !== "abrí [ruta] y listo")
    throw new Error("comillas");
});

check("filtro: herramientas públicas .js se nombran", () => {
  const t = "usé three.js y Node.js con Next.js, d3.js y React.js";
  const r = taparSensible(t);
  if (r.texto !== t || r.tapados.length) throw new Error(r.texto);
  if (taparSensible("abrí main.js").texto !== "abrí [archivo]") throw new Error("main.js");
});

check("filtro: otras rutas absolutas", () => {
  for (const e of ["/private/tmp/claude-501/x/y.txt", "/var/folders/ab/cd/T/z", "/opt/app/conf", "/srv/datos/c", "/Volumes/Disco/Mias/x"]) {
    const r = taparSensible(e);
    if (r.texto !== "[ruta]") throw new Error(`${e} -> ${r.texto}`);
  }
  const prosa = "usé y/o, 1/2 y and/or también";
  if (taparSensible(prosa).texto !== prosa) throw new Error("prosa con barras");
});

check("filtro: extensiones ampliadas", () => {
  for (const f of ["a.docx", "b.xlsx", "c.pptx", "d.txt", "e.jpeg", "f.mov", "g.html", "h.css", "i.yaml", "j.yml", "k.key", "l.numbers", "m.pages", "n.gif", "o.webp", "p.wav", "q.mp3", "r.zip", "s.ipynb", "t.tsv", "u.log"]) {
    const r = taparSensible("ver " + f);
    if (r.texto !== "ver [archivo]") throw new Error(f + " -> " + r.texto);
  }
});

check("filtro: teléfonos con paréntesis y guion", () => {
  for (const e of ["(+56) 9 1234-5678", "9 1234-5678", "+56 9 1234 5678", "56912345678"]) {
    const r = taparSensible("llama al " + e + " hoy");
    if (r.texto !== "llama al [teléfono] hoy") throw new Error(`${e} -> ${r.texto}`);
  }
});

check("filtro: Bearer, Google y clave entre comillas", () => {
  const casos = ["Authorization: Bearer abcdef1234567890xyz", "AIza" + "a".repeat(35), 'password = "mi clave larga"', "token: 'abc def'"];
  for (const e of casos) {
    const r = taparSensible(e);
    if (r.texto.includes("abc") || r.texto.includes("clave larga") || r.texto.includes("aaaa")) throw new Error(e + " -> " + r.texto);
    if (hallazgosSensibles(r.texto).length) throw new Error("no idempotente " + r.texto);
  }
});

check("filtro: dominios sin esquema", () => {
  const r = taparSensible("mira www.cliente.cl y github.com/acme/repo, también suno.com/s/abc y claude.ai");
  if (r.texto !== "mira [enlace] y [enlace], también suno.com y claude.ai") throw new Error(r.texto);
  if (hallazgosSensibles(r.texto).length) throw new Error("no idempotente");
  const limpio = "usé three.js, main.py y v1.2.3 en e.g. la nube.";
  if (taparSensible(limpio).texto !== "usé three.js, [archivo] y v1.2.3 en e.g. la nube.") throw new Error(taparSensible(limpio).texto);
});

check("filtro: hallazgosSensibles acepta ctx y NUL no rompe", () => {
  if (!hallazgosSensibles("en /srv/extra/y", { home: "/srv/extra" }).length) throw new Error("ctx");
  const r = taparSensible("a\u00000\u0000b \u0000");
  if (r.texto.includes("undefined") || r.texto.includes("\u0000")) throw new Error(JSON.stringify(r.texto));
});

check("filtro: rutas con espacios sin extensión y prosa que sigue", () => {
  const home = "/Users/felipevasquez";
  const f = (e: string) => taparSensible(e, { home }).texto;
  const fugas: Array<[string, string[]]> = [
    ["~/Documents/Banco Andino SpA", ["Andino", "SpA"]],
    ["C:\\Users\\Ana Perez\\Clientes\\Banco Andino SpA", ["Andino", "SpA", "Perez"]],
    ["abrí ~/Clientes/Minera Escondida y vi", ["Escondida", "Minera"]],
    ["/Users/felipevasquez/Documents/Clientes/Banco Andino SpA/informe final", ["Andino", "SpA"]],
  ];
  for (const [e, no] of fugas) {
    const r = f(e);
    for (const x of no) if (r.includes(x)) throw new Error(`queda ${x}: ${r}`);
    if (hallazgosSensibles(r, { home }).length) throw new Error("no idempotente: " + r);
  }
  const igual: Array<[string, string]> = [
    ["~/Documents/Banco Andino SpA", "[ruta]"],
    ["abrí ~/Clientes/Minera Escondida y vi", "abrí [ruta] y vi"],
    ["cd ~/a/b y luego abrí la carpeta 1/2 del proyecto", "cd [ruta] y luego abrí la carpeta 1/2 del proyecto"],
    ["Guardé en ~/Proyectos/video y después probé con y/o sin música", "Guardé en [ruta] y después probé con y/o sin música"],
    ["lo dejé en /Users/felipevasquez/x. Después usé la versión 2/3 del guion", "lo dejé en [ruta]. Después usé la versión 2/3 del guion"],
    ["Edité /opt/app/conf y luego el 50/50 de mezcla", "Edité [ruta] y luego el 50/50 de mezcla"],
  ];
  for (const [e, esperado] of igual) if (f(e) !== esperado) throw new Error(`${e} -> ${f(e)}`);
  const cd = f("cd /Users/felipevasquez/Documents/Claude/Carrusel && npm test luego vi que fallaba en la carpeta test/caso");
  if (!cd.startsWith("cd [ruta] && npm test luego vi que fallaba en la carpeta")) throw new Error(cd);
  if (f("AIza" + "a".repeat(40)) !== "[clave]") throw new Error("AIza largo");
});

check("carpeta y aprobación atada al hash de la historia", () => {
  const p = mkdtempSync(join(tmpdir(), "caso-"));
  try {
    const d = carpetaCaso(p);
    if (d !== join(p, "caso")) throw new Error(d);
    if (readFileSync(join(d, ".gitignore"), "utf8") !== "*\n") throw new Error("gitignore");
    for (const s of ["trabajo", "imagenes", "clips", "salida"]) if (!existsSync(join(d, s))) throw new Error("falta " + s);
    writeFileSync(join(d, ".gitignore"), "propio\n");
    // Un .gitignore ajeno ahora detiene carpetaCaso (T4), y sigue sin pisarse.
    let lanzo = false;
    try { carpetaCaso(p); } catch { lanzo = true; }
    if (!lanzo) throw new Error("aceptó un .gitignore distinto de *");
    if (readFileSync(join(d, ".gitignore"), "utf8") !== "propio\n") throw new Error("pisó .gitignore");
    writeFileSync(join(d, ".gitignore"), "*\n");
    if (estadoAprobacion(d) !== "sin-historia") throw new Error("sin-historia");
    writeFileSync(join(d, "historia.md"), "# Historia\n\nUna historia limpia.\n");
    if (estadoAprobacion(d) !== "sin-aprobar") throw new Error("sin-aprobar");
    aprobar(d);
    if (estadoAprobacion(d) !== "aprobada") throw new Error("aprobada");
    writeFileSync(join(d, "aprobado.json"), "{corrupto");
    if (estadoAprobacion(d) !== "sin-aprobar") throw new Error("corrupto");
    aprobar(d);
    writeFileSync(join(d, "historia.md"), "# Historia\n\nUna historia limpia!\n");
    if (estadoAprobacion(d) !== "editada") throw new Error("editada");
    rmSync(join(d, "aprobado.json"));
    writeFileSync(join(d, "historia.md"), "Escríbeme a juan.perez@empresa.cl\n");
    let msg = "";
    try { aprobar(d); } catch (e) { msg = (e as Error).message; }
    if (!msg) throw new Error("no lanzó");
    if (msg.includes("juan.perez@empresa.cl")) throw new Error("filtró el correo completo");
    if (!msg.includes("correo")) throw new Error("no menciona el tipo");
    if (existsSync(join(d, "aprobado.json"))) throw new Error("creó aprobado.json");
    rmSync(join(d, "historia.md"));
    let m2 = "";
    try { aprobar(d); } catch (e) { m2 = (e as Error).message; }
    if (!m2.startsWith("No hay historia.md en")) throw new Error("sin historia: " + m2);
  } finally { rmSync(p, { recursive: true, force: true }); }
});

check("historiaAHtml: quita secciones internas, escapa, filtra imágenes y firma sin Felipe", () => {
  // La imagen válida debe existir: sin archivo no hay <img> (I2).
  const d = mkdtempSync(join(tmpdir(), "caso-x-"));
  mkdirSync(join(d, "imagenes"));
  writeFileSync(join(d, "imagenes", "a.png"), "x");
  const md = [
    "# Mi caso", "", "Texto con <script>alert(1)</script> y **negrita**.", "",
    "![ok](imagenes/a.png)", "", "![mal](../../secreto.png)", "", "![web](http://x.cl/a.png)", "",
    "## Paso 1", "", "- uno", "- dos", "", "> detalle", "", "```", "prompt <b>", "```", "",
    "## Para Felipe: qué se tapó", "", "Felipe revisa esto", "", "## Paso 2", "", "1. a", "2. b", "",
  ].join("\n");
  const h = historiaAHtml(md, { dirCaso: d });
  if (h.includes("Para Felipe") || h.includes("qué se tapó")) throw new Error("sección interna");
  if (h.includes("<script>") || !h.includes("&lt;script&gt;")) throw new Error("sin escapar");
  if (h.includes("secreto") || h.includes("http://x.cl")) throw new Error("imagen fuera de imagenes");
  if (!h.includes("<img") || !h.includes("imagenes/a.png")) throw new Error("falta imagen válida");
  if (!h.includes("Paso 2") || !h.includes("<ol>") || !h.includes("<strong>")) throw new Error("conversión");
  if (!h.includes("@ia.punto.es")) throw new Error("sin firma");
  if (h.includes("Felipe")) throw new Error("aparece Felipe");
  rmSync(d, { recursive: true, force: true });
});

check("historiaAHtml: «Felipe» en prosa normal lanza error", () => {
  let msg = "";
  try { historiaAHtml("# T\n\nLo hizo Felipe solo.\n", { dirCaso: "/tmp/caso-x" }); } catch (e) { msg = (e as Error).message; }
  if (!msg.includes("Felipe")) throw new Error("no lanzó: " + msg);
});

check("historiaAHtml: ruta con felipe en dirCaso no dispara el error", () => {
  // Carpeta real con «felipe» en la ruta: la imagen debe existir para que haya <img> (I2).
  const d = mkdtempSync(join(tmpdir(), "felipevasquez-"));
  try {
    mkdirSync(join(d, "imagenes"));
    writeFileSync(join(d, "imagenes", "a.png"), "x");
    const h = historiaAHtml("# T\n\n![a](imagenes/a.png)\n", { dirCaso: d });
    if (!h.includes("<img") || !h.includes("felipevasquez-")) throw new Error("sin img");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("historiaAHtml: secciones internas a cualquier nivel", () => {
  const d = "/tmp/caso-x";
  const a = historiaAHtml("# T\n\n## Uno\n\nhola\n\n### Para Felipe: x\n\nsecreto interno\n\n### Otro\n\nvisible\n", { dirCaso: d });
  if (a.includes("secreto interno") || !a.includes("visible")) throw new Error("### interna");
  const b = historiaAHtml("# T\n\nhola\n\n## Para Felipe: x\n\nsecreto final\n", { dirCaso: d });
  if (b.includes("secreto final")) throw new Error("última sección");
  const c = historiaAHtml("## Para Felipe: x\n\nsecreto\n\n# Título nuevo\n\ntexto visible\n", { dirCaso: d });
  if (c.includes("secreto") || !c.includes("Título nuevo") || !c.includes("texto visible")) throw new Error("# tras ##");
  const e = historiaAHtml("## Para Felipe: x\n\nsecreto\n\n### sub interna\n\nsigue secreto2\n\n## Fin\n\nok\n", { dirCaso: d });
  if (e.includes("secreto2") || !e.includes("ok")) throw new Error("subsección interna");
});

check("historiaAHtml: symlink en imagenes/ hacia fuera no genera img", () => {
  const d = mkdtempSync(join(tmpdir(), "caso-sym-"));
  try {
    mkdirSync(join(d, "imagenes"));
    writeFileSync(join(d, "fuera.png"), "x");
    symlinkSync(join(d, "fuera.png"), join(d, "imagenes", "s.png"));
    writeFileSync(join(d, "imagenes", "ok.png"), "x");
    const h = historiaAHtml("# T\n\n![](imagenes/s.png)\n\n![](imagenes/ok.png)\n", { dirCaso: d });
    if (h.includes("s.png")) throw new Error("siguió el symlink");
    if (!h.includes("ok.png")) throw new Error("perdió la válida");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("historiaAHtml: alt con «src=» no evade la guarda de Felipe", () => {
  let msg = "";
  try {
    historiaAHtml("# T\n\n![x src=](imagenes/a.png)\n\nFelipe lo hizo\n\n![](imagenes/b.png)\n", { dirCaso: "/tmp/caso-x" });
  } catch (e) { msg = (e as Error).message; }
  if (!msg.includes("Felipe")) throw new Error("no lanzó: " + msg);
});

check("historiaAHtml: «Para Felipe» anidado en interna no reabre el contenido", () => {
  const h = historiaAHtml("# T\n\n## Para Felipe: x\n\n### Para Felipe: y\n\n### Otro\n\nINTERNO_Z\n\n## Público\n\nvisible\n", { dirCaso: "/tmp/caso-x" });
  if (h.includes("INTERNO_Z")) throw new Error("filtró contenido interno");
  if (!h.includes("Público")) throw new Error("perdió Público");
});

check("historiaAHtml: tres secciones «Para Felipe» consecutivas al final", () => {
  const h = historiaAHtml("# T\n\n## Paso\n\nvisible\n\n## Para Felipe: a\n\nINT_A\n\n## Para Felipe: b\n\nINT_B\n\n## Para Felipe: c\n\nINT_C\n", { dirCaso: "/tmp/caso-x" });
  if (/INT_[ABC]/.test(h) || !h.includes("visible")) throw new Error("filtró interno o perdió visible");
});

// --- Puerta de generar (offline: no abre Chromium ni ffmpeg) ---

/** Caso aprobado mínimo en un dir temporal; `borrador` se escribe tal cual en borrador.json. */
function casoAprobado(borrador: unknown): string {
  const d = mkdtempSync(join(tmpdir(), "caso-gen-"));
  for (const s of ["imagenes", "clips", "salida"]) mkdirSync(join(d, s));
  writeFileSync(join(d, "historia.md"), "# Cómo armé el reporte\n\n## Paso 1\n\nAbrí la planilla.\n");
  aprobar(d);
  writeFileSync(join(d, "borrador.json"), JSON.stringify(borrador));
  return d;
}
const BORRADOR_OK = {
  name: "Reporte en una tarde",
  pillar: "trabajo",
  slides: [
    { template: "Hook", props: { title: "Armé un reporte en una tarde" } },
    { template: "Step", props: { heading: "Pide la tabla primero", step: 1 } },
    { template: "Cta", props: { title: "Guárdalo para tu próximo reporte" } },
  ],
};
const conSlide = (s: unknown) => ({ ...BORRADOR_OK, slides: [...BORRADOR_OK.slides.slice(0, 2), s, BORRADOR_OK.slides[2]] });

check("puertaGenerar: caso válido no da motivos", () => {
  const d = casoAprobado(BORRADOR_OK);
  try {
    const m = puertaGenerar(d);
    if (m.length) throw new Error(m.join(" | "));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: sin aprobar da motivo", () => {
  const d = mkdtempSync(join(tmpdir(), "caso-gen-"));
  try {
    writeFileSync(join(d, "historia.md"), "# T\n");
    writeFileSync(join(d, "borrador.json"), JSON.stringify(BORRADOR_OK));
    const m = puertaGenerar(d);
    if (!m.some((x) => /aprobad/i.test(x))) throw new Error(JSON.stringify(m));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: falta borrador.json da motivo", () => {
  const d = casoAprobado(BORRADOR_OK);
  try {
    rmSync(join(d, "borrador.json"));
    if (!puertaGenerar(d).some((x) => x.includes("borrador.json"))) throw new Error("sin motivo");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: clave en el borrador da motivo con «clave» sin el valor completo", () => {
  const d = casoAprobado(conSlide({ template: "Step", props: { heading: "Usa sk-abcdefghijklmnop1234" } }));
  try {
    const m = puertaGenerar(d);
    if (!m.some((x) => x.includes("clave"))) throw new Error(JSON.stringify(m));
    if (m.some((x) => x.includes("sk-abcdefghijklmnop1234"))) throw new Error("filtró la clave");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: fondo image fuera de imagenes/ da motivo", () => {
  const d = casoAprobado(conSlide({ template: "Step", props: { heading: "Mira" }, background: { image: "/etc/x.png" } }));
  try {
    if (!puertaGenerar(d).some((x) => x.includes("imagenes/"))) throw new Error("sin motivo");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: fondo image dentro de imagenes/ es válido", () => {
  const d = casoAprobado(conSlide({ template: "Step", props: { heading: "Mira" }, background: { image: "imagenes/p.png", overlay: 0.4 } }));
  try {
    writeFileSync(join(d, "imagenes", "p.png"), "x");
    const m = puertaGenerar(d);
    if (m.length) throw new Error(m.join(" | "));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: Clip con archivo inexistente da motivo", () => {
  const d = casoAprobado(conSlide({ template: "Clip", props: { title: "Así se ve", archivo: "no-esta.mp4" } }));
  try {
    if (!puertaGenerar(d).some((x) => x.includes("no-esta.mp4"))) throw new Error("sin motivo");
    writeFileSync(join(d, "clips", "no-esta.mp4"), "x");
    const m = puertaGenerar(d);
    if (m.length) throw new Error("con el clip: " + m.join(" | "));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: «Felipe» en un texto del borrador da motivo", () => {
  const d = casoAprobado(conSlide({ template: "Step", props: { heading: "Lo que hizo FELIPE" } }));
  try {
    if (!puertaGenerar(d).some((x) => /Felipe/.test(x))) throw new Error("sin motivo");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: fondo ai da motivo (los casos no generan imágenes)", () => {
  const d = casoAprobado(conSlide({ template: "Step", props: { heading: "Mira" }, background: { ai: "x" } }));
  try {
    if (!puertaGenerar(d).some((x) => x.includes("sin fondos ai"))) throw new Error("sin motivo");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: hookVideo da motivo", () => {
  const d = casoAprobado({ ...BORRADOR_OK, hookVideo: { prompt: "A Chilean office worker opens a spreadsheet on a laptop, close up", segundos: 5 } });
  try {
    // hookVideo con forma válida (parseBorrador lo aceptaría): el motivo debe ser el propio de los casos.
    if (!puertaGenerar(d).some((x) => x.includes("no generan video IA"))) throw new Error("sin motivo");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar: clip symlink en clips/ que apunta fuera da motivo", () => {
  const d = casoAprobado(conSlide({ template: "Clip", props: { title: "Así se ve", archivo: "s.mp4" } }));
  try {
    writeFileSync(join(d, "fuera.mp4"), "x");
    symlinkSync(join(d, "fuera.mp4"), join(d, "clips", "s.mp4"));
    if (!puertaGenerar(d).some((x) => x.includes("s.mp4"))) throw new Error("siguió el symlink");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerarDe: rechaza una historia en memoria distinta de la aprobada", () => {
  const d = casoAprobado(BORRADOR_OK);
  try {
    const borrador = readFileSync(join(d, "borrador.json"), "utf8");
    const ok = puertaGenerarDe(d, { historia: readFileSync(join(d, "historia.md"), "utf8"), borrador });
    if (ok.length) throw new Error("la aprobada da motivos: " + ok.join(" | "));
    const m = puertaGenerarDe(d, { historia: "# Otra historia\n", borrador });
    if (!m.some((x) => /aprobad/i.test(x))) throw new Error(JSON.stringify(m));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("dentroDeCaso solo acepta archivos reales dentro de <proyecto>/caso/", () => {
  const d = mkdtempSync(join(tmpdir(), "caso-tapar-"));
  try {
    const caso = carpetaCaso(join(d, "proy"));
    writeFileSync(join(caso, "historia.md"), "x");
    writeFileSync(join(d, "proy", "notas.md"), "x");
    mkdirSync(join(d, "proy", "casos"));
    writeFileSync(join(d, "proy", "casos", "h.md"), "x");
    symlinkSync(join(d, "proy", "notas.md"), join(caso, "enlace.md"));
    if (!dentroDeCaso(join(caso, "historia.md"))) throw new Error("rechaza caso/historia.md");
    if (!dentroDeCaso(join(caso, "trabajo", "..", "historia.md"))) throw new Error("rechaza ruta con ..");
    for (const [ruta, que] of [
      [join(d, "proy", "notas.md"), "archivo fuera de caso/"],
      [join(d, "proy", "casos", "h.md"), "carpeta casos/"],
      [caso, "la carpeta caso misma"],
      [join(caso, "no-existe.md"), "archivo inexistente"],
      [join(caso, "enlace.md"), "enlace que apunta fuera"],
      [join(caso, "..", "notas.md"), "salida con .."],
    ] as const) if (dentroDeCaso(ruta)) throw new Error("acepta " + que);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("dentroDeCaso: decide la carpeta caso más cercana y solo con la marca de carpetaCaso", () => {
  const d = mkdtempSync(join(tmpdir(), "caso-marca-"));
  try {
    // Proyecto que se llama literalmente «caso», sin marca: su código no es una carpeta de caso.
    mkdirSync(join(d, "caso", "src"), { recursive: true });
    writeFileSync(join(d, "caso", "src", "a.ts"), "x");
    if (dentroDeCaso(join(d, "caso", "src", "a.ts"))) throw new Error("acepta caso/src/a.ts sin marca");
    // Su carpeta de caso real (con marca) sí cuenta, aunque el proyecto se llame caso.
    const interna = carpetaCaso(join(d, "caso"));
    writeFileSync(join(interna, "historia.md"), "x");
    if (!dentroDeCaso(join(interna, "historia.md"))) throw new Error("rechaza caso/caso/historia.md con marca");
    if (dentroDeCaso(join(d, "caso", "src", "a.ts"))) throw new Error("acepta caso/src/a.ts con una caso/ interna");
    // proyecto/caso/historia.md con marca → sí.
    const caso = carpetaCaso(join(d, "proyecto"));
    writeFileSync(join(caso, "historia.md"), "x");
    if (!dentroDeCaso(join(caso, "historia.md"))) throw new Error("rechaza proyecto/caso/historia.md");
    // Carpeta madre llamada caso sin marca, con una carpeta de caso más arriba: decide la más cercana.
    mkdirSync(join(caso, "otro", "caso"), { recursive: true });
    writeFileSync(join(caso, "otro", "caso", "b.md"), "x");
    if (dentroDeCaso(join(caso, "otro", "caso", "b.md"))) throw new Error("acepta caso/ sin marca bajo una con marca");
    // Marca con otro contenido → no.
    mkdirSync(join(d, "p2", "caso"), { recursive: true });
    writeFileSync(join(d, "p2", "caso", ".gitignore"), "node_modules\n");
    writeFileSync(join(d, "p2", "caso", "h.md"), "x");
    if (dentroDeCaso(join(d, "p2", "caso", "h.md"))) throw new Error("acepta .gitignore distinto de *");
    // micaso/ → no.
    mkdirSync(join(d, "p3", "micaso"), { recursive: true });
    writeFileSync(join(d, "p3", "micaso", ".gitignore"), "*\n");
    writeFileSync(join(d, "p3", "micaso", "h.md"), "x");
    if (dentroDeCaso(join(d, "p3", "micaso", "h.md"))) throw new Error("acepta micaso/");
    // Enlace desde caso/ hacia afuera → no.
    writeFileSync(join(d, "afuera.md"), "x");
    symlinkSync(join(d, "afuera.md"), join(caso, "enlace-afuera.md"));
    if (dentroDeCaso(join(caso, "enlace-afuera.md"))) throw new Error("acepta enlace que apunta fuera");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("skills/caso/borrador-ejemplo.json pasa parseBorrador y la puerta de /caso", () => {
  const texto = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../skills/caso/borrador-ejemplo.json"), "utf8");
  const b = parseBorrador(texto);
  if (b.slides.length < 3) throw new Error("slides " + b.slides.length);
  const d = casoAprobado(JSON.parse(texto));
  try {
    const m = puertaGenerar(d);
    if (m.length) throw new Error("la puerta da motivos: " + m.join(" | "));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

await checkAsync("generarCaso: historia editada tras aprobar lanza sin escribir caso.pdf", async () => {
  const d = casoAprobado(BORRADOR_OK);
  try {
    writeFileSync(join(d, "historia.md"), "# Cómo armé el reporte\n\nCambié algo.\n");
    let msg = "";
    try { await generarCaso(d); } catch (e) { msg = (e as Error).message; }
    if (!msg) throw new Error("no lanzó");
    if (existsSync(join(d, "caso.pdf"))) throw new Error("escribió caso.pdf");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// --- Revisión final de la rama (I1, I2, T4, M1-M6, T7) ---

check("filtro I1: colas tras [ruta] y rutas relativas no dejan nombres de carpeta", () => {
  const home = "/Users/felipevasquez";
  const casos: Array<[string, string[]]> = [
    ["~/Clientes/banco andino/Contrato Secreto/plan", ["banco", "andino", "Contrato", "Secreto", "plan"]],
    ["~/Clientes/Banco  Andino/plan", ["Banco", "Andino", "plan"]],
    ["~/Clientes/Banco\tAndino/plan", ["Banco", "Andino", "plan"]],
    ["C:\\Users\\x\\banco andino\\plan", ["banco", "andino", "plan"]],
    ["en Clientes/Banco Andino/plan.md", ["Clientes", "Banco", "Andino", "plan"]],
    ["./clientes/banco-andino/plan", ["clientes", "banco", "andino", "plan"]],
    ["../banco-andino/plan", ["banco", "andino", "plan"]],
    ["$HOME/Clientes/Andino", ["Clientes", "Andino"]],
    ["%USERPROFILE%\\Clientes\\Andino", ["Clientes", "Andino"]],
  ];
  for (const [e, no] of casos) {
    if (!hallazgosSensibles(e, { home }).some((h) => h.tipo === "ruta")) throw new Error("hallazgos no ve la ruta: " + e);
    const r = taparSensible(e, { home });
    for (const x of no) if (r.texto.includes(x)) throw new Error(`queda ${x}: ${JSON.stringify(e)} -> ${JSON.stringify(r.texto)}`);
    if (!r.tapados.some((z) => z.tipo === "ruta")) throw new Error("sin ruta: " + r.texto);
    const otra = hallazgosSensibles(r.texto, { home });
    if (otra.length) throw new Error("no idempotente: " + JSON.stringify(otra) + " en " + r.texto);
  }
  if (taparSensible("en Clientes/Banco Andino/plan.md", { home }).texto !== "en [ruta]") throw new Error("relativa");
  // Un solo separador en prosa no es una ruta.
  const prosa = "la versión 2/3, y/o, 24/7, un test A/B y el formato carrusel/reel";
  const r = taparSensible(prosa, { home });
  if (r.texto !== prosa || r.tapados.length) throw new Error(r.texto);
});

check("filtro I2: el alt de una imagen propia pasa por el filtro; el destino imagenes/ se protege", () => {
  const md = "![correo juan.perez@empresa.cl](imagenes/a.png)";
  if (!hallazgosSensibles(md).some((h) => h.tipo === "correo")) throw new Error("no ve el correo del alt");
  const r = taparSensible(md);
  if (r.texto.includes("juan.perez")) throw new Error(r.texto);
  if (!r.texto.endsWith("(imagenes/a.png)")) throw new Error("tocó el destino: " + r.texto);
  if (hallazgosSensibles(r.texto).length) throw new Error("no idempotente: " + r.texto);
  const ruta = taparSensible("![~/Clientes/Banco Andino/plan](imagenes/b.png)", { home: "/Users/x" }).texto;
  if (ruta.includes("Andino")) throw new Error(ruta);
});

check("historiaAHtml I2: alt vacío y sin <img> si la imagen no existe", () => {
  const d = mkdtempSync(join(tmpdir(), "caso-alt-"));
  try {
    mkdirSync(join(d, "imagenes"));
    writeFileSync(join(d, "imagenes", "ok.png"), "x");
    const h = historiaAHtml("# T\n\n![texto ALT_SECRETO](imagenes/ok.png)\n\n![otro ALT_FALTA](imagenes/no-esta.png)\n", { dirCaso: d });
    if (h.includes("ALT_SECRETO") || h.includes("ALT_FALTA")) throw new Error("el alt llegó al HTML");
    if (!h.includes('alt=""')) throw new Error("sin alt vacío");
    if (h.includes("no-esta.png")) throw new Error("emitió <img> de una imagen que no existe");
    if ((h.match(/<img/g) ?? []).length !== 1) throw new Error("cantidad de img");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("carpetaCaso T4: lanza si caso/.gitignore existe y no es «*»", () => {
  const p = mkdtempSync(join(tmpdir(), "caso-gi-"));
  try {
    mkdirSync(join(p, "caso"));
    writeFileSync(join(p, "caso", ".gitignore"), "node_modules\n");
    let msg = "";
    try { carpetaCaso(p); } catch (e) { msg = (e as Error).message; }
    if (!msg.includes(".gitignore")) throw new Error("no lanzó: " + msg);
    if (readFileSync(join(p, "caso", ".gitignore"), "utf8") !== "node_modules\n") throw new Error("pisó .gitignore");
    writeFileSync(join(p, "caso", ".gitignore"), "  *  \n");
    carpetaCaso(p);
  } finally { rmSync(p, { recursive: true, force: true }); }
});

check("filtro M1: Stripe, Authorization Basic, URL con cualquier esquema y teléfonos fijos", () => {
  const casos: Array<[string, string, string]> = [
    ["usa sk_live_" + "a".repeat(24) + " ya", "clave", "aaaa"],
    ["usa rk_test_" + "b".repeat(20) + " ya", "clave", "bbbb"],
    ["Authorization: Basic dXNlcjpwYXNzd29yZA==", "clave", "dXNlcjpw"],
    ["conecta a postgres://user:pass@host:5432/db hoy", "enlace", "pass@host"],
    ["llama al 22 345 6789 hoy", "telefono", "345 6789"],
    ["llama al +56 2 2345 6789 hoy", "telefono", "2345 6789"],
  ];
  for (const [e, tipo, fuera] of casos) {
    const r = taparSensible(e);
    if (!r.tapados.some((x) => x.tipo === tipo)) throw new Error(`sin ${tipo}: ${e} -> ${r.texto}`);
    if (r.texto.includes(fuera)) throw new Error("queda: " + r.texto);
    if (hallazgosSensibles(r.texto).length) throw new Error("no idempotente: " + r.texto);
  }
  if (taparSensible("conecta a postgres://user:pass@host:5432/db hoy").texto !== "conecta a [enlace] hoy") throw new Error("postgres");
  const prosa = "Hice 22 pruebas con 345 líneas, el plan Basic de 2 personas y 120.000 pesos en 2026.";
  if (taparSensible(prosa).texto !== prosa) throw new Error(taparSensible(prosa).texto);
});

check("puertaGenerar M2: historia aprobada con un filtro más laxo se invalida", () => {
  const d = casoAprobado(BORRADOR_OK);
  try {
    const historia = "# Cómo armé el reporte\n\nGuardé todo en ~/Clientes/banco andino/Contrato Secreto/plan\n";
    writeFileSync(join(d, "historia.md"), historia);
    writeFileSync(join(d, "aprobado.json"), JSON.stringify({ hash: hashHistoria(historia) }));
    const m = puertaGenerar(d);
    const motivo = m.find((x) => x.includes("historia") && x.includes("ruta"));
    if (!motivo) throw new Error(JSON.stringify(m));
    if (motivo.includes("Secreto") || motivo.includes("andino")) throw new Error("filtró el valor: " + motivo);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

check("puertaGenerar M3: image o archivo fuera de su lugar sí se revisan", () => {
  const anidado = casoAprobado(conSlide({ template: "Step", props: { heading: "Mira", foo: { image: "juan.perez@empresa.cl" } } }));
  const arriba = casoAprobado({ ...BORRADOR_OK, archivo: "juan.perez@empresa.cl" });
  const audio = casoAprobado(conSlide({ template: "Step", props: { heading: "Mira", audio: "juan.perez@empresa.cl" } }));
  try {
    for (const d of [anidado, arriba, audio])
      if (!puertaGenerar(d).some((x) => x.includes("correo"))) throw new Error("no revisó: " + JSON.stringify(puertaGenerar(d)));
  } finally { for (const d of [anidado, arriba, audio]) rmSync(d, { recursive: true, force: true }); }
});

check("skills/caso/historia-plantilla.md no tiene hallazgos sensibles", () => {
  const texto = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../skills/caso/historia-plantilla.md"), "utf8");
  const h = hallazgosSensibles(texto);
  if (h.length) throw new Error(JSON.stringify(h));
});

check("historiaAHtml M6: encabezados #### a ######", () => {
  const h = historiaAHtml("# T\n\n#### Cuatro\n\n##### Cinco\n\n###### Seis\n\ntexto\n", { dirCaso: "/tmp/caso-x" });
  for (const n of [4, 5, 6]) if (!h.includes(`<h${n}>`)) throw new Error("falta h" + n);
  if (h.includes("####")) throw new Error("quedó el marcador");
});

check("lineaCarpetas T7: la línea de carpetas de `sesiones` pasa por el filtro", () => {
  const s = { archivosTocados: ["/p/juan.perez@empresa.cl/a.md", "/p/src/b.ts"] } as unknown as SesionResumen;
  const l = lineaCarpetas(s, "/p");
  if (!l || l.includes("juan.perez")) throw new Error(String(l));
  if (!l.startsWith("carpetas: ") || !l.includes("src (1)")) throw new Error(l);
  if (lineaCarpetas({ archivosTocados: [] } as unknown as SesionResumen, "/p") !== null) throw new Error("vacía");
});

await done();
