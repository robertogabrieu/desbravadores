#!/usr/bin/env bash
# pg_dump e os arquivos enviados (lidos do volume) -> age -> rclone. Apaga do destino o que tem mais de 30 dias.
set -euo pipefail
source "$(dirname "$0")/comum.sh"

carregar_env
: "${BACKUP_AGE_DESTINATARIO:?defina BACKUP_AGE_DESTINATARIO no .env}"
: "${RCLONE_REMOTO:?defina RCLONE_REMOTO no .env}"
exigir_comando age "Instale o age (https://github.com/FiloSottile/age/releases)."
exigir_comando rclone "Instale o rclone (https://rclone.org/install/)."

pasta="$(mktemp -d)"
trap 'rm -rf "$pasta"' EXIT
arquivo="desbravadores-$(date +%Y%m%d-%H%M%S).dump.age"

# O dump so existe cifrado: nunca toca o disco em claro.
compose exec -T postgres pg_dump -U desbravador -Fc desbravador | age -r "$BACKUP_AGE_DESTINATARIO" -o "$pasta/$arquivo"
[ -s "$pasta/$arquivo" ] || { echo "Backup vazio: abortado." >&2; exit 1; }

rclone copy "$pasta/$arquivo" "$RCLONE_REMOTO"

# Fotos e demais arquivos: lidos do volume por um container descartavel (nao dependem da API de pe),
# tambem so cifrados no disco. Falha aqui nao desfaz o dump, que ja subiu: sai com erro no fim.
arquivos="${arquivo%.dump.age}.arquivos.tar.age"
projeto="${COMPOSE_PROJECT_NAME:-desbravadores-prod}"
falha_arquivos=""
volume="$(docker volume ls -q --filter "label=com.docker.compose.project=$projeto" --filter "label=com.docker.compose.volume=arquivos" | head -1)"
if [ -z "$volume" ]; then
  falha_arquivos="volume 'arquivos' do projeto $projeto nao encontrado"
elif ! docker run --rm -v "$volume:/dados:ro" alpine tar -C /dados -cf - . | age -r "$BACKUP_AGE_DESTINATARIO" -o "$pasta/$arquivos"; then
  falha_arquivos="tar/age falhou ao ler o volume $volume"
elif [ ! -s "$pasta/$arquivos" ]; then
  falha_arquivos="backup dos arquivos saiu vazio"
elif ! rclone copy "$pasta/$arquivos" "$RCLONE_REMOTO"; then
  falha_arquivos="envio dos arquivos ao remoto falhou"
fi

rclone delete "$RCLONE_REMOTO" --min-age 30d
if [ -n "$falha_arquivos" ]; then
  echo "Backup do banco enviado ($arquivo), mas o dos ARQUIVOS FALHOU: $falha_arquivos." >&2
  exit 1
fi
echo "Backup enviado: $arquivo e $arquivos"
