Trabaja en una rama nueva creada desde la rama que ya tiene la ingesta vía API de Meta: `git fetch origin && git checkout -b feat/remix-por-dm origin/claude/meta-api-migration-sq2l4y` (si esa rama ya se mergeó a `main`, créala desde `origin/main`).

Lee primero el análisis `spdd/analysis/202609281000-[Analysis]-remix-por-dm.md`. Tiene el contexto completo: el flujo, las incógnitas, el setup en Meta y las fases.

## Objetivo
Cuando comparto un post o reel de Instagram **por DM a @ia.punto.es** desde mi cuenta personal, un webhook de Meta dispara automáticamente el remix: 2 variaciones en `carousels/inbox/`. Sin cookies ni scraping. **No se publica nada.**

Datos (no secretos):
- IG user id: `17841475604423386`
- Página: `1258708050668527`
- App ID: `1108976694979779`
- Graph API: `v26.0`

Los secretos están en `.env`: `META_ACCESS_TOKEN`, `META_APP_SECRET` y el nuevo `META_WEBHOOK_VERIFY_TOKEN`. **Nunca los imprimas.**

## Hazlo en este orden y detente donde se indica

### Fase S — Spike (primero, obligatorio)
1. Crea `src/inbox/server.ts` y el script `npm run inbox`. Usa `node:http`, sin dependencias nuevas. Puerto configurable con `INBOX_PORT` (default 8787).
   - `GET /webhook`: verificación. Si `hub.mode === "subscribe"` y `hub.verify_token === META_WEBHOOK_VERIFY_TOKEN`, responde `hub.challenge` con 200; si no, 403.
   - `POST /webhook`:
     - Lee el **body crudo**.
     - Valida `X-Hub-Signature-256` (`sha256=` + HMAC-SHA256 del body con `META_APP_SECRET`) con `crypto.timingSafeEqual`. Si no coincide, 401.
     - Responde 200 de inmediato y procesa después.
   - Con `--debug-payload`: guarda cada body válido en `.cache/inbox/raw/<timestamp>.json` e imprime un resumen: tipo de attachment, llaves del payload y remitente.
2. Agrega al README cómo exponer el servidor con **ngrok usando un dominio estático gratuito** (`ngrok http --url=<dominio> 8787`) y cómo configurar el webhook en Meta. Usa los pasos del análisis: Webhooks → Instagram → campo `messages`, y `POST {page-id}/subscribed_apps?subscribed_fields=messages` con el token de la Página.
3. **DETENTE aquí y pídeme** que comparta por DM tres casos reales: un post de una imagen, un carrusel y un reel. Con los payloads capturados:
   - Documenta en el análisis, en la tabla "Incógnitas", qué trae realmente cada caso: tipo, url, permalink o shortcode, autor, cantidad de medias.
   - Guarda versiones **anonimizadas** como fixtures en `test/fixtures/inbox/`: reemplaza IDs y URLs firmadas por valores falsos.

### Fase 1 — Parser (puro y testeable)
`src/inbox/parse.ts`: convierte `entry[].messaging[]` en eventos normalizados `{ senderId, mid, timestamp, kind: "share" | "text" | "other", url?, shortcode?, username?, mediaUrls[], caption? }`.
- Ignora `is_echo`, lecturas, reacciones y `mid` repetidos.
- Ajusta el parser a lo que mostraron los payloads reales, no a supuestos.
- Agrega tests en `test/smoke.ts` usando los fixtures.

### Fase 2 — Cola + worker
1. Extrae el pipeline de `src/remix/cli.ts` (análisis → variaciones → loop de calidad → emisión → render opcional) a una función `runRemix(opts)` en `src/remix/run.ts`. La CLI queda como un wrapper fino y su comportamiento no cambia.
2. Crea una cola persistente en `.cache/inbox/jobs/<mid>.json`:
   - Estados `pending`, `running`, `done` y `failed`, con idempotencia por `mid`.
   - Procesa **un job a la vez**.
   - Al arrancar, retoma los jobs `pending` y los `running` que quedaron colgados.
3. Resolución de cada share:
   - Si hay shortcode y @, usa el proveedor Meta (Business Discovery) de `ingest()`.
   - Si no, usa las `mediaUrls` del payload directamente: descarga las imágenes a data URIs y saca frames de los videos con `extractReelFrames`.
   - El @ puede venir en un mensaje de texto `@cuenta` del mismo remitente, enviado dentro de ±5 min del share. Asócialo.
   - Si no hay nada utilizable, el job queda `failed` con un motivo claro.
4. Allowlist: solo procesa remitentes que estén en `INBOX_ALLOWED_SENDERS` (IGSIDs separados por coma). Para un remitente desconocido, imprime una sola vez su IGSID con instrucciones para agregarlo, y lo ignora.
5. Salida en `carousels/inbox/`. Con `INBOX_RENDER=1`, también renderiza los PNG.

### Fase 3 — Respuesta por DM (opcional, activada con `INBOX_REPLY=1`)
Usa `POST /{ig-user-id}/messages` con `{ recipient: { id: senderId }, message: { text } }` y el cliente de `src/meta/`.
- Acuse al encolar: "✓ Recibido, generando 2 variaciones…".
- Al terminar: "✓ Listo: <nombre-v1> (score X), <nombre-v2> (score Y)", o el motivo del fallo.

## Restricciones
- **Sin dependencias npm nuevas.** Mantén el estilo del repo: español, funciones chicas y JSDoc breve.
- Nunca pongas en logs tokens, el app secret ni bodies completos, salvo con `--debug-payload`, que guarda solo en `.cache/`.
- El contrato `InstagramSource` y el pipeline aguas abajo no cambian.
- Actualiza el README con una sección "Remix por DM": setup en Meta, ngrok, variables de entorno y flujo de uso.

## Criterios de terminado
1. `npm run typecheck` y `npm test` pasan, incluidos los tests del parser con fixtures reales anonimizados.
2. Compartir por DM un carrusel real a @ia.punto.es genera 2 `.ts` en `carousels/inbox/` sin intervención.
3. Reenviar el mismo webhook (mismo `mid`) no duplica el trabajo.
4. Un POST con firma inválida recibe 401 y un remitente fuera de la allowlist se ignora.
5. Haz commits claros por fase y `git push -u origin feat/remix-por-dm`. No abras un PR salvo que te lo pida.
