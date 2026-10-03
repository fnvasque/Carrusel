#!/usr/bin/env bash
# Prepara un servidor Ubuntu (24.04; ARM o x86) para correr el bot. Se corre UNA vez,
# en el servidor, desde el clon del repo:
#
#   git clone https://github.com/fnvasque/Carrusel.git ~/carrusel && ~/carrusel/scripts/server-setup.sh
#
# Instala Docker, agrega swap y genera la clave de deploy con la que el servidor
# sube la base a su repo privado. Luego, desde el Mac: scripts/deploy-to-server.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Instalando Docker…"
sudo apt-get update -qq
sudo apt-get install -y -qq docker.io docker-compose-v2 git unattended-upgrades >/dev/null
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

if ! swapon --show | grep -q .; then
  echo "→ Agregando 2 GB de swap…"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap -q /swapfile && sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

mkdir -p data keys
if [ ! -f keys/kb_deploy ]; then
  ssh-keygen -q -t ed25519 -N "" -C "ia-es-kb servidor $(hostname)" -f keys/kb_deploy
fi

echo
echo "✓ Servidor listo. Clave de deploy (el script del Mac la registra en GitHub sola):"
cat keys/kb_deploy.pub
echo
echo "Siguiente paso, en el Mac:  scripts/deploy-to-server.sh $USER@<ip-del-servidor>"
