# SPDD Analysis: Migración a la API oficial de Meta (Instagram Platform)

## Original Business Requirement

> Instagram ya me notificó, tan solo con 6 post, que tengo un comportamiento inadecuado. Creo que la solución no va a escalar solo con mi usuario. Necesito que planifiquemos migrar a la api de meta.
>
> Aclaración: no me interesa publicar automáticamente por ahora.

**Alcance**: la API se usa **solo para leer** (ingesta del remix y métricas de tus propios posts).
La publicación sigue siendo manual desde la app de Instagram. Publicar por API queda como trabajo futuro.

## Diagnóstico: qué dispara el aviso

El repo **no publica** en Instagram; la única interacción automatizada con IG es la **ingesta del remix**
(`src/remix/ingest.ts`, `src/remix/ytdlp.ts`):

| Vía actual | Qué hace | Riesgo para la cuenta |
|---|---|---|
| `yt-dlp --cookies` / `--cookies-from-browser` | Usa **la sesión logueada de tu cuenta** para descargar medios en ráfaga (metadata + todos los medios, sin pausas), a veces desde una IP distinta (cloud). | **Alto.** Es exactamente el patrón que IG marca como "actividad automatizada" y lo atribuye a tu usuario. Principal sospechoso. |
| Scraping público (`fetchPublic`) con UA de navegador falso | Descarga HTML y parsea `og:*` / `display_url` | Medio: no toca tu cuenta, pero viola los Términos y es frágil (login wall). |
| Modo manual (`--caption` / `--image`) | Sin red | Nulo. |

Conclusión: el problema no es "cuántos posts", sino **automatizar con la identidad de tu cuenta personal**.
La API oficial resuelve eso porque cada request va firmado por **una app de Meta** con un token autorizado,
dentro de límites documentados.

## Qué ofrece la API de Meta y qué NO

Hay dos variantes de la Instagram Platform API:

| Capacidad | Instagram Login (`graph.instagram.com`) | Facebook Login (`graph.facebook.com`) |
|---|---|---|
| Requiere Página de Facebook vinculada | No | **Sí** |
| Publicar carrusel / reel / imagen | Sí | Sí |
| Insights de tus posts (reach, saved, shares, views) | Sí | Sí |
| **Business Discovery** (leer posts públicos de *otras* cuentas Business/Creator) | **No** | **Sí** |
| Leer un post arbitrario por URL | No | No (solo vía Business Discovery por `username`) |

Límites relevantes para lectura:

- Cuenta propia: debe ser **profesional (Business o Creator)**.
- Rate limit por app/usuario (Business Use Case): se informa en los headers `X-App-Usage` / `X-Business-Use-Case-Usage`;
  el uso de este proyecto (unas pocas llamadas por remix) queda muy por debajo.
- Business Discovery solo ve cuentas **Business/Creator** públicas, no cuentas personales ni posts sueltos por URL,
  y los reels con audio con copyright pueden venir sin `media_url`.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **ingest()** (`src/remix/ingest.ts`): orquestador con cadena yt-dlp → scraping → manual. Se reemplaza el primer eslabón por un proveedor Meta.
- **InstagramSource.mediaDataUris[]** (`src/remix/types.ts`): contrato aguas abajo. **No cambia**: el proveedor Meta también entrega data URIs.
- **SourceMode** (`src/remix/types.ts`): hoy `"fetch" | "manual"`; se agrega `"meta"`.
- **framesFromLocalVideo()** (`src/remix/ingest.ts`): se reutiliza para reels obtenidos vía `media_url`.
- **record.ts / calibration.ts** (`src/score/`): métricas cargadas **a mano**. Se pueden alimentar desde la Insights API.

### New Concepts Required

- **MetaClient** (`src/meta/client.ts`): wrapper fino sobre `fetch` (sin SDK nuevo), versión de Graph fijada, manejo de errores y
  backoff según headers `X-App-Usage` / `X-Business-Use-Case-Usage`.
- **MetaAuth** (`src/meta/auth.ts`): lectura de `META_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_APP_ID/SECRET`; refresco del token
  long-lived (60 días) o uso de un **System User token** (no expira) si se usa Business Manager.
- **BusinessDiscoveryProvider** (`src/remix/providers/meta.ts`): de una URL `instagram.com/p/<shortcode>` + `@username` obtiene el post
  paginando `business_discovery.username(X){media{permalink,caption,media_type,media_url,children{…}}}` hasta encontrar el `permalink`.
- **InsightsSync** (`npm run insights <carrusel.ts> -- --url=<permalink>`): como publicas a mano, se vincula el carrusel con su
  post por el permalink (se busca en `/{ig-user-id}/media`); trae `reach, saved, shares, likes, comments, views` y escribe
  `metrics/<name>.json` con el mismo formato que `record`. `record` manual sigue disponible.

### Key Business Rules

- **Cero uso de cookies/sesión personal** para automatizar. Se elimina `--cookies` / `--cookies-from-browser`.
- La ingesta nunca se cae: Meta → manual. El scraping público queda **desactivado por defecto** (flag explícito si se quiere).
- La app **no pide permisos de publicación** (`instagram_content_publish`): solo lectura. Menos superficie y menos riesgo.

## Strategic Approach

### Solution Direction

1. **Contener el daño ya** (sin API): quitar cookies de yt-dlp y dejar el remix en modo manual/sin sesión.
2. **Fundación Meta**: cuenta profesional + app de Meta en modo desarrollo + token + `MetaClient`.
3. **Ingesta oficial** del remix vía Business Discovery.
4. **Métricas automáticas** vía Insights → cierra el bucle de calibración sin carga manual.
5. **Escalar a más cuentas** (solo si hace falta): App Review + verificación de negocio + OAuth multi-usuario.

### Key Design Decisions

| Decisión | Recomendación | Por qué |
|---|---|---|
| Variante de login | **Facebook Login** | Es la única con Business Discovery, que el remix necesita. Exige vincular una Página de FB. |
| Modo de la app | **Desarrollo** (sin App Review) mientras sea solo tu cuenta | Los usuarios con rol en la app (admin/tester) tienen acceso estándar sin revisión. |
| Token | System User (Business Manager) o long-lived + refresco | Evita que el pipeline muera cada 60 días. |
| Permisos | Solo lectura: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement` (+ `business_management` si hay System User) | Sin publicación no hace falta más. |
| Dependencias npm | Ninguna nueva (usar `fetch`) | Mantiene el estilo del repo. |

### Alternatives Considered

- **Seguir con yt-dlp sin cookies**: menos riesgo para la cuenta, pero sigue fuera de Términos y con login wall. Descartado como vía principal.
- **Instagram Login**: más simple (sin Página de FB) pero sin Business Discovery; sirve solo si se renuncia al remix automático.
- **oEmbed**: pensado para incrustar, no para extraer todas las slides; insuficiente para el análisis.

## Plan por fases (solo lectura)

| Fase | Entregable | Gate |
|---|---|---|
| 0. Contención | Quitar cookies de yt-dlp; scraping off por defecto; README actualizado | `typecheck` + `test` verdes |
| 1. Setup Meta (manual, tú) | Cuenta Creator/Business, Página FB vinculada, app en developers.facebook.com, token con los permisos de lectura | `GET /me/accounts` devuelve tu `ig_user_id` |
| 2. MetaClient + auth | `src/meta/client.ts`, `auth.ts`, `npm run meta:check` | check imprime la cuenta y el estado del token |
| 3. Ingesta Business Discovery | Proveedor `meta` en `ingest()`; `--user=@cuenta` si la URL no trae username | remix de un carrusel y un reel reales sin cookies |
| 4. Insights | `npm run insights` → `metrics/*.json` + `refreshCalibration()` | calibración se actualiza sin tipear métricas |
| 5. Escala (opcional) | App Review, Business Verification, OAuth multi-cuenta, almacenamiento de tokens | aprobación de Meta |

### Fuera de alcance (futuro)

Publicación por API (`npm run publish`): requeriría `instagram_content_publish`, render en **JPEG** (la API no acepta PNG),
alojar los medios en una **URL pública** (p. ej. Cloudflare R2) y respetar el tope de posts por API en 24 h.
El diseño de las fases 2–4 no lo bloquea: se puede agregar después sin rehacer nada.

## Risk & Gap Analysis

- **Business Discovery no cubre todo**: cuentas personales, posts con restricción de edad o reels sin `media_url` → fallback manual.
- **Encontrar el post por permalink** puede requerir paginar mucho en cuentas muy activas; limitar a N páginas y cachear.
- **Tokens**: expiran o se invalidan al cambiar la contraseña → `meta:check` debe avisar con claridad.
- **Derechos de contenido**: el remix debe seguir produciendo contenido **transformado** (copy y fondos propios), no re-subir medios ajenos.
- **La cuenta ya marcada**: conviene bajar la actividad automatizada unos días, revisar sesiones activas y activar 2FA antes de conectar la app.

## Decisiones abiertas (para el usuario)

1. ¿Tu cuenta ya es **Creator/Business** y aceptas vincular una **Página de Facebook**? (requisito del camino recomendado)
2. ¿"Escalar" significa **más remixes/análisis desde tu cuenta** o **varias cuentas / clientes**? Lo segundo activa la Fase 5.
