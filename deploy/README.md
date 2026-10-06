# Bot always-on (con el computador apagado)

El bot (`npm run kb:bot`: Telegram + DMs de Instagram) corre en un servidor gratuito de
**Oracle Cloud Always Free** dentro de Docker. La base vive en el repo **privado**
`fnvasque/ia-es-kb`: el servidor hace commit y push de cada guardado, y Obsidian en el Mac
la sincroniza con el plugin Git. Plan y decisiones:
`spdd/analysis/202609301500-[Analysis]-always-on-servidor.md`.

```
Telegram ──long polling──▶ ┌ servidor (Docker) ───────────────┐
Instagram DM ─▶ Meta ─▶ ngrok ─▶ kb  (bot + webhook :8787)     │──push──▶ GitHub ia-es-kb (privado)
                           │  ./data → base + índice + cola    │              │ pull (Obsidian Git)
                           └───────────────────────────────────┘              ▼
                                                                         Mac / Obsidian
```

## 1. Crear la máquina en Oracle (una vez)

1. Cuenta en [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). **Home Region**: Chile Central
   (Santiago); si no hay capacidad ARM, Brazil East (São Paulo). No se puede cambiar después.
2. *Compute → Instances → Create instance*:
   - **Image**: Canonical Ubuntu 24.04 (aarch64).
   - **Shape**: `VM.Standard.A1.Flex` (Ampere), 2 OCPU y 12 GB. Debe decir *Always Free-eligible*.
   - **Networking**: subred pública con IP pública (la opción por defecto).
   - **SSH keys**: sube tu `~/.ssh/id_ed25519.pub` (o crea una con `ssh-keygen -t ed25519`).
   - **Boot volume**: 50 GB.
   Si dice *Out of capacity*, reintenta más tarde o con 1 OCPU / 6 GB.
3. Recomendado: *Billing → Upgrade to Pay As You Go* (sigue siendo gratis dentro de los límites
   y Oracle ya no recupera máquinas "ociosas"), y antes crea un *Budget* con alerta de 1 USD.

No hace falta abrir puertos: el webhook entra por ngrok (conexión saliente).

## 2. Preparar el servidor (una vez)

```bash
ssh ubuntu@<ip>
git clone https://github.com/fnvasque/Carrusel.git ~/carrusel && ~/carrusel/scripts/server-setup.sh
exit
```

Instala Docker, agrega swap y genera la clave de deploy del servidor (`~/carrusel/keys/`).

## 3. Mover el bot (desde el Mac)

```bash
scripts/deploy-to-server.sh ubuntu@<ip>
```

En orden: registra la clave de deploy en `ia-es-kb` (vía `gh`), **apaga el bot y ngrok del
Mac** (pide confirmación), sube lo último de la base al repo privado, copia `.env`
(+ `NGROK_AUTHTOKEN` desde tu ngrok) y el índice, y arranca `docker compose`.

- **Webhook de Meta**: no se toca. ngrok usa el dominio fijo de tu cuenta
  (`*.ngrok-free.dev`) y solo cambia desde dónde se conecta.
- **Índice**: se copia una vez porque guarda lo que no se reconstruye (cola, DMs ya vistos,
  cupo semanal de hashtags, caché de embeddings).

Prueba con el Mac apagado: un link al bot de Telegram y un post por DM a @ia.punto.es.

## 4. Obsidian en el Mac

```bash
scripts/kb-use-private-repo.sh
```

Cambia `knowledge/` por un clon del repo privado y deja un respaldo en
`knowledge.antes-de-migrar/`. Además, saca la base del repo de código, que es **público**.
Luego, en Obsidian: *Community plugins → Git* con *Auto pull interval* en 5 min y
*Auto commit-and-sync* para tus notas. El bot solo escribe en las zonas
`kb:auto` y tus notas van en `## Mis notas`, así que es difícil que choquen. Si chocan, el
bot te avisa por Telegram y el commit queda en el servidor hasta el próximo guardado.

## 5. Calendario automático (publicación en Instagram)

El mismo bot publica las piezas que el Mac renderiza. El servidor **no** lleva Chromium: solo guarda
los medios que el Mac le sube por `rsync` y los sirve a Meta por el ngrok que ya existe. Visión
general y comandos de Telegram en el `README.md` ("Calendario y métricas").

```
Mac (launchd, cada hora) ──rsync por ssh──▶ ~/carrusel/media  (en el contenedor: /data/media)
                                               │ GET /media/<token>/<semana>/<id>/<archivo>
Meta descarga el JPEG/MP4 ◀── ngrok ◀──────────┘   (el bot lo sirve y publica a la hora)
```

**Volumen de medios.** `scripts/server-setup.sh` crea `~/carrusel/media` con tu usuario como dueño
(`compose.yaml` lo monta en `/data/media`). Si Docker la creó antes como root, `scripts/deploy-to-server.sh
ubuntu@<ip> --update` hace `mkdir -p media`, pero no cambia el dueño: en ese caso corre una vez en el
servidor `sudo chown "$USER": ~/carrusel/media`. Los medios se borran solos 7 días después de
publicar cada pieza.

**Variables.** Edita `~/carrusel/.env` en el servidor y aplica con `docker compose up -d`:

| Variable | Valor |
|---|---|
| `MEDIA_PUBLIC_TOKEN` | Token largo al azar (`openssl rand -hex 32`). **El mismo** que en el `.env` del Mac. Sin él no se sirven medios. No lo compartas |
| `MEDIA_PUBLIC_BASE` | URL pública del ngrok, p. ej. `https://<tu-dominio>.ngrok-free.dev`, sin `/` final. El mismo que en el Mac |
| `CALENDARIO_MODO` | `auto` publica en Instagram; `aviso` hace todo menos los POST a Meta (depuración). Sin la variable, el scheduler no arranca. **Solo en el servidor**, no en el `.env` del Mac |

`scripts/deploy-to-server.sh` copia el `.env` del Mac solo la **primera vez**: después agrega o cambia
estas variables directamente en el servidor. `--update` avisa (sin mostrar valores) si falta alguna.

En el `.env` del **Mac** van además `SERVER_HOST=ubuntu@<ip>` y `SERVER_MEDIA_DIR=carrusel/media`: la
ruta del **host** del servidor, relativa a su home, **no** `/data/media` (esa es la del contenedor).
Solo letras, números y `_ . / -`; sin espacios. Después corre `scripts/calendario-install-mac.sh`
(instala el agente de launchd y prueba ssh, `rsync` y la URL pública).

**Token con permiso de publicar.** Publicar exige `instagram_content_publish` además de los permisos
de lectura. Genera un token de **System User** (Business Manager → Usuarios del sistema → Generar
token) con los permisos que ya usas más `instagram_content_publish`; no vence. Reemplaza
`META_ACCESS_TOKEN` en `~/carrusel/.env` y aplica con `docker compose up -d`. `npm run meta:check`
(córrelo como `CALENDARIO_MODO=aviso npm run meta:check`, sin dejar la variable en el `.env` del Mac) exige `instagram_content_publish` y muestra el vencimiento. Si el token es inválido o le falta el permiso, el scheduler no
publica y te avisa por Telegram.

**Probar sin publicar.** Pon `CALENDARIO_MODO=aviso` y aplica con `docker compose up -d`: el bot hace todo
(previews, programación, avisos) menos los POST a Meta. Cuando se vea bien, cambia a `auto`.

**Si ngrok se cae a la hora de publicar**, Meta no puede descargar el medio y el contenedor falla; el
bot reintenta hasta 30 minutos después de la hora y luego marca la pieza `fallido`. Revisa
`docker compose ps` (el servicio `ngrok` debe estar arriba).

## Operación

```bash
ssh ubuntu@<ip>
cd ~/carrusel
docker compose ps                  # estado (kb debe estar "healthy")
docker compose logs -f kb          # logs del bot
docker compose restart kb          # reiniciar
```

- **Actualizar el código** (después de mergear cambios en `main`), desde el Mac:
  `scripts/deploy-to-server.sh ubuntu@<ip> --update` (también crea `~/carrusel/media` si falta).
- **Avisos por Telegram**: fallas al subir la base a GitHub, errores inesperados y token de Meta
  por vencer (se revisa a diario; avisa con menos de 10 días). Para no renovarlo nunca más, usa un
  token de **System User** (Business Manager → Usuarios del sistema → Generar token, con los mismos
  permisos) y actualiza `META_ACCESS_TOKEN` en `~/carrusel/.env` + `docker compose up -d`.
- **DMs con el bot caído** (deploy, reinicio): al arrancar, el bot revisa las conversaciones de las
  últimas 24 h. Las preguntas y los links con @ se procesan, pero Instagram **no entrega los posts
  compartidos** por esa vía. Por esos te escribe por DM pidiendo que los reenvíes.
- **Respaldo**: cada guardado queda en GitHub. El índice se reconstruye con
  `docker compose exec kb npx tsx src/kb/cli.ts reindex`, pero la cola y el cupo de hashtags no.
- **Volver al Mac**: `docker compose down` en el servidor y `npm run kb:bot` + `ngrok http 8787` en
  el Mac, con `KB_GIT_PUSH=1` en su `.env`.
