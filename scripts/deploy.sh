#!/usr/bin/env bash
# Primeira subida: cria o .env com segredos novos, sobe a stack (a API migra o banco ao iniciar).
# Uso: scripts/deploy.sh [APP_URL]     ex.: scripts/deploy.sh https://desbravadores.exemplo.org
set -euo pipefail
source "$(dirname "$0")/comum.sh"

exigir_comando docker "Instale: https://docs.docker.com/engine/install/"
exigir_comando openssl "Instale o openssl."
docker compose version >/dev/null 2>&1 || { echo "Docker Compose nao encontrado." >&2; exit 1; }

if [ -f "$ENV_ARQUIVO" ]; then
  echo "$ENV_ARQUIVO ja existe: mantendo os segredos atuais."
  # .env de antes das fotos: so o segredo dos links de arquivo e novo.
  if ! grep -q '^ARQUIVOS_SEGREDO=' "$ENV_ARQUIVO"; then
    echo "ARQUIVOS_SEGREDO=$(openssl rand -hex 32)" >> "$ENV_ARQUIVO"
    echo "Acrescentado ARQUIVOS_SEGREDO ao $ENV_ARQUIVO."
  fi
else
  WEB_PORTA_ESCOLHIDA="${WEB_PORTA:-8090}"
  APP_URL_ESCOLHIDA="${1:-${APP_URL:-http://localhost:$WEB_PORTA_ESCOLHIDA}}"
  umask 077
  cat > "$ENV_ARQUIVO" <<ENV
POSTGRES_SENHA=$(openssl rand -hex 24)
DB_SENHA=$(openssl rand -hex 24)
JWT_SEGREDO=$(openssl rand -hex 32)
ARQUIVOS_SEGREDO=$(openssl rand -hex 32)
WEB_PORTA=$WEB_PORTA_ESCOLHIDA
APP_URL=$APP_URL_ESCOLHIDA
COOKIE_SECURE=true
TRUST_PROXY=2
SMTP_HOST=smtp.exemplo.org
SMTP_PORTA=587
SMTP_USUARIO=
SMTP_SENHA=
SMTP_FROM="Desbravadores <nao-responda@exemplo.org>"
BACKUP_AGE_DESTINATARIO=
RCLONE_REMOTO=
ENV
  echo "Criado $ENV_ARQUIVO. Preencha SMTP_*, BACKUP_AGE_DESTINATARIO e RCLONE_REMOTO antes de convidar alguem."
fi

compose up -d --build
echo "Esperando a API migrar o banco e ficar saudavel..."
for _ in $(seq 1 60); do
  estado="$(compose ps --format '{{.Health}}' api 2>/dev/null || true)"
  [ "$estado" = "healthy" ] && { echo "Pronto. Proximos passos: scripts/carga.sh e o comando clube:criar (docs)."; exit 0; }
  sleep 3
done
echo "A API nao ficou saudavel em 3 minutos. Veja: docker compose -f docker-compose.prod.yml logs api" >&2
exit 1
