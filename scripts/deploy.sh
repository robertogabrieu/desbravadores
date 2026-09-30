#!/usr/bin/env bash
# Primeira subida: cria o .env com segredos novos, sobe a stack (a API migra o banco ao iniciar).
# Uso: scripts/deploy.sh [APP_URL]     ex.: scripts/deploy.sh https://desbravadores.exemplo.org
set -euo pipefail
source "$(dirname "$0")/comum.sh"

exigir_comando docker "Instale: https://docs.docker.com/engine/install/"
exigir_comando openssl "Instale o openssl."
docker compose version >/dev/null 2>&1 || { echo "Docker Compose nao encontrado." >&2; exit 1; }

WEB_PORTA_ESCOLHIDA="${WEB_PORTA:-8090}"
if criar_env_se_faltar "${1:-${APP_URL:-http://localhost:$WEB_PORTA_ESCOLHIDA}}" "$WEB_PORTA_ESCOLHIDA"; then
  echo "Criado $ENV_ARQUIVO. Preencha SMTP_*, BACKUP_AGE_DESTINATARIO e RCLONE_REMOTO antes de convidar alguem."
else
  echo "$ENV_ARQUIVO ja existe: mantendo os segredos atuais."
fi

compose up -d --build
esperar_api
echo "Pronto. Proximos passos: scripts/carga.sh e o comando clube:criar (docs)."
