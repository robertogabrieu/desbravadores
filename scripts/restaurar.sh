#!/usr/bin/env bash
# Restaura um backup cifrado num banco NOVO (nunca por cima do atual).
# Uso: scripts/restaurar.sh --arquivo <x.age> --chave <arquivo-da-chave-privada> --banco <novo>
set -euo pipefail
source "$(dirname "$0")/comum.sh"

arquivo="" chave="" banco=""
while [ $# -gt 0 ]; do
  case "$1" in
    --arquivo) arquivo="${2:-}"; shift 2 ;;
    --chave) chave="${2:-}"; shift 2 ;;
    --banco) banco="${2:-}"; shift 2 ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done
[ -n "$arquivo" ] && [ -n "$chave" ] && [ -n "$banco" ] || {
  echo "Uso: scripts/restaurar.sh --arquivo <x.age> --chave <chave-privada> --banco <novo>" >&2
  exit 1
}
[ -f "$arquivo" ] || { echo "Arquivo nao encontrado: $arquivo" >&2; exit 1; }
[ -f "$chave" ] || { echo "Chave nao encontrada: $chave" >&2; exit 1; }
[[ "$banco" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "Nome de banco invalido (use letras minusculas, numeros e _): $banco" >&2; exit 1; }
[ "$banco" != "desbravador" ] || { echo "Restaure num banco novo, nao por cima do atual." >&2; exit 1; }
exigir_comando age "Instale o age (https://github.com/FiloSottile/age/releases)."

compose exec -T postgres createdb -U postgres -O desbravador "$banco"
age -d -i "$chave" "$arquivo" | compose exec -T postgres pg_restore -U postgres -d "$banco" --no-owner --role=desbravador
echo "Restaurado em '$banco'. Para usar: aponte DATABASE_URL da API para ele."
