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

# Troca a linha da variavel no .env, ou a acrescenta se nao existir.
definir_no_env() {
  local variavel="$1" valor="$2"
  if grep -q "^$variavel=" "$ENV_ARQUIVO"; then
    sed -i "s|^$variavel=.*|$variavel=$valor|" "$ENV_ARQUIVO"
  else
    echo "$variavel=$valor" >> "$ENV_ARQUIVO"
  fi
}

# Cria o .env com segredos novos se ele nao existe; se existe, mantem tudo e so acrescenta o
# ARQUIVOS_SEGREDO de antes das fotos. Devolve 0 quando criou agora, 1 quando ja existia.
criar_env_se_faltar() {
  local app_url="$1" web_porta="$2"
  if [ -f "$ENV_ARQUIVO" ]; then
    if ! grep -q '^ARQUIVOS_SEGREDO=' "$ENV_ARQUIVO"; then
      echo "ARQUIVOS_SEGREDO=$(openssl rand -hex 32)" >> "$ENV_ARQUIVO"
      echo "Acrescentado ARQUIVOS_SEGREDO ao $ENV_ARQUIVO."
    fi
    return 1
  fi
  (
    umask 077
    cat > "$ENV_ARQUIVO" <<ENV
POSTGRES_SENHA=$(openssl rand -hex 24)
DB_SENHA=$(openssl rand -hex 24)
JWT_SEGREDO=$(openssl rand -hex 32)
ARQUIVOS_SEGREDO=$(openssl rand -hex 32)
WEB_PORTA=$web_porta
APP_URL=$app_url
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
  )
  return 0
}

# Espera a API migrar o banco e ficar saudavel (ate 3 minutos).
esperar_api() {
  local estado
  echo "Esperando a API migrar o banco e ficar saudavel..."
  for _ in $(seq 1 60); do
    estado="$(compose ps --format '{{.Health}}' api 2>/dev/null || true)"
    [ "$estado" = "healthy" ] && return 0
    sleep 3
  done
  echo "A API nao ficou saudavel em 3 minutos. Veja: docker compose -f docker-compose.prod.yml logs api" >&2
  return 1
}
