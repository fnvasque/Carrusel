import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check } from "../_check.ts";
import {
  DESDE_ENTENDER,
  ritmoVigente,
  segundosEscenas,
  duracionReel,
  erroresDeRetencion,
  erroresDeGuion,
  leerBanco,
  erroresDeMomento,
  seccionDelLector,
  validarSemana,
} from "../../kb-plantilla/_calendario/validar.mjs";
import { causaDeDuda, causasDeFallo } from "../../src/calendario/lector-causas.ts";

/**
 * Piezas que se entienden (spec docs/superpowers/specs/2026-10-31-piezas-que-se-entienden-design.md):
 * ritmo vigente sin voz, narración que no alarga sin voz, guion por pieza, banco
 * momento × capacidad, pregunta 9 del lector frío y causa `sin-hilo`.
 */

const DIR = "kb-plantilla/_calendario";
const CONFIG = JSON.parse(readFileSync(join(DIR, "config.json"), "utf8"));
const conVoz = (voz: unknown) => ({ ...CONFIG, voz, puerta: { ...CONFIG.puerta, ritmoReel: { valor: "gancho", respaldo: "base" } } });
const has = (errs: string[], re: RegExp) => errs.some((e) => re.test(e));

const slides = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    template: i === 0 ? "Hook" : "Lead",
    props: i === 0 ? { title: "Tu informe en audio" } : { text: "Una escena corta" },
    narracion: "Esta es una narración bastante larga que dura mucho más que el texto corto de la escena en pantalla.",
  }));

// --- 4c: ritmo vigente ---

check("entender: ritmoVigente — sin voz es ensenar; con voz (o voz sin definir) es el de la puerta", () => {
  assert.equal(ritmoVigente(conVoz(false)), "ensenar");
  assert.equal(ritmoVigente(conVoz("em_alex")), "gancho");
  assert.equal(ritmoVigente(conVoz(undefined)), "gancho");
});

check("entender: en el paquete sin voz el pace vigente es ensenar (gancho se rechaza); con voz sigue la puerta", () => {
  const pieza = { formato: "reel", dia: "2026-11-02", parametros: {} };
  const cfg = { ...conVoz(false), paquete: { desde: "2026-11-02", semanas: ["2026-11-02", "2026-11-09"], motivo: "paquete pivote-coaching" } };
  const b = (pace: string) => ({ pace, slides: slides(3) });
  assert.ok(!has(erroresDeRetencion(b("ensenar"), pieza, cfg), /pace/));
  assert.ok(has(erroresDeRetencion(b("gancho"), pieza, cfg), /ensenar/));
  const cfgVoz = { ...cfg, voz: "em_alex" };
  assert.ok(has(erroresDeRetencion(b("ensenar"), pieza, cfgVoz), /gancho/));
  assert.ok(!has(erroresDeRetencion(b("gancho"), pieza, cfgVoz), /pace/));
});

check("entender: sin voz, fuera del paquete, un reel en gancho se rechaza aunque parametros.ritmoReel diga gancho", () => {
  const pieza = { formato: "reel", dia: "2026-11-17", parametros: { ritmoReel: "gancho" } };
  const b = { pace: "gancho", slides: slides(3) };
  assert.ok(has(erroresDeRetencion(b, pieza, conVoz(false)), /sin voz.*ensenar/));
  assert.ok(!has(erroresDeRetencion(b, pieza, conVoz("em_alex")), /sin voz/));
});

check("entender: --self-test pasa con la base sin voz (config.voz false), como la viva", () => {
  const raiz = mkdtempSync(join(tmpdir(), "entender-cli-"));
  try {
    mkdirSync(join(raiz, "_calendario"), { recursive: true });
    copyFileSync(join(DIR, "validar.mjs"), join(raiz, "_calendario", "validar.mjs"));
    writeFileSync(join(raiz, "_calendario", "config.json"), JSON.stringify({ ...CONFIG, voz: false }));
    const out = execFileSync("node", [join(raiz, "_calendario", "validar.mjs"), "--self-test"], { encoding: "utf8", env: { ...process.env, CARRUSEL_DIR: join(raiz, "nada") } });
    assert.match(out, /Autoprueba del calendario/);
    assert.match(out, /sin voz los reels van en ensenar/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

// --- 4d: narración sin voz ---

check("entender: sin voz la narración no alarga las escenas; con voz sí", () => {
  const s = slides(3);
  const sinVoz = segundosEscenas(s, "ensenar", false);
  const conVozD = segundosEscenas(s, "ensenar", true);
  assert.ok(conVozD[1] > sinVoz[1], `con voz ${conVozD[1]} debería superar sin voz ${sinVoz[1]}`);
  assert.deepEqual(segundosEscenas(s, "ensenar"), conVozD, "por defecto se comporta como con voz");
  const b = { pace: "ensenar", slides: s };
  assert.ok(duracionReel(b, { voz: false }) < duracionReel(b), "sin voz el reel dura menos");
  assert.equal(duracionReel(b, { voz: "em_alex" }), duracionReel(b));
});

// --- guion ---

const piezaGuion = (over: Record<string, unknown> = {}) => ({ dia: DESDE_ENTENDER, formato: "reel", ...over });
const b4 = { slides: slides(4) };

check("entender: guion — desde DESDE_ENTENDER es obligatorio, uno por slide, de 2 a 20 palabras", () => {
  assert.equal(DESDE_ENTENDER, "2026-11-09");
  const guion = ["el problema: no sabe qué pedirle", "copia este mensaje", "respóndele como a un colega", "escríbeme PARTIR"];
  assert.deepEqual(erroresDeGuion(piezaGuion({ guion }), b4), []);
  assert.ok(has(erroresDeGuion(piezaGuion(), b4), /falta guion/));
  assert.ok(has(erroresDeGuion(piezaGuion({ guion: guion.slice(0, 3) }), b4), /3.*4|4.*3/));
  assert.ok(has(erroresDeGuion(piezaGuion({ guion: [...guion.slice(0, 3), "PARTIR"] }), b4), /guion\[4\]/));
  const largo = Array.from({ length: 21 }, () => "palabra").join(" ");
  assert.ok(has(erroresDeGuion(piezaGuion({ guion: [...guion.slice(0, 3), largo] }), b4), /guion\[4\]/));
  assert.deepEqual(erroresDeGuion(piezaGuion({ dia: "2026-11-02" }), b4), [], "antes de DESDE_ENTENDER no se exige");
});

// --- banco momento × capacidad ---

const BANCO_MD = readFileSync(join(DIR, "momentos.md"), "utf8");
const banco = leerBanco(BANCO_MD);
const piezaMomento = (over: Record<string, unknown> = {}) => ({
  id: "lun-reel-x",
  dia: "2026-11-09",
  serie: "por-donde-partir",
  momento: "leer-documento-largo",
  capacidad: "texto-a-audio",
  origen: { fichas: [], referencias: ["referencias/notebooklm.md"] },
  ...over,
});

check("entender: leerBanco — la semilla trae 12 momentos y 8 capacidades, 3 sin respaldo", () => {
  assert.equal(banco.momentos.size, 12);
  assert.equal(banco.capacidades.size, 8);
  assert.deepEqual([...banco.capacidades].filter(([, r]) => r.length === 0).map(([id]) => id).sort(), ["buscar-con-fuentes", "hacer-imagenes", "hacer-videos"]);
  assert.deepEqual(banco.capacidades.get("texto-a-audio"), ["referencias/notebooklm.md"]);
});

check("entender: momento y capacidad — existen, la capacidad tiene respaldo citado en origen y no se repite en 4 semanas", () => {
  assert.deepEqual(erroresDeMomento(piezaMomento(), banco, []), []);
  assert.ok(has(erroresDeMomento(piezaMomento({ momento: undefined }), banco, []), /falta momento/));
  assert.ok(has(erroresDeMomento(piezaMomento({ momento: "bailar" }), banco, []), /momento "bailar"/));
  assert.ok(has(erroresDeMomento(piezaMomento({ capacidad: "hacer-videos" }), banco, []), /sin respaldo/));
  assert.ok(has(erroresDeMomento(piezaMomento({ origen: { fichas: [], referencias: ["referencias/otra.md"] } }), banco, []), /notebooklm/));
  const previa = (semana: string) => [{ semana, piezas: [{ id: "lun-reel-y", momento: "leer-documento-largo", capacidad: "texto-a-audio" }] }];
  assert.ok(has(erroresDeMomento(piezaMomento(), banco, previa("2026-10-12")), /lun-reel-y/), "a 28 días se repite");
  assert.deepEqual(erroresDeMomento(piezaMomento(), banco, previa("2026-10-05")), [], "a 35 días ya vale");
  assert.deepEqual(erroresDeMomento(piezaMomento(), banco, [{ semana: "2026-10-26", piezas: "roto" }] as any), [], "un plan previo roto se ignora");
});

check("entender: momento — lo-que-construi y semanas anteriores a DESDE_ENTENDER no lo exigen; sin banco hay error claro", () => {
  assert.deepEqual(erroresDeMomento(piezaMomento({ serie: "lo-que-construi", momento: undefined, capacidad: undefined }), banco, []), []);
  assert.deepEqual(erroresDeMomento(piezaMomento({ dia: "2026-11-02", momento: undefined }), banco, []), []);
  assert.ok(has(erroresDeMomento(piezaMomento(), undefined, []), /momentos\.md.*kb-calendario-install/));
});

check("entender: validarSemana — dos piezas con la misma combinación en la semana se rechazan", () => {
  const raiz = mkdtempSync(join(tmpdir(), "entender-"));
  try {
    mkdirSync(join(raiz, "_calendario", "2026-11-09"), { recursive: true });
    writeFileSync(join(raiz, "_calendario", "momentos.md"), BANCO_MD);
    const semana = join(raiz, "_calendario", "2026-11-09");
    const p = (id: string) => ({ ...piezaMomento({ id, borrador: `${id}.json` }) });
    writeFileSync(join(semana, "plan.json"), JSON.stringify({ semana: "2026-11-09", piezas: [p("lun-reel-a"), p("vie-carrusel-b")] }));
    const errs: string[] = validarSemana(semana, CONFIG, { raiz });
    assert.ok(has(errs, /combinación.*se repite|repite/), JSON.stringify(errs.filter((e) => /momento|capacidad|combin/.test(e))));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

// --- lector frío: pregunta 9 y causa sin-hilo ---

check("entender: el mensaje del lector trae la pregunta 9 y el JSON con la clave 9", () => {
  const seccion = seccionDelLector(readFileSync(join(DIR, "lector-frio.md"), "utf8")) ?? "";
  assert.ok(seccion.includes("9. Cuéntaselo en dos frases"), "falta la pregunta 9");
  assert.ok(/"9": "\.\.\."/.test(seccion), "el JSON de respuesta debe traer la clave 9");
});

check("entender: lector-causas — una falla de la P9 cuenta como sin-hilo", () => {
  assert.ok(causasDeFallo("el completo no supo qué haría primero (P9)").includes("sin-hilo"));
  assert.ok(causasDeFallo("en la 9 contó otra cosa que la frase de amigo").includes("sin-hilo"));
  // La P9 no tiene causas propias por pregunta (el con prisa no bloquea): sus NB quedan en «otro».
  assert.equal(causaDeDuda(9, "no me quedó claro qué hacer primero"), "otro");
});
