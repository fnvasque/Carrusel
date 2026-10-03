# Bot de la base de conocimiento (npm run kb:bot) para correr always-on en un servidor.
# Multi-arquitectura: sirve en ARM (Oracle Ampere, Raspberry Pi) y x86. Ver deploy/README.md.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg git openssh-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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
