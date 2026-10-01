# SPDD Analysis: Sistema always-on (funcionar con el computador apagado)

## Original Business Requirement

> Quiero que el sistema funcione sin necesidad de tener mi computador encendido (teníamos este punto pendiente).

Retoma la **fase 4 "Always-on"** de `202609281000-[Analysis]-remix-por-dm.md` y el riesgo "Computador apagado"
(los DMs enviados con el servidor apagado se pierden). Depende de la ingesta por API de Meta
(`202609271400-[Analysis]-migracion-api-meta.md`) y de la base de conocimiento (`202609261400-[Analysis]-kb-instagram-telegram.md`).

## Diagnóstico: qué depende hoy del Mac

| Pieza | Cómo corre hoy | Por qué exige el Mac encendido |
|---|---|---|
| `npm run kb:bot` (Telegram) | Proceso local, long polling | Si el proceso no corre, nadie lee los mensajes (Telegram los guarda ~24 h) |
| Webhook de DMs (`src/kb/inbox.ts`, puerto 8787) | Mismo proceso + **túnel ngrok** | Meta reintenta poco tiempo; con el Mac apagado los DMs se pierden |
| Base `knowledge/` (vault Obsidian) | Carpeta local, un commit por guardado | Vive solo en el disco del Mac |
| Índice `knowledge/.index/kb.sqlite` | Local | Además del índice derivado, guarda **estado no reconstruible**: cola `jobs`, `inbox_seen`, `hashtag_usage`, `embedding_cache` |
| `remix` / `generate` / `reel` | CLI a mano (Playwright + ffmpeg) | No es automático; solo se usa desde la terminal |
| Token de Meta | `.env` local, long-lived ~60 días | Se renueva a mano |

Hallazgos que condicionan el plan:

1. **El repo `fnvasque/Carrusel` es público** (la API de GitHub responde 200 sin autenticación) y `knowledge/` está versionado
   dentro de él. La rama local `claude/instagram-analysis-system-kcllf6` va **44 commits adelante de origin**: si se hace push
   (o se activa `KB_GIT_PUSH=1`), las fichas y tus notas quedan públicas. Antes de mover nada a un servidor, la base tiene
   que salir a un **repo privado propio**.
2. El código ya está casi listo para servidor: `node:http` sin dependencias, Telegram por long polling (no necesita URL
   pública), cola persistente que retoma tras reinicio, `KB_DIR` configurable y `git` con cwd en la carpeta de la base
   (funciona igual si `knowledge/` es su propio repo).
3. Desde el cambio a la API oficial de Meta, la IP residencial ya no es necesaria (eso aplicaba al scraping de `remix --scrape`,
   que la kb no usa).
4. `node:sqlite` exige Node ≥ 22.5 (en el Mac hay 26; la imagen usa 24).
5. **El bot no usa Chromium** (solo `generate`/`reel`/`remix`): cabe en una máquina gratuita.
6. **La API de conversaciones no entrega los posts compartidos** (verificado 2026-09-30): aparecen como `is_unsupported`,
   sin link ni media. Sus ids sí coinciden con los `mid` del webhook. Con el bot caído, los textos se recuperan; los posts
   compartidos solo se pueden detectar para pedirte que los reenvíes.

## Strategic Approach

### Solution Direction

Mover el proceso `kb:bot` (Telegram + webhook de DMs) a un **contenedor Docker en Oracle Cloud Always Free** (0 USD/mes),
con volumen persistente para la base y el índice, el mismo túnel ngrok (dominio fijo de la cuenta, sin abrir puertos) y la
base en un **repo git privado** que el servidor empuja tras cada guardado y el Mac sincroniza para Obsidian.

```
Instagram DM ──▶ Meta Webhook ──▶ ngrok ──▶ servidor (Docker: kb:bot) ◀── long polling ── Telegram
                                              │
                                    volumen /data: knowledge/ + .index/ + .cache/
                                              │  commit por guardado + git push
                                              ▼
                                  GitHub (repo PRIVADO ia-es-kb)
                                              │  git pull automático (Obsidian Git)
                                              ▼
                                      Mac → Obsidian (lectura y notas)
```

### Key Design Decisions

| Decisión | Recomendación | Por qué |
|---|---|---|
| Dónde corre | **Oracle Cloud Always Free**: Ampere A1 (ARM), 2 OCPU / 12 GB, Ubuntu 24.04 — 0 USD/mes | La máquina gratis más grande; deja margen para sumar el remix con Chromium. Respaldo: Google Cloud e2-micro (gratis, 1 GB) o Hetzner CAX11 (~4 EUR). Fly.io (~6–8 USD) se descartó por costo. |
| HTTPS del webhook | **ngrok en un contenedor**, con el dominio fijo de la cuenta (`*.ngrok-free.dev`) | El webhook de Meta no se reconfigura y no se abren puertos en Oracle. Solo un agente ngrok gratis a la vez: el del Mac se apaga. |
| Empaquetado | `Dockerfile` (`node:24-bookworm-slim` + `ffmpeg` + `git`, sin Chromium) + `compose.yaml` | Reproducible y multi-arquitectura; el mismo contenedor sirve en Oracle, Hetzner o una Raspberry Pi. |
| Base de conocimiento | Repo **privado** separado (`fnvasque/ia-es-kb`), montado en `KB_DIR=/data/knowledge` | Saca los datos personales del repo público y desacopla código de contenido. |
| Galería de slides (`_adjuntos/slides/`, ~6,5 MB) | Versionarla en el repo privado (o Git LFS si crece de ~500 MB) | Hoy queda fuera de git → con la base en el servidor el Mac no la vería. |
| Sincronía con el Mac | Plugin **Obsidian Git** (pull cada 5 min, commit+push de tus notas) | El bot solo escribe entre `kb:auto:start/end`; tus notas van en `## Mis notas` → los conflictos son raros. |
| Concurrencia git | `git pull --rebase` antes de cada commit del bot; si falla, reintento y aviso por Telegram | Evita que un push del Mac rompa el guardado del servidor. |
| Una sola instancia | El bot corre **solo** en el servidor | Telegram rechaza dos long pollings del mismo token (409 Conflict). En el Mac quedan `kb:ask`/`remix` por CLI. |
| Token de Meta | **Token de System User** (Business Manager), sin vencimiento | Elimina la renovación manual cada 60 días. Mientras tanto, el bot avisa por Telegram con menos de 10 días. |
| Disponibilidad | `/health` + auto-restart del contenedor + aviso por Telegram si un job falla | Que te enteres sin mirar logs. |

### Alternatives Considered

| Opción | Pros | Contras | Veredicto |
|---|---|---|---|
| **A. Contenedor en Oracle Always Free** (o VPS) | Reusa el 95 % del código; proceso único como hoy; 0 USD | Cuenta con tarjeta; capacidad ARM a veces escasa | **Elegida** |
| B. Serverless (Cloudflare Worker + GitHub Actions por `repository_dispatch`) | Casi gratis | Reescritura grande; 1–2 min de arranque por guardado; SQLite y cola no encajan; Telegram tendría que pasar a webhook | Descartada por ahora |
| C. Equipo propio always-on (Raspberry Pi 5 / Mac mini viejo) | Sin costo mensual; mismo Docker | Depende de la luz/internet de la casa; sigue necesitando túnel (cloudflared) | Buen plan B si no quieres pagar |
| D. Dejar el Mac sin dormir (`caffeinate`, `pmset`) | Cero trabajo | No resuelve "computador apagado" | No cumple el requisito |

## Plan por fases

| Fase | Entregable | Gate | Estado |
|---|---|---|---|
| **0. Proteger la base** | Repo privado `fnvasque/ia-es-kb` con el historial de `knowledge/` + galería (`scripts/kb-export.sh`, idempotente); `knowledge/` en `.gitignore`; `scripts/kb-use-private-repo.sh` cambia el Mac al clon | El repo privado da 404 sin autenticación; re-ejecutar el export no duplica | ✅ repo creado (38 commits, 27 fichas). El cambio del Mac se hace en la fase 3 |
| **1. Contenerizar** | `Dockerfile`, `.dockerignore`, `scripts/docker-entrypoint.sh` (prepara la base desde `KB_REPO` sin pisar un `.index` copiado), `GET /health` | Imagen construida; tests verdes dentro del contenedor; entrypoint probado con un repo de prueba | ✅ |
| **2. Git en servidor** | Push con `pull --rebase` si el remoto avanzó; si choca, aborta y avisa por Telegram (el commit queda local) | Probado con repos temporales: sin conflicto rebasea y sube; con conflicto avisa | ✅ |
| **3. Deploy** | `compose.yaml` (kb + ngrok), `scripts/server-setup.sh` (Docker, swap, clave de deploy), `scripts/deploy-to-server.sh` (registra la clave, apaga el bot del Mac, sube la base, copia `.env` e índice, arranca) | Con el Mac **apagado**: un link por Telegram se guarda y llega la ficha | ⏳ falta la cuenta de Oracle |
| **4. DMs sin el Mac** | ngrok en el servidor (mismo dominio); al arrancar, `recover.ts` revisa conversaciones de las últimas 24 h: procesa textos perdidos y pide reenviar los posts compartidos | DM a @ia.punto.es con el Mac apagado → respuesta por DM | ✅ código y tests; ⏳ prueba real |
| **5. Operación** | Avisos por Telegram (sync, errores inesperados, token por vencer, diario); healthcheck del contenedor; logs rotados; guía `deploy/README.md` | Una semana sin intervención manual | ✅ código; ⏳ token de System User (lo generas tú en Business Manager) |
| 6. (Opcional) Remix remoto | Comando `/remix <url>` en Telegram: corre `remix --render` en el servidor (agregar Chromium a la imagen) y manda los PNG/MP4 | Remix completo desde el celular | Pendiente |

### Fuera de alcance

- Publicar en Instagram desde el servidor (la integración sigue siendo de solo lectura).
- Interfaz web para la base (sigue siendo Obsidian).

## Risk & Gap Analysis

- **Exposición de datos (alto, ya presente)**: repo público + `knowledge/` versionado. La fase 0 va primero y antes de cualquier push.
  Verificado el 2026-09-30: ninguna rama de `origin` contiene `knowledge/fuentes/` todavía; los 44 commits `kb:` son solo locales.
- **Secretos en la nube**: `OPENAI_API_KEY`, token de Meta y de Telegram pasan a `fly secrets`; ponerle **tope de gasto** a la
  key de OpenAI y usar una key dedicada al servidor.
- **Endpoint público**: la firma `X-Hub-Signature-256` y las allowlists (`TELEGRAM_ALLOWED_CHAT_IDS`, `INBOX_ALLOWED_SENDERS`)
  ya existen; verificar que el servidor rechace todo lo demás antes del deploy.
- **Memoria**: sin Chromium, el bot usa poco; con 12 GB hay margen de sobra para la fase 6.
- **Oracle recupera máquinas "ociosas"** en cuentas Always Free → pasar a Pay As You Go (sigue gratis) con alerta de presupuesto.
- **DMs durante un deploy**: los posts compartidos en esos segundos no se recuperan por API; el bot pide reenviarlos.
- **Conflictos de git**: si editas una ficha fuera de `## Mis notas` en Obsidian al mismo tiempo que el bot la actualiza, el
  rebase puede fallar → el bot avisa y deja el guardado en la cola para reintentar.
- **Webhooks de Meta en modo desarrollo**: siguen funcionando igual; solo cambia la URL del callback.
- **Vendor lock-in bajo**: todo es un contenedor Docker; migrar de Oracle a un VPS o a una Pi es cambiar el host del deploy.

## Decisiones tomadas

1. Proveedor: **Oracle Cloud Always Free** (el usuario eligió la opción más barata).
2. Base en un **repo privado separado** (`ia-es-kb`); el repo de código sigue público.
3. Remix desde Telegram (fase 6): después.
