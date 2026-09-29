#!/usr/bin/env bash
# Funcoes comuns dos scripts de producao. Uso: source "$(dirname "$0")/comum.sh"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_ARQUIVO="${ENV_ARQUIVO:-$RAIZ/.env}"

# COMPOSE_PROJECT_NAME (se definido) troca o projeto: e assim que o teste de backup usa uma stack propria.
compose() {
  docker compose -f "$RAIZ/docker-compose.prod.yml" --env-file "$ENV_ARQUIVO" "$@"
}

carregar_env() {
  [ -f "$ENV_ARQUIVO" ] || { echo "Falta $ENV_ARQUIVO. Rode scripts/deploy.sh primeiro." >&2; exit 1; }
  set -a
  # shellcheck disable=SC1090
  . "$ENV_ARQUIVO"
  set +a
}

exigir_comando() {
  command -v "$1" >/dev/null 2>&1 || { echo "Comando '$1' nao encontrado. $2" >&2; exit 1; }
}
