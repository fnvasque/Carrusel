Trabaja en la rama `claude/meta-api-migration-sq2l4y` (haz `git fetch origin` y `git checkout claude/meta-api-migration-sq2l4y`; si ya existe local, `git pull`). Antes de tocar código, lee el análisis `spdd/analysis/202609271400-[Analysis]-migracion-api-meta.md`: es el contexto completo.

## Contexto

Instagram marcó mi cuenta (@ia.punto.es) por "comportamiento inadecuado". La causa es la ingesta del remix (`src/remix/ingest.ts`, `src/remix/ytdlp.ts`), que usa yt-dlp con cookies de mi sesión y scraping del HTML público. Migramos la ingesta a la **API oficial de Meta (Instagram Graph API vía Facebook Login)**, **solo lectura**. **No** se implementa publicación.

La configuración en Meta ya está hecha y probada en el Explorador de la API Graph:
- App de Meta tipo Negocio (App ID `1108976694979779`) en modo desarrollo. Tiene los permisos `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement` y `business_management`.
- IG user id: `17841475604423386`. Versión de la Graph API: `v26.0`.
- Probado y funcionando: `GET /{ig-user-id}?fields=business_discovery.username(natgeo){username,media.limit(3){caption,media_type,permalink}}`.
- El `.env` de la raíz del repo (ya está en `.gitignore`) tiene `META_ACCESS_TOKEN` (token de usuario long-lived, dura unos 60 días), `META_IG_USER_ID`, `META_APP_ID`, `META_APP_SECRET` y `META_GRAPH_VERSION`. **Nunca imprimas ni registres en logs el token ni el secret.**

## Tarea (fases 0, 2 y 3 del análisis)

### Fase 0 — Contención
1. Elimina por completo el soporte de cookies: flags `--cookies` y `--cookies-from-browser`, env `REMIX_COOKIES` / `REMIX_COOKIES_FROM_BROWSER`, `resolveCookies()` y los campos `cookies` / `cookiesFromBrowser` de `RemixOptions`.
2. yt-dlp (sin cookies) y el scraping público (`fetchPublic`) quedan **desactivados por defecto**. Solo corren con un flag explícito `--scrape`, que imprime un aviso de que va contra los Términos de Instagram.

### Fase 2 — Cliente Meta (`src/meta/`)
1. `src/meta/env.ts`: carga el `.env` con `process.loadEnvFile()` de Node, dentro de un try/catch porque el archivo es opcional, sin dependencias nuevas. Expone la config tipada y un error claro si falta `META_ACCESS_TOKEN` o `META_IG_USER_ID`.
2. `src/meta/client.ts`: una función `graphGet(path, params)` sobre `fetch` contra `https://graph.facebook.com/{version}/`:
   - Agrega `access_token`, y `appsecret_proof` (HMAC-SHA256 del token con el app secret) si hay `META_APP_SECRET`.
   - Traduce los errores de Graph a mensajes en español: código 190 = token vencido o inválido (explica cómo renovarlo); 10 / 200 / 100 = falta un permiso o el campo no existe; 4 / 17 / 32 / 613 = límite de uso, esperar; y el error de Business Discovery cuando la cuenta consultada no es Business/Creator.
   - Lee el header `X-Business-Use-Case-Usage` / `X-App-Usage` y avisa si el uso pasa del 80%.
3. `npm run meta:check` (`src/meta/check.ts`):
   - Muestra el @usuario, seguidores y posts (`GET /{ig-user-id}?fields=username,followers_count,media_count`).
   - Con `GET /debug_token?input_token=TOKEN&access_token=APP_ID|APP_SECRET`, muestra la fecha de vencimiento del token y los scopes, y avisa si vence en menos de 10 días o si falta alguno de los 5 permisos.
   - Termina con código de salida distinto de 0 si algo falla.

### Fase 3 — Ingesta vía Business Discovery
1. Nuevo proveedor `src/remix/providers/meta.ts`, que es la **fuente preferente** en `ingest()`. La cadena queda: Meta → (solo con `--scrape`: yt-dlp → scraping público) → manual (`--caption` / `--image`). Nunca debe caerse; si un nivel falla, explica por qué y pasa al siguiente.
2. Funciones **puras** exportadas y testeables:
   - `extractShortcode(url)`: soporta `/p/`, `/reel/`, `/reels/`, `/tv/` y URLs con `/{usuario}/p/{code}/`.
   - `extractUsername(url)`: devuelve el usuario solo si la URL lo trae.
   - `findByShortcode(mediaList, shortcode)`: compara **solo el shortcode**, porque un reel puede tener permalink `/reel/` o `/p/`.
3. El username de la cuenta sale de la URL o de un flag nuevo `--user=cuenta` (acepta el @ y lo quita). Si no hay ninguno de los dos, error claro pidiendo `--user`.
4. Consulta: `business_discovery.username(X){media.limit(50){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}}}`. Pagina con `media.after(CURSOR).limit(50)` hasta encontrar el shortcode, con un tope de páginas (`--max-pages`, default 10) para no gastar cuota.
5. Conversión a `mediaDataUris`:
   - Para IMAGE y CAROUSEL_ALBUM, descarga cada `media_url` (o los `children`) como data URI. Reutiliza `fetchImageAsDataUri`, exportándola.
   - Para VIDEO/reel, reutiliza `extractReelFrames(media_url, frames)`.
   - Si falta `media_url` (p. ej. un reel con audio con copyright), usa `thumbnail_url`.
   - Respeta `MAX_INGEST_IMAGES`. El `type` se deduce de `media_type`.
6. Agrega `"meta"` a `SourceMode` en `src/remix/types.ts`. El caption y los hashtags vienen de la API. La caché por URL existente sigue funcionando.

## Restricciones
- **Sin dependencias npm nuevas.** Usa `fetch` y `node:crypto`. Mantén el estilo del repo: comentarios en español, JSDoc breve y funciones chicas.
- El contrato `InstagramSource.mediaDataUris[]` y todo lo que está aguas abajo (análisis, variaciones, loop de calidad, render) **no cambia**.
- Actualiza el README (sección "Remix de Instagram": configuración de Meta, `meta:check`, `--user`, `--scrape`, sin cookies) y el texto de `usage()` en `src/remix/cli.ts`.
- Siguiendo la convención SPDD del repo, agrega el prompt de esta tarea en `spdd/prompt/` si hace falta.

## Criterios de terminado
1. `npm run typecheck` y `npm test` pasan.
2. `test/smoke.ts` tiene casos nuevos para `extractShortcode`, `extractUsername` y `findByShortcode`, sin red.
3. `npm run meta:check` muestra @ia.punto.es y la fecha de vencimiento del token.
4. `npm run remix "https://www.instagram.com/p/DdvB-rtl-UR/" -- --user=natgeo` ingiere vía Meta (`fuente=meta`) y genera las 2 variaciones.
5. `npm run remix "https://www.instagram.com/reel/Ddy_O-ORVdh/" -- --user=natgeo` saca frames del video (requiere ffmpeg) o cae al thumbnail.
6. Ya no queda ninguna referencia a cookies (`grep -ri cookie src README.md` vacío).
7. Haz commits claros y `git push -u origin claude/meta-api-migration-sq2l4y`. No abras un PR salvo que te lo pida.
