# Plan — narración con ElevenLabs

Spec: `docs/superpowers/specs/2026-10-28-voz-elevenlabs-design.md`.

1. `src/reel/voz.ts`
   - `proveedorVoz()`: lee `VOZ_PROVEEDOR`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`,
     `ELEVENLABS_MODEL`; devuelve `{ tipo: "kokoro" }` o `{ tipo: "elevenlabs", voiceId, modelo, apiKey }`
     (avisa una vez y cae a Kokoro si faltan datos).
   - `rutaCacheVoz(texto, voz, velocidad, proveedor?)`: clave de Kokoro sin cambios; la de ElevenLabs
     indexada por `voice_id` y modelo.
   - `sintetizarElevenLabs(texto, prov, velocidad)`: `fetch` a la API con `output_format=pcm_24000`,
     `wavDePcm` le pone la cabecera, duración = bytes / 48000; escribe WAV y metadatos en la caché.
   - `sintetizar` despacha por proveedor; `enCacheVoz` mira la caché del proveedor activo.
   - `narrarEscenas`: con ElevenLabs, si una escena falla, rehace el reel entero con Kokoro.
2. `src/reel/cli.ts`: carga `.env` (como `render-cli.ts`).
3. `src/reel/renderReel.ts`: el log dice qué proveedor narró.
4. `.env.example`: las cuatro variables, comentadas.
5. `test/reel-voz-elevenlabs.ts` (en `npm test`): `fetch` simulado; comprueba URL, cabecera, cuerpo,
   WAV válido y duración, caché (segunda llamada sin fetch), clave distinta por voz, error sin la
   clave en el mensaje, respaldo a Kokoro del reel entero, y `enCacheVoz` por proveedor.
6. Verificar: `npm run typecheck && npm test && npm run test:reel`. PR desde `claude/voz-elevenlabs`;
   pedir `/codex:adversarial-review` antes del merge (gasta dinero en APIs).
