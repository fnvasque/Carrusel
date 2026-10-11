# Bot de la base de conocimiento (npm run kb:bot) para correr always-on en un servidor.
# Multi-arquitectura: sirve en ARM (Oracle Ampere, Raspberry Pi) y x86. Ver deploy/README.md.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg git openssh-client ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp (videos de YouTube → fichas): binario autocontenido según la arquitectura (el archivo
# `yt-dlp` a secas es un zip de Python y la imagen no trae Python). Para actualizarlo, reconstruye
# la imagen sin caché (`docker compose build --no-cache kb`).
RUN case "$(dpkg --print-architecture)" in arm64) a=yt-dlp_linux_aarch64 ;; *) a=yt-dlp_linux ;; esac \
  && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$a" -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && yt-dlp --version

WORKDIR /app
# El bot no usa Chromium (solo generate/reel/remix): no se descarga.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NODE_NO_WARNINGS=1 \
    KB_DIR=/data/knowledge

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY . .

# La base, su índice y la cola viven en el volumen /data (persisten entre deploys).
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["scripts/docker-entrypoint.sh"]
CMD ["npx", "tsx", "src/kb/bot.ts"]
