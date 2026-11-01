import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkAsync, check, done } from "./_check.ts";
import { ELEVENLABS_MODELO_DEFECTO, enCacheVoz, narrarEscenas, proveedorVoz, rutaCacheVoz, sintetizar, wavDePcm, type ProveedorVoz } from "../src/reel/voz.ts";

/**
 * Proveedor ElevenLabs de la narración (spec 2026-10-28-voz-elevenlabs), sin red:
 * `fetch` simulado. Comprueba la configuración, la petición, el WAV, la caché por
 * proveedor + voz + texto, que la clave no salga en errores y el respaldo a Kokoro.
 * Uso: npm test
 */

const CLAVE = "sk_test_clave_secreta_123";
const P: ProveedorVoz = { tipo: "elevenlabs", apiKey: CLAVE, voiceId: "voz-clon-1", modelo: ELEVENLABS_MODELO_DEFECTO };

const dir = await mkdtemp(join(tmpdir(), "carrusel-voz-el-"));
process.env.CARRUSEL_VOZ_CACHE_DIR = dir;

interface Llamada {
  url: string;
  init: RequestInit;
}
const llamadas: Llamada[] = [];
const fetchReal = globalThis.fetch;
/** Responde `segundos` de PCM 24 kHz mono (o el status dado) y registra la llamada. */
function simular(r: { segundos?: number; status?: number; cuerpo?: string } = {}): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    if (r.status && r.status !== 200) return new Response(r.cuerpo ?? "error", { status: r.status });
    return new Response(new Uint8Array(Math.round((r.segundos ?? 1.5) * 48_000)), { status: 200 });
  }) as typeof fetch;
}

check("proveedorVoz: Kokoro por defecto; ElevenLabs con clave y voice_id; sin un dato cae a Kokoro; nombre inválido lanza", () => {
  assert.deepEqual(proveedorVoz({}), { tipo: "kokoro" });
  assert.deepEqual(proveedorVoz({ VOZ_PROVEEDOR: "kokoro", ELEVENLABS_API_KEY: "x" }), { tipo: "kokoro" });
  assert.deepEqual(proveedorVoz({ VOZ_PROVEEDOR: "ElevenLabs", ELEVENLABS_API_KEY: " k ", ELEVENLABS_VOICE_ID: "v" }), {
    tipo: "elevenlabs",
    apiKey: "k",
    voiceId: "v",
    modelo: ELEVENLABS_MODELO_DEFECTO,
  });
  assert.equal((proveedorVoz({ VOZ_PROVEEDOR: "elevenlabs", ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v", ELEVENLABS_MODEL: "eleven_v3" }) as { modelo: string }).modelo, "eleven_v3");
  assert.deepEqual(proveedorVoz({ VOZ_PROVEEDOR: "elevenlabs", ELEVENLABS_API_KEY: "k" }), { tipo: "kokoro" });
  assert.deepEqual(proveedorVoz({ VOZ_PROVEEDOR: "elevenlabs", ELEVENLABS_VOICE_ID: "v" }), { tipo: "kokoro" });
  assert.throws(() => proveedorVoz({ VOZ_PROVEEDOR: "openai" }), /kokoro o elevenlabs/);
});

check("rutaCacheVoz: Kokoro conserva su clave; ElevenLabs cambia con la voz, el modelo y la velocidad, no con la clave", () => {
  const k = rutaCacheVoz("Hola mundo", "em_alex", 1);
  assert.equal(rutaCacheVoz("  Hola   mundo ", "em_alex", 1, { tipo: "kokoro" }).wav, k.wav, "mismo texto limpio, misma clave de Kokoro");
  const e = rutaCacheVoz("Hola mundo", "em_alex", 1, P);
  assert.notEqual(e.wav, k.wav);
  assert.equal(rutaCacheVoz("Hola mundo", "ef_dora", 1, P).wav, e.wav, "la voz de Kokoro no cambia la de ElevenLabs");
  assert.equal(rutaCacheVoz("Hola mundo", "em_alex", 1, { ...P, apiKey: "otra" }).wav, e.wav, "la clave no entra en la caché");
  assert.notEqual(rutaCacheVoz("Hola mundo", "em_alex", 1, { ...P, voiceId: "otra-voz" }).wav, e.wav);
  assert.notEqual(rutaCacheVoz("Hola mundo", "em_alex", 1, { ...P, modelo: "eleven_v3" }).wav, e.wav);
  assert.notEqual(rutaCacheVoz("Hola mundo", "em_alex", 1.1, P).wav, e.wav);
});

check("wavDePcm: cabecera WAV de 44 bytes, PCM mono 16 bit a 24 kHz", () => {
  const w = wavDePcm(Buffer.alloc(4800));
  assert.equal(w.length, 44 + 4800);
  assert.equal(w.toString("ascii", 0, 4), "RIFF");
  assert.equal(w.toString("ascii", 8, 12), "WAVE");
  assert.equal(w.readUInt32LE(4), 36 + 4800);
  assert.equal(w.readUInt16LE(22), 1, "mono");
  assert.equal(w.readUInt32LE(24), 24_000);
  assert.equal(w.readUInt32LE(28), 48_000);
  assert.equal(w.readUInt16LE(34), 16);
  assert.equal(w.readUInt32LE(40), 4800);
});

await checkAsync("sintetizar con ElevenLabs: una petición bien formada, WAV en la caché, y la segunda vez no paga", async () => {
  llamadas.length = 0;
  simular({ segundos: 2.5 });
  const n = await sintetizar("  Esto lo dice   mi voz. ", "em_alex", { proveedor: P });
  assert.equal(llamadas.length, 1);
  const { url, init } = llamadas[0];
  assert.equal(url, "https://api.elevenlabs.io/v1/text-to-speech/voz-clon-1?output_format=pcm_24000");
  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>)["xi-api-key"], CLAVE);
  const body = JSON.parse(String(init.body));
  assert.deepEqual(body, { text: "Esto lo dice mi voz.", model_id: ELEVENLABS_MODELO_DEFECTO, language_code: "es", voice_settings: { speed: 1 } });
  assert.ok(init.signal, "con timeout");
  assert.equal(n.segundos, 2.5);
  assert.equal(n.proveedor, "elevenlabs");
  assert.equal(n.path, rutaCacheVoz("Esto lo dice mi voz.", "em_alex", 1, P).wav);
  const wav = readFileSync(n.path);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.length, 44 + 2.5 * 48_000);
  const meta = readFileSync(rutaCacheVoz("Esto lo dice mi voz.", "em_alex", 1, P).meta, "utf8");
  assert.ok(!meta.includes(CLAVE), "la clave no va a los metadatos");
  assert.ok(!existsSync(`${n.path}.tmp.wav`), "sin temporales");

  const otra = await sintetizar("Esto lo dice mi voz.", "ef_dora", { proveedor: { ...P, apiKey: "rotada" } });
  assert.equal(llamadas.length, 1, "de la caché: no vuelve a llamar");
  assert.equal(otra.path, n.path);
  assert.equal(enCacheVoz("Esto lo dice mi voz.", "em_alex", 1, P), true);
  assert.equal(enCacheVoz("Esto lo dice mi voz.", "em_alex", 1, { ...P, voiceId: "otra" }), false);
  assert.equal(enCacheVoz("Esto lo dice mi voz.", "em_alex", 1, { tipo: "kokoro" }), false, "la caché de ElevenLabs no cuenta para Kokoro");
});

await checkAsync("sintetizar con ElevenLabs: un error HTTP lanza con el código y sin la clave, y no deja caché", async () => {
  simular({ status: 401, cuerpo: `{"detail":{"status":"invalid_api_key","message":"clave ${CLAVE} inválida"}}` });
  await assert.rejects(
    () => sintetizar("Frase que falla.", "em_alex", { proveedor: P }),
    (e: Error) => /HTTP 401/.test(e.message) && !e.message.includes(CLAVE),
  );
  assert.equal(enCacheVoz("Frase que falla.", "em_alex", 1, P), false);
  simular({ segundos: 0 });
  await assert.rejects(() => sintetizar("Audio vacío.", "em_alex", { proveedor: P }), /audio inválido/);
  globalThis.fetch = (async () => {
    throw new Error("sin red");
  }) as typeof fetch;
  await assert.rejects(() => sintetizar("Sin red.", "em_alex", { proveedor: P }), /ElevenLabs no respondió.*sin red/);
});

await checkAsync("narrarEscenas: si ElevenLabs falla en una escena, narra el reel entero con Kokoro (una sola voz)", async () => {
  const textos = ["Escena uno narrada.", undefined, "Escena tres narrada."];
  // Kokoro ya en la caché (sin venv en los tests).
  for (const [i, t] of ["Escena uno narrada.", "Escena tres narrada."].entries()) {
    const { wav, meta } = rutaCacheVoz(t, "em_alex", 1);
    await mkdir(dirname(wav), { recursive: true });
    await writeFile(wav, wavDePcm(Buffer.alloc(48_000)));
    await writeFile(meta, JSON.stringify({ texto: t, voz: "em_alex", velocidad: 1, segundos: 1 + i }));
  }
  // La primera escena sale de ElevenLabs y la tercera falla: el reel queda entero en Kokoro.
  let n = 0;
  globalThis.fetch = (async () => (++n === 1 ? new Response(new Uint8Array(48_000)) : new Response("cuota", { status: 429 }))) as typeof fetch;
  const avisos: string[] = [];
  const warn = console.warn;
  console.warn = (m: string) => avisos.push(m);
  try {
    const r = await narrarEscenas(textos, "em_alex", P);
    assert.deepEqual(r.map((x) => x?.proveedor), ["kokoro", undefined, "kokoro"]);
    assert.deepEqual(r.map((x) => x?.segundos), [1, undefined, 2]);
    assert.equal(avisos.length, 1);
    assert.ok(/HTTP 429/.test(avisos[0]) && /Kokoro em_alex/.test(avisos[0]) && !avisos[0].includes(CLAVE));
  } finally {
    console.warn = warn;
  }
  assert.equal(enCacheVoz("Escena uno narrada.", "em_alex", 1, P), true, "lo ya pagado queda en la caché");

  // Con ElevenLabs sano, todo el reel sale de ElevenLabs.
  simular({ segundos: 1.2 });
  const ok = await narrarEscenas(textos, "em_alex", P);
  assert.deepEqual(ok.map((x) => x?.proveedor), ["elevenlabs", undefined, "elevenlabs"]);
});

globalThis.fetch = fetchReal;
await rm(dir, { recursive: true, force: true }).catch(() => {});
done();
