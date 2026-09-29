#!/usr/bin/env bash
# Teste local de backup e restauracao, de ponta a ponta, numa stack de producao propria e descartavel:
# cria dados -> backup.sh (pg_dump | age | rclone para uma pasta) -> restaurar.sh num banco novo ->
# uma segunda API aponta para ele: /api/saude tem banco:true e lista os mesmos desbravadores.
# Precisa de docker, age, age-keygen e rclone. Uso: scripts/testar-backup.sh
set -euo pipefail
source "$(dirname "$0")/comum.sh"

for ferramenta in docker age age-keygen rclone; do
  exigir_comando "$ferramenta" "Instale no ~/.local/bin (binario estatico) e tente de novo."
done

tmp="$(mktemp -d)"
export COMPOSE_PROJECT_NAME="desbravadores-teste-backup"
export ENV_ARQUIVO="$tmp/.env"
porta_web="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"

age-keygen -o "$tmp/chave.txt" 2>/dev/null
destinatario="$(age-keygen -y "$tmp/chave.txt")"
mkdir -p "$tmp/remoto"

cat > "$ENV_ARQUIVO" <<ENV
POSTGRES_SENHA=teste-postgres-$$
DB_SENHA=teste-app-$$
JWT_SEGREDO=$(openssl rand -hex 32)
ARQUIVOS_SEGREDO=$(openssl rand -hex 32)
WEB_PORTA=$porta_web
APP_URL=http://localhost:$porta_web
COOKIE_SECURE=false
TRUST_PROXY=2
BACKUP_AGE_DESTINATARIO=$destinatario
RCLONE_REMOTO=$tmp/remoto
ENV

limpar() {
  compose rm -sf api-restaurada >/dev/null 2>&1 || true
  docker rm -f "$COMPOSE_PROJECT_NAME-api-restaurada" >/dev/null 2>&1 || true
  compose down -v >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap limpar EXIT

# Roda um script Node dentro de um container da API. Entradas: variaveis E2E_*.
no_na_api() { docker exec -i -e "E2E_SENHA=$SENHA" -e "E2E_TOKEN=${TOKEN:-}" "$1" node --input-type=module -; }

SENHA="senha-backup-12345"
compose up -d --build
echo "Esperando a API..."
for _ in $(seq 1 60); do
  [ "$(compose ps --format '{{.Health}}' api)" = "healthy" ] && break
  sleep 3
done
[ "$(compose ps --format '{{.Health}}' api)" = "healthy" ] || { echo "API nao ficou saudavel" >&2; exit 1; }

"$RAIZ/scripts/carga.sh" >/dev/null
saida="$(compose exec -T api node dist/scripts/clube-criar.js --nome "Clube Backup" --slug clube-backup --adm-nome "Admin Backup" --adm-email admin-backup@teste.local)"
token="$(printf '%s' "$saida" | grep -o '/convite/[A-Za-z0-9_-]*' | head -1 | sed 's#/convite/##')"
[ -n "$token" ] || { echo "clube:criar nao imprimiu o link do convite: $saida" >&2; exit 1; }

api_original="$(compose ps -q api)"
lista_original="$(TOKEN="$token" E2E_MODO=semear no_na_api "$api_original" <<'JS'
const base = 'http://localhost:3001/api'
const json = { 'Content-Type': 'application/json' }
const aceitar = await fetch(`${base}/auth/convite/aceitar`, {
  method: 'POST', headers: json, body: JSON.stringify({ token: process.env.E2E_TOKEN, senha: process.env.E2E_SENHA }),
})
const { accessToken } = await aceitar.json()
const auth = { ...json, Authorization: `Bearer ${accessToken}` }
const unidade = await (await fetch(`${base}/unidades`, { method: 'POST', headers: auth, body: JSON.stringify({ nome: 'Unidade Backup' }) })).json()
for (const nome of ['Ana Backup', 'Beto Backup', 'Carla Backup']) {
  const r = await fetch(`${base}/desbravadores`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ nome, nascimento: '2014-03-10', sexo: 'F', entradaEm: '2026-02-01', unidadeId: unidade.id }),
  })
  if (!r.ok) throw new Error(`desbravador ${nome}: ${r.status} ${await r.text()}`)
}
const lista = await (await fetch(`${base}/desbravadores`, { headers: auth })).json()
console.log(lista.itens.map((d) => d.nome).sort().join('|'))
JS
)"
[ "$lista_original" = "Ana Backup|Beto Backup|Carla Backup" ] || { echo "Dados de teste nao foram criados: $lista_original" >&2; exit 1; }

"$RAIZ/scripts/backup.sh"
arquivo="$(ls "$tmp/remoto"/desbravadores-*.dump.age | head -1)"
[ -s "$arquivo" ] || { echo "Nenhum backup chegou ao remoto" >&2; exit 1; }

"$RAIZ/scripts/restaurar.sh" --arquivo "$arquivo" --chave "$tmp/chave.txt" --banco restaurado

# Segunda API, apontada para o banco restaurado, na mesma rede da stack.
docker rm -f "$COMPOSE_PROJECT_NAME-api-restaurada" >/dev/null 2>&1 || true
compose run -d --no-deps --name "$COMPOSE_PROJECT_NAME-api-restaurada" \
  -e "DATABASE_URL=postgresql://desbravador:teste-app-$$@postgres:5432/restaurado" \
  --entrypoint node api dist/main.js >/dev/null
for _ in $(seq 1 30); do
  docker exec "$COMPOSE_PROJECT_NAME-api-restaurada" node -e "fetch('http://localhost:3001/api/saude').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" 2>/dev/null && break
  sleep 2
done

lista_restaurada="$(E2E_MODO=ler no_na_api "$COMPOSE_PROJECT_NAME-api-restaurada" <<'JS'
const base = 'http://localhost:3001/api'
const saude = await (await fetch(`${base}/saude`)).json()
if (saude.banco !== true) throw new Error(`saude sem banco: ${JSON.stringify(saude)}`)
const json = { 'Content-Type': 'application/json' }
const login = await fetch(`${base}/auth/login`, {
  method: 'POST', headers: json, body: JSON.stringify({ email: 'admin-backup@teste.local', senha: process.env.E2E_SENHA }),
})
if (!login.ok) throw new Error(`login no banco restaurado: ${login.status}`)
const { accessToken } = await login.json()
const lista = await (await fetch(`${base}/desbravadores`, { headers: { Authorization: `Bearer ${accessToken}` } })).json()
console.log(lista.itens.map((d) => d.nome).sort().join('|'))
JS
)"

if [ "$lista_restaurada" = "$lista_original" ]; then
  echo "OK: backup restaurado; saude com banco:true e os mesmos desbravadores ($lista_restaurada)."
else
  echo "FALHOU: original='$lista_original' restaurado='$lista_restaurada'" >&2
  exit 1
fi
