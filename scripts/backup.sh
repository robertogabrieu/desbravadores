#!/usr/bin/env bash
# pg_dump e os arquivos enviados (dentro do container) -> age -> rclone. Apaga do destino o que tem mais de 30 dias.
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

# Fotos e demais arquivos: a pasta ARQUIVOS_DIR da API, tambem so cifrada no disco.
arquivos="${arquivo%.dump.age}.arquivos.tar.age"
compose exec -T api tar -C /app/arquivos -cf - . | age -r "$BACKUP_AGE_DESTINATARIO" -o "$pasta/$arquivos"
[ -s "$pasta/$arquivos" ] || { echo "Backup dos arquivos vazio: abortado." >&2; exit 1; }

rclone copy "$pasta/$arquivo" "$RCLONE_REMOTO"
rclone copy "$pasta/$arquivos" "$RCLONE_REMOTO"
rclone delete "$RCLONE_REMOTO" --min-age 30d
echo "Backup enviado: $arquivo e $arquivos"
