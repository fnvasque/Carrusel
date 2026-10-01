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

## Operación

```bash
ssh ubuntu@<ip>
cd ~/carrusel
docker compose ps                  # estado (kb debe estar "healthy")
docker compose logs -f kb          # logs del bot
docker compose restart kb          # reiniciar
```

- **Actualizar el código** (después de mergear cambios en `main`), desde el Mac:
  `scripts/deploy-to-server.sh ubuntu@<ip> --update`.
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
