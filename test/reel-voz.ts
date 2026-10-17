import assert from "node:assert/strict";
import { check, done } from "./_check.ts";
import { conNarracion, NARRACION_MARGEN, reelTiming, specTiming } from "../src/reel/timing.ts";
import { ffmpegArgs, GANANCIA_VOZ, MUSICA_BAJO_VOZ } from "../src/reel/capture.ts";
import { inicioVoces, VOZ_ENTRADA } from "../src/reel/renderReel.ts";
import { parseVoz, segundosEstimados, VOCES, VOZ_DEFECTO } from "../src/reel/voz.ts";
import { subtitulo, SUBTITULO_BOTTOM } from "../src/reel/page.ts";
import { Hook, Screen, Cta } from "../src/templates/index.ts";
import { REEL_SAFE_BOTTOM, SUBTITULO_RESERVA, contentHeight, subtituloReserve } from "../src/templates/layout.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Narración de los reels (pivote 2026-10-17), sin Chromium ni Kokoro: cada
 * escena narrada dura al menos su voz, las voces entran en el segundo de su
 * escena, ffmpeg mezcla la música baja con las voces, el subtítulo se pinta
 * solo con narración y las voces válidas son las de Kokoro en español.
 * Uso: npm test
 */

const spec: CarouselSpec = {
  name: "voz-test",
  pace: "gancho",
  slides: [
    { template: Hook, props: { title: "ChatGPT te recuerda pagar la luz", highlight: "te recuerda", narracion: "Esto lo hizo ChatGPT solo, cada mes." } },
    { template: Screen, props: { app: "ChatGPT", prompt: "Avísame cada 1 del mes: pagar la luz", respuesta: "Listo. Te lo recordaré el día 1 de cada mes.", narracion: "Le escribes esto una vez y ChatGPT te lo recuerda todos los meses, sin que vuelvas a pensarlo." } },
    { template: Cta, props: { title: "Mándaselo a quien siempre olvida pagar", highlight: "Mándaselo", handle: "ia.punto.es" } },
  ],
};

check("conNarracion: alarga solo las escenas narradas, hasta voz + margen, y nunca acorta", () => {
  assert.deepEqual(conNarracion([3, 2, 4]), [3, 2, 4]);
  assert.deepEqual(conNarracion([3, 2, 4], [1, 5, undefined]), [3, +(5 + NARRACION_MARGEN).toFixed(2), 4]);
  assert.deepEqual(conNarracion([3, 2, 4], [undefined, undefined, undefined]), [3, 2, 4]);
  assert.throws(() => conNarracion([3], [0]), /escena 1/);
  assert.throws(() => conNarracion([3], [-1]), /escena 1/);
});

check("specTiming: con narracion el hook se pasa de su tope de 3 s y el total crece", () => {
  const sin = specTiming(spec);
  assert.ok(sin.scenes[0].dur <= 3, "hook en gancho ≤ 3 s sin voz");
  const con = specTiming(spec, { narracion: [4.2, 6.0, undefined] });
  assert.equal(con.scenes[0].dur, +(4.2 + NARRACION_MARGEN).toFixed(2));
  assert.equal(con.scenes[1].dur, +(6.0 + NARRACION_MARGEN).toFixed(2));
  assert.equal(con.scenes[2].dur, sin.scenes[2].dur, "la escena sin voz no cambia");
  assert.ok(con.total > sin.total);
});

check("inicioVoces: cada voz empieza con su escena (+ media transición salvo la 0) + VOZ_ENTRADA", () => {
  const t = reelTiming([4, 5, 3], 0.3, "gancho");
  const inicios = inicioVoces(t, ["a", "b", undefined]);
  assert.equal(inicios[0], VOZ_ENTRADA);
  assert.equal(inicios[1], +(t.scenes[1].start + 0.15 + VOZ_ENTRADA).toFixed(3));
  assert.ok(Number.isNaN(inicios[2]), "sin narración no hay inicio");
});

check("ffmpegArgs: sin voces es el mux de siempre; con voces baja la música, retrasa cada voz y mezcla sin normalizar", () => {
  const t = reelTiming([4, 5], 0.3, "gancho");
  const solo = ffmpegArgs(t, "out.mp4", "musica.mp3");
  assert.ok(solo.join(" ").includes("afade=t=out"));
  assert.ok(!solo.join(" ").includes("amix"));
  const mezcla = ffmpegArgs(t, "out.mp4", "musica.mp3", [
    { path: "v0.wav", start: 0.2 },
    { path: "v1.wav", start: 4.05 },
  ]);
  const fc = mezcla[mezcla.indexOf("-filter_complex") + 1];
  assert.ok(fc.includes(`[1:a]volume=${MUSICA_BAJO_VOZ}`), "música baja");
  assert.ok(fc.includes(`volume=${GANANCIA_VOZ},adelay=200:all=1[v0]`), "voz 0 a los 200 ms");
  assert.ok(fc.includes("adelay=4050:all=1[v1]"), "voz 1 a los 4050 ms");
  assert.ok(fc.includes("amix=inputs=3:duration=longest:dropout_transition=0:normalize=0"), "3 pistas sin normalizar");
  assert.ok(fc.endsWith(`atrim=0:${(t.frames / t.fps).toFixed(3)}[aud]`), "recortado al video");
  assert.deepEqual(mezcla.filter((a) => a === "-i").length, 4, "stdin + música + 2 voces");
  // Sin música: solo voces, también mezcladas (una pista).
  const sinMusica = ffmpegArgs(t, "out.mp4", undefined, [{ path: "v0.wav", start: 0 }]);
  assert.ok(sinMusica[sinMusica.indexOf("-filter_complex") + 1].includes("amix=inputs=1"));
  assert.throws(() => ffmpegArgs(t, "out.mp4", "m.mp3", [{ path: "v.wav", start: -1 }]), /segundo inválido/);
});

check("subtitulo: pastilla con el texto solo si hay narración, escapado y sobre la zona segura", () => {
  assert.equal(subtitulo(undefined), "");
  assert.equal(subtitulo("   "), "");
  assert.equal(subtitulo(42), "");
  const html = subtitulo("Esto lo hizo  ChatGPT <solo> & \"ya\"");
  assert.ok(html.includes("Esto lo hizo ChatGPT &lt;solo&gt; &amp; &quot;ya&quot;"), "espacios colapsados y HTML escapado");
  assert.ok(html.includes(`bottom:${SUBTITULO_BOTTOM}px`));
  assert.ok(html.includes('data-anim="rise"'), "entra con la escena");
  // Ninguna comilla doble dentro de los style="…" (una fuente como "Segoe UI" cortaba el atributo y el texto salía a 16 px).
  for (const m of html.matchAll(/style="([^"]*)"/g)) assert.ok(!/["]/.test(m[1]));
  assert.ok(/style="[^"]*font-size:44px[^"]*color:#F4F4F6/.test(html), "el estilo del texto llega entero");
  assert.ok(SUBTITULO_BOTTOM >= REEL_SAFE_BOTTOM + 40, "sobre la zona que tapa la interfaz de Instagram y sobre la fuente al pie");
  // Con fuente al pie, la pastilla sube lo que ocupa la fuente; el contenido reserva el alto del subtítulo.
  const conFuente = subtitulo("Hola a todos", "Fuente: help.openai.com");
  const m = /bottom:(\d+)px/.exec(conFuente)!;
  assert.ok(Number(m[1]) > SUBTITULO_BOTTOM, "sube sobre la fuente");
  assert.equal(subtituloReserve("reel", "Hola"), SUBTITULO_RESERVA);
  assert.equal(subtituloReserve("post", "Hola"), 0);
  assert.equal(subtituloReserve("reel", "  "), 0);
  assert.equal(contentHeight("reel", undefined, "Hola"), contentHeight("reel") - SUBTITULO_RESERVA);
});

check("voz: VOZ_DEFECTO es em_alex, parseVoz acepta las 3 de Kokoro y rechaza el resto; estimación por palabras", () => {
  assert.equal(VOZ_DEFECTO, "em_alex");
  assert.deepEqual([...VOCES], ["em_alex", "em_santa", "ef_dora"]);
  for (const v of VOCES) assert.equal(parseVoz(v), v);
  assert.throws(() => parseVoz("onyx"), /La voz "onyx" no existe/);
  assert.throws(() => parseVoz(undefined), /no existe/);
  // 29 palabras ≈ 9,8 s medidos con em_alex: la estimación queda cerca (±1,5 s).
  const est = segundosEstimados("Esto lo hizo ChatGPT solo, cada mes. Escribe: avísame cada uno del mes, pagar la luz. Y listo: te llega el aviso solo. Mándaselo a quien siempre olvida pagar.");
  assert.ok(Math.abs(est - 9.8) < 1.5, `estimación ${est}`);
  assert.equal(segundosEstimados("Hola"), 1.0, "mínimo 1 s");
});

await done();
