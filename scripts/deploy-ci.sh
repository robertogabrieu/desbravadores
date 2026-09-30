#!/usr/bin/env bash
# Deploy nao interativo, chamado pelo GitHub por dentro da rede privada, na raiz do repositorio.
#
# A primeira instalacao continua sendo o scripts/instalar.sh (porta, segredos, Nginx, carga). Aqui nao
# ha ninguem do outro lado: nada pergunta, nenhum erro e engolido, e o que sobe quebrado volta sozinho
# para a versao anterior. A carga oficial nunca roda aqui (SPEC D13) — o roteiro so avisa quando os
# dados dela mudaram.
#
# O GitHub envia este arquivo e o executa de fora do repositorio: por isso ele nao usa o comum.sh.
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-main}"
ESPERA_SAUDE="${ESPERA_SAUDE:-240}"
BACKUPS_MANTIDOS=10
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

log() { printf '[%s] %s\n' "$(date -u '+%H:%M:%S')" "$*"; }
fim_com_erro() { printf '[%s] ERRO: %s\n' "$(date -u '+%H:%M:%S')" "$*" >&2; exit 1; }

[ -f docker-compose.prod.yml ] || fim_com_erro "rode na raiz do repositorio"
[ -f .env ] || fim_com_erro ".env nao encontrado — rode scripts/instalar.sh uma vez antes"

# Lido linha a linha em vez de executado: o .env tem segredos, e um valor mal citado derrubaria o deploy.
PORTA="$(grep -E '^WEB_PORTA=' .env | tail -1 | cut -d= -f2-)"
PORTA="${PORTA:-8090}"
[[ "$PORTA" =~ ^[0-9]+$ ]] || fim_com_erro "WEB_PORTA no .env nao e um numero ($PORTA)"

# Pela porta do container web, como o Nginx do servidor chega: prova que web, API e banco respondem.
# A API migra o banco ao iniciar, entao a saude respondendo prova tambem as migrations.
# Com versao esperada, so vale se a API disser que esta nesse commit (VERSAO_APP).
aguardar_saude() {
  local limite="$1" esperada="${2:-}" i=0 resposta
  while [ "$i" -lt "$limite" ]; do
    resposta="$(curl -fsS --max-time 5 "http://127.0.0.1:${PORTA}/api/saude" 2>/dev/null || true)"
    if [ -n "$resposta" ] && grep -q '"ok":true' <<<"$resposta"; then
      if [ -z "$esperada" ] || grep -q "\"versao\":\"${esperada}\"" <<<"$resposta"; then
        return 0
      fi
    fi
    i=$((i + 5))
    sleep 5
  done
  return 1
}

subir() {
  VERSAO_APP="$1" "${COMPOSE[@]}" up -d --build
}

ANTES="$(git rev-parse HEAD)"
log "versao no ar: ${ANTES:0:8}"

# O .deployed-commit e as copias do banco sao ignorados pelo git; so o que foi mexido a mao aparece.
ALTERACOES_LOCAIS="$(git status --porcelain --untracked-files=no)"
if [ -n "$ALTERACOES_LOCAIS" ]; then
  log "alteracoes feitas a mao no servidor serao descartadas:"
  printf '%s\n' "$ALTERACOES_LOCAIS"
fi

log "buscando $BRANCH no GitHub"
git fetch --prune origin "$BRANCH"
DEPOIS="$(git rev-parse "origin/${BRANCH}")"

if [ "$ANTES" = "$DEPOIS" ] && [ -z "$ALTERACOES_LOCAIS" ]; then
  # Servidor instalado a mao no commit certo ainda nao tem o .deployed-commit: grava, se estiver no ar.
  if aguardar_saude 30; then
    echo "$DEPOIS" > .deployed-commit
    log "ja esta na versao mais recente"
    exit 0
  fi
  log "na versao mais recente, mas sem responder; subindo de novo"
fi

MUDOU="$(git diff --name-only "$ANTES" "$DEPOIS")"
if grep -q '^docs/planejamento/dados/' <<<"$MUDOU"; then
  log "AVISO: os dados da carga oficial mudaram; depois do deploy, rode scripts/carga.sh no servidor"
fi
# Dados da carga ficam em docs/, mas entram na imagem da API: mudar so eles exige reconstruir.
if [ -n "$MUDOU" ] && ! grep -qvE '^(docs/|[^/]*\.md$)' <<<"$MUDOU" && ! grep -q '^docs/planejamento/dados/' <<<"$MUDOU"; then
  log "so documentacao mudou; atualizando o codigo sem reconstruir"
  git reset --hard "$DEPOIS"
  echo "$DEPOIS" > .deployed-commit
  exit 0
fi

log "garantindo o banco de pe"
"${COMPOSE[@]}" up -d postgres
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U postgres </dev/null >/dev/null 2>&1; then break; fi
  [ "$i" -eq 30 ] && fim_com_erro "o banco nao respondeu em 30s"
  sleep 1
done

# Antes de qualquer coisa: voltar o codigo nao desfaz migration ja aplicada. A copia tem dados de
# menores, entao nasce legivel so pelo usuario de deploy. O </dev/null impede o `exec -T` de consumir
# a entrada padrao do proprio roteiro.
mkdir -p backups
chmod 700 backups
COPIA="backups/pre-deploy-$(date -u '+%Y%m%d-%H%M%S').sql.gz"
log "copia do banco em $COPIA"
(
  umask 077
  "${COMPOSE[@]}" exec -T postgres pg_dump -U postgres desbravador </dev/null | gzip > "$COPIA"
)
[ -s "$COPIA" ] || fim_com_erro "a copia do banco saiu vazia; deploy interrompido antes de mexer em nada"
# O nome leva a data, entao a ordem do nome e a ordem do tempo.
find backups -maxdepth 1 -name 'pre-deploy-*.sql.gz' | sort -r | tail -n "+$((BACKUPS_MANTIDOS + 1))" | xargs -r rm -f

log "aplicando ${DEPOIS:0:8}"
git log --oneline "$ANTES".."$DEPOIS" || true
git reset --hard "$DEPOIS"

voltar() {
  log "$1; voltando para ${ANTES:0:8}"
  "${COMPOSE[@]}" logs --tail 60 api || true
  git reset --hard "$ANTES"
  subir "$ANTES" || fim_com_erro "o retorno tambem falhou — o app precisa de socorro manual. Banco em $COPIA"
  if aguardar_saude 180 "$ANTES"; then
    fim_com_erro "$2; o servidor voltou para a versao anterior. Banco em $COPIA"
  fi
  fim_com_erro "o app nao responde nem na versao anterior — socorro manual. Banco em $COPIA"
}

subir "$DEPOIS" || voltar "a construcao falhou" "versao nova nao subiu"

log "esperando o app responder na versao nova (ate ${ESPERA_SAUDE}s)"
if aguardar_saude "$ESPERA_SAUDE" "$DEPOIS"; then
  echo "$DEPOIS" > .deployed-commit
  log "no ar: ${DEPOIS:0:8}"
  exit 0
fi
voltar "o app nao respondeu na versao nova" "versao nova subiu quebrada"
