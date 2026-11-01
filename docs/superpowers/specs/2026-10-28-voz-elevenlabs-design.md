# Narración con la voz clonada en ElevenLabs — diseño

Fecha: 2026-10-28 · Contexto: `informes/foresight-instagram-2026-10-28.md` (pivote a coaching; experimento 2026-11-02 → 2026-11-15).

## Problema
Los reels se narran con Kokoro-82M (`em_alex`), una voz genérica que se sospecha parte de la
permanencia de 2–4 s. El usuario no muestra la cara todavía: quiere narrar con un clon de su propia
voz para sonar humano y mantener la continuidad cuando aparezca en cámara.

## Decisión de proveedor (verificado en la documentación oficial, 2026-10-28)
- **OpenRouter no sirve.** Su guía de TTS (`openrouter.ai/docs/guides/overview/multimodal/tts`)
  solo describe voces preestablecidas por modelo y clonación *sin estado* enviando audio de
  referencia en cada petición (`input_references`, en Fish Audio, HeyGen y Seed). No acepta un
  `voice_id` creado en la cuenta de ElevenLabs del usuario.
- **API directa de ElevenLabs:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`,
  cabecera `xi-api-key`, cuerpo `{ text, model_id, language_code, voice_settings: { speed } }`,
  query `output_format`. Modelo por defecto `eleven_v4` (la documentación de modelos lo recomienda
  para voces clonadas; habla español y acepta `language_code`).
- Formato `pcm_24000`: PCM 16 bit mono a 24 kHz crudo. Le ponemos la cabecera WAV en TypeScript y
  la duración sale de los bytes (`bytes / 48000`): no hace falta ffmpeg ni ffprobe, el WAV es igual
  al de Kokoro (24 kHz mono) y el test corre offline. (Los formatos de 44,1 kHz exigen plan Pro.)

## Configuración (`.env`, nunca en commits ni logs)
| Variable | Uso |
|---|---|
| `VOZ_PROVEEDOR` | `kokoro` (por defecto) o `elevenlabs` |
| `ELEVENLABS_API_KEY` | clave de la API |
| `ELEVENLABS_VOICE_ID` | `voice_id` de la voz clonada |
| `ELEVENLABS_MODEL` | opcional, por defecto `eleven_v4` |

Si `VOZ_PROVEEDOR=elevenlabs` y falta la clave o el `voice_id`, se avisa y se narra con Kokoro.

## Comportamiento
- `narrarEscenas` narra **todo el reel con un solo proveedor**. Si ElevenLabs falla en cualquier
  escena (red, cuota, 401, 404 de voz), avisa por consola (sin la clave) y vuelve a narrar el reel
  completo con Kokoro: nunca un reel con dos voces. Lo ya pagado queda en la caché.
- **Caché por proveedor + voz + texto.** La clave de Kokoro no cambia (las narraciones ya cacheadas
  siguen sirviendo). La de ElevenLabs es `sha256(texto|elevenlabs|voice_id|modelo|velocidad)`:
  re-renderizar no vuelve a pagar, y cambiar de voz o de modelo sí genera audio nuevo.
- `enCacheVoz` (precondición del re-render de la corrección de fondos, que nunca narra de nuevo)
  mira la caché del proveedor activo. Un reel narrado con Kokoro antes del cambio no se corrige con
  ElevenLabs activo (falla con el aviso de siempre, sin gastar).
- Timeout de 60 s por petición. El error no incluye la clave; sí el código HTTP y el detalle.

## Fuera de alcance
Crear la voz (lo hace el usuario en ElevenLabs), elegir proveedor por pieza desde la base, y el
registro en `reglas.json`: no cambia el planificador ni la puerta. Cuando se active
`VOZ_PROVEEDOR=elevenlabs` en el Mac conviene registrar ese día en `reglas.json` para medir el antes
y el después.

## Terminado
`npm run typecheck && npm test` salen 0 con el test nuevo del proveedor (fetch simulado, sin red);
`npm run test:reel` pasa.
