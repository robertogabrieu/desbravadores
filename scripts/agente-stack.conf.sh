# Configuração do Desbravadores para scripts/agente-stack.sh (o núcleo é igual em todo projeto).
# shellcheck shell=bash

AGENTE_PREFIXO="desb-ag-"
AGENTE_PROJETO_REGISTRO="desbravadores"
AGENTE_COMPOSE=(docker-compose.agente.yml)
AGENTE_COMPOSE_TESTES=(docker-compose.agente-testes.yml)
AGENTE_PASTAS=(node_modules apps/api/node_modules apps/web/node_modules)
AGENTE_MEM_UP_MB=3200     # banco 512 + e-mail 96 + app 2 GB; o pico do Vite só acontece na partida
AGENTE_HOST_URL="localhost"   # a API monta links com a origem exata (http://localhost:<porta>)
AGENTE_SUITES=(api web shared)

agente_mem_testar() {
  case "$1" in
    api) echo 3400 ;;   # app de testes 2 GB + Postgres descartável em memória 1 GB
    *) echo 2200 ;;
  esac
}

# O código chega montado, então o que o `npm install` normal faria (compilar o packages/shared e
# gerar o client do Prisma) roda aqui, antes de qualquer coisa que dependa deles.
preparar_codigo() {
  compose run --rm --no-deps "$1" sh -c 'npm run build -w packages/shared && npx -w api prisma generate'
}

# Banco primeiro; depois o código gerado, as migrations, a carga oficial e um clube de QA com o
# administrador convidado (o link do convite sai no fim); só então a API e o Vite. A porta do
# navegador é escolhida aqui porque os links do convite usam a origem exata.
agente_subir() {
  AGENTE_PORTA_WEB="$(porta_livre)"
  export AGENTE_PORTA_WEB
  # A API roda com `node --watch --env-file-if-exists=../../.env`: se o arquivo não existe, o
  # --watch tenta vigiá-lo e derruba o processo com ENOENT. Vazio basta; as variáveis vêm do compose.
  [[ -e "$RAIZ/.env" ]] || : >"$RAIZ/.env"
  compose up -d --wait --wait-timeout 300 postgres mailpit
  preparar_codigo app
  compose run --rm --no-deps app sh -c \
    'cd apps/api && npx prisma migrate deploy && npm run carga && npm run clube:criar -- --nome "Clube QA" --slug clube-qa --adm-nome "Adm QA" --adm-email adm@qa.local'
  # shellcheck disable=SC2086
  compose up -d --wait --wait-timeout 300 ${AGENTE_REBUILD:-} app
}

agente_portas() {
  printf '%s\n' frontend:app:5173 api:app:3001 mailpit:mailpit:8025
}

# API: Jest com Postgres descartável (o globalSetup cria um banco por execução e roda as migrations).
agente_testar_api() {
  compose up -d --wait --wait-timeout 300 postgres
  preparar_codigo testes
  compose run --rm --no-deps testes sh -c 'cd apps/api && exec npx jest --cacheDirectory /app/.jest-cache --forceExit "$@"' _ "$@"
}

# Web: Vitest com jsdom, sem banco. O ponta a ponta (Playwright) não roda aqui: só no CI.
agente_testar_web() {
  preparar_codigo testes
  compose run --rm --no-deps testes sh -c 'cd apps/web && exec npx vitest run "$@"' _ "$@"
}

# Contratos compartilhados, sem banco.
agente_testar_shared() {
  compose run --rm --no-deps testes sh -c 'cd packages/shared && exec npx vitest run "$@"' _ "$@"
}
