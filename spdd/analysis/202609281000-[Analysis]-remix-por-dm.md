# SPDD Analysis: Remix disparado por DM a @ia.punto.es (opción C)

## Original Business Requirement

> ¿Puede activarse el proceso al detectar que guardé contenido en mi cuenta de Instagram? → La API no expone los "Guardados"
> ni avisa cuando guardas algo. De las alternativas, el usuario elige la **opción C**: compartir el post **por DM a @ia.punto.es**
> desde otra cuenta y que un webhook de mensajes dispare el remix automáticamente.

Depende de: `202609271400-[Analysis]-migracion-api-meta.md` (app de Meta con Facebook Login, IG user id `17841475604423386`,
Página `1258708050668527`) y de la ingesta por Business Discovery (`spdd/prompt/202609271500-[Feat]-remix-ingesta-api-meta.md`).

## Flujo objetivo

```
Tu cuenta personal ──(Compartir → Enviar a @ia.punto.es)──▶ DM
        │
        ▼
Meta Webhooks (objeto "instagram", campo "messages")  ── POST firmado (X-Hub-Signature-256)
        │
        ▼
npm run inbox  (servidor HTTP local, expuesto con un túnel HTTPS: ngrok con dominio estático o cloudflared)
        │  valida firma → encola el job en .cache/inbox/ → responde 200 en < 1 s
        ▼
Worker (mismo proceso, cola secuencial): resuelve el post → ingest() → remix (2 variaciones) → opcional --render
        │
        └──▶ (opcional) responde por DM: "✓ Recibido…" y luego "✓ 2 variaciones: score 82 / 77"
```

## Incógnitas a verificar ANTES de construir (spike)

Lo que trae el webhook cuando se comparte un post **no está bien documentado** y ha cambiado entre versiones.
Hay que capturar el payload crudo de 3 casos reales: **post de una imagen, carrusel y reel**.

| Pregunta | Por qué importa | Si la respuesta es "no" |
|---|---|---|
| ¿El attachment trae un `permalink` o shortcode? | Permite usar Business Discovery (todas las slides, video completo) | Usar la media del payload directamente |
| ¿Trae `url` de la media (CDN)? ¿De todas las slides o solo de la primera? | Podría evitar Business Discovery | Pedir el @ y usar Business Discovery |
| ¿Trae el autor (@) del post? | Business Discovery exige username | El remitente manda el @ como texto en el mismo chat |
| ¿Tipo del attachment? (`share`, `ig_post`, `ig_reel`, `reel`…) | Distinguir reel vs post | Detectar por extensión o `media_type` |
| En modo desarrollo, ¿llegan los mensajes de tu cuenta personal? | Los webhooks en modo dev solo se entregan para cuentas con rol en la app | Agregar tu cuenta personal como **Instagram Tester** en *Roles de la app* |

## Domain Concept Identification

### Existing Concepts
- **ingest() / proveedor Meta (Business Discovery)**: se reutiliza tal cual cuando hay shortcode + @.
- **localImageToDataUri / fetchImageAsDataUri / extractReelFrames**: para la media que venga directo en el payload.
- **Pipeline de `src/remix/cli.ts`**: análisis → variaciones → loop de calidad → emisión. Se extrae a una función `runRemix(opts)`
  reutilizable por la CLI y por el worker (la CLI queda como wrapper fino).
- **MetaClient** (`src/meta/client.ts`, de la tarea anterior): se reutiliza para Graph API (y el envío de DMs).

### New Concepts Required
- **Webhook server** (`src/inbox/server.ts`, `npm run inbox`): `node:http` sin dependencias.
  - `GET /webhook`: handshake (`hub.mode=subscribe`, `hub.verify_token === META_WEBHOOK_VERIFY_TOKEN` → responde `hub.challenge`).
  - `POST /webhook`: valida `X-Hub-Signature-256` (HMAC-SHA256 del **body crudo** con `META_APP_SECRET`, comparación en tiempo
    constante), responde 200 de inmediato y encola.
- **Parser de eventos** (`src/inbox/parse.ts`, puro y testeable): `entry[].messaging[]` → `{ senderId, mid, timestamp, kind, url?,
  shortcode?, username?, mediaUrls[], caption? }`. Ignora `is_echo`, lecturas, reacciones y duplicados (por `mid`).
- **Cola persistente** (`.cache/inbox/jobs/*.json`): estados `pending → running → done | failed`, idempotencia por `mid`,
  procesamiento **secuencial** (uno a la vez: OpenAI y Playwright son pesados). Sobrevive a reinicios.
- **Asociación del @**: si el share no trae autor, se toma el último texto del mismo remitente con forma `@cuenta` enviado
  dentro de ±5 min (antes o después del share). Sin @ ni media usable → job `failed` con motivo claro (y DM de aviso si está activo).
- **Allowlist de remitentes** (`INBOX_ALLOWED_SENDERS`, IGSIDs): solo tus cuentas disparan remixes; lo demás se ignora y se registra.
  El primer mensaje de un remitente desconocido imprime su IGSID para que lo agregues.
- **Respuesta por DM (opcional, `INBOX_REPLY=1`)**: `POST /{ig-user-id}/messages` con `recipient.id = senderId`. Solo dentro de la
  ventana de 24 h (siempre se cumple, porque respondes a un DM recién recibido).

### Key Business Rules
- **Nada de cookies ni scraping.** Todo pasa por webhooks + Graph API oficiales.
- **Responder 200 rápido** (Meta reintenta y termina desactivando webhooks lentos); el trabajo pesado va en el worker.
- **Nunca** registrar en logs el token, el app secret ni el body completo en producción (solo en modo `--debug-payload` del spike,
  y guardado en `.cache/`, que está en `.gitignore`).
- Las variaciones quedan en `carousels/inbox/` para revisión humana; **no se publica nada**.

## Setup en Meta (manual, lo hace el usuario)

1. **Instagram → Configuración → Mensajes y respuestas → Herramientas conectadas → Permitir acceso a mensajes**: activado.
2. **App → Roles de la app → Instagram Testers**: agrega tu cuenta personal (la que enviará los DMs) y acepta la invitación
   desde Instagram (*Configuración → Apps y sitios web → Invitaciones de testers*).
3. **Permisos nuevos del token**: `instagram_manage_messages` y `pages_manage_metadata` (además de los 5 actuales). Regenera el
   token en el Explorador y extiéndelo de nuevo.
4. **App → Agregar producto → Webhooks** → objeto **Instagram** → *Suscribirse a este objeto* con:
   - URL de devolución: `https://<tu-dominio-ngrok>/webhook`
   - Token de verificación: el valor de `META_WEBHOOK_VERIFY_TOKEN` (un texto aleatorio que tú eliges)
   - Suscribe el campo **`messages`**.
   (El servidor `npm run inbox` y el túnel deben estar corriendo en ese momento para pasar la verificación.)
5. **Suscribir la Página a la app** (en el Explorador, con el **token de la Página**, que se obtiene con
   `me/accounts?fields=access_token`): `POST 1258708050668527/subscribed_apps?subscribed_fields=messages`.

Los nombres de menús de Meta cambian seguido; si alguno no calza, buscar el equivalente.

## Strategic Approach

| Fase | Entregable | Gate |
|---|---|---|
| S. Spike | `npm run inbox -- --debug-payload`: handshake + firma + guarda cada payload crudo en `.cache/inbox/raw/` | 3 payloads reales (imagen, carrusel, reel) capturados y documentados en este análisis |
| 1. Parser | `parse.ts` ajustado a los payloads reales + tests con esos payloads (anonimizados) como fixtures | `npm test` verde |
| 2. Cola + worker | Cola persistente, idempotencia, allowlist, asociación del @, `runRemix()` extraído de la CLI | Un DM real produce 2 `.ts` en `carousels/inbox/` |
| 3. Respuesta DM | `INBOX_REPLY=1`: acuse + resultado con scores | Recibes el DM de vuelta |
| 4. Always-on (opcional) | Mover el receptor a un serverless (Cloudflare Worker) que dispare un GitHub Action (`repository_dispatch`) que corra el remix y abra un PR | Funciona con el computador apagado |

### Key Design Decisions

| Decisión | Recomendación | Por qué |
|---|---|---|
| Dónde corre | **Local + túnel** (fases S–3) | Cero costo, reutiliza Playwright/ffmpeg/OpenAI ya instalados. Requiere el computador encendido. |
| Túnel | **ngrok con dominio estático gratis** | La URL no cambia entre reinicios → no hay que reconfigurar el webhook en Meta. `cloudflared` sirve si tienes dominio propio. |
| HTTP | `node:http` | Sin dependencias nuevas, como el resto del repo. |
| Concurrencia | 1 job a la vez | Evita picos de costo en OpenAI y de memoria en Chromium. |

## Risk & Gap Analysis
- **Payload incierto** (la mayor incógnita) → por eso el spike va primero y el parser se escribe contra payloads reales.
- **Carrusel parcial**: si el payload solo trae la primera slide y no hay @, el análisis será parcial (se marca `partial: true`).
- **Modo desarrollo**: si los webhooks no llegan desde tu cuenta personal, revisar el rol de Instagram Tester antes de depurar código.
- **Computador apagado**: Meta reintenta por un tiempo limitado; los DMs enviados con el servidor apagado pueden perderse
  (mitigación futura: al arrancar, leer conversaciones recientes con `GET /{ig-user-id}/conversations`; o fase 4).
- **Seguridad**: endpoint público → validación de firma obligatoria + allowlist de remitentes.
- **Token**: `instagram_manage_messages` amplía lo que puede hacer el token; guárdalo solo en `.env`.
