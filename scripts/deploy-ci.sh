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
PORTA="$(grep -E '^WEB_PORTA=' .env | tail -1 | cut -d= -f2- || true)"
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

# O commit que o CI aprovou, e nao a ponta da main: com dois pushes seguidos, a ponta pode ser um
# commit cujos testes ainda rodam. Sem argumento (deploy a mao), vai a ponta.
ALVO="${1:-}"

# O que decide e a versao que a API diz estar no ar, nao o codigo em disco: uma sessao que caiu entre
# o reset e a subida deixa o disco na versao nova com a velha rodando.
versao_no_ar() {
  local resposta
  resposta="$(curl -fsS --max-time 5 "http://127.0.0.1:${PORTA}/api/saude" 2>/dev/null || true)"
  grep -q '"ok":true' <<<"$resposta" || return 0
  grep -oE '"versao":"[0-9a-f]{40}"' <<<"$resposta" | cut -d'"' -f4 || true
}

ANTES="$(git rev-parse HEAD)"

# O .deployed-commit e as copias do banco sao ignorados pelo git; so o que foi mexido a mao aparece.
ALTERACOES_LOCAIS="$(git status --porcelain --untracked-files=no)"
if [ -n "$ALTERACOES_LOCAIS" ]; then
  log "alteracoes feitas a mao no servidor serao descartadas:"
  printf '%s\n' "$ALTERACOES_LOCAIS"
fi

log "buscando $BRANCH no GitHub"
git fetch --prune origin "$BRANCH"
if [ -n "$ALVO" ]; then
  git cat-file -e "${ALVO}^{commit}" 2>/dev/null || fim_com_erro "o commit $ALVO nao existe na $BRANCH"
  git merge-base --is-ancestor "$ALVO" "origin/${BRANCH}" || fim_com_erro "o commit $ALVO nao esta na $BRANCH"
  DEPOIS="$(git rev-parse "${ALVO}^{commit}")"
else
  DEPOIS="$(git rev-parse "origin/${BRANCH}")"
fi

NO_AR="$(versao_no_ar)"
if [ -n "$NO_AR" ] && git cat-file -e "${NO_AR}^{commit}" 2>/dev/null; then
  log "no ar e respondendo: ${NO_AR:0:8}"
  # Rollback vai para o que de fato estava rodando, mesmo que o disco diga outra coisa.
  ANTES="$NO_AR"
else
  NO_AR=""
  log "nenhuma versao conhecida respondendo; o codigo em disco e ${ANTES:0:8}"
fi

if [ "$NO_AR" = "$DEPOIS" ]; then
  git reset --hard "$DEPOIS"
  echo "$DEPOIS" > .deployed-commit
  log "ja esta na versao pedida"
  exit 0
fi

# Jobs terminam fora de ordem (o de um push pode acabar depois do seguinte) e um job antigo pode ser
# rodado de novo: subir um commit mais velho por cima do novo voltaria o codigo com as migrations
# novas ja aplicadas. O pedido ja esta contido no que roda, entao nao ha o que fazer.
if [ -n "$NO_AR" ] && git merge-base --is-ancestor "$DEPOIS" "$NO_AR"; then
  log "o commit ${DEPOIS:0:8} ja esta contido no que roda (${NO_AR:0:8}); nada a fazer"
  exit 0
fi

MUDOU="$(git diff --name-only "$ANTES" "$DEPOIS")"
if grep -q '^docs/planejamento/dados/' <<<"$MUDOU"; then
  log "AVISO: os dados da carga oficial mudaram; depois do deploy, rode scripts/carga.sh no servidor"
fi
# Dados da carga ficam em docs/, mas entram na imagem da API: mudar so eles exige reconstruir.
# O atalho so vale com o app respondendo: sem isso, o que esta no ar nao e conhecido.
if [ -n "$NO_AR" ] && [ -n "$MUDOU" ] && ! grep -qvE '^(docs/|[^/]*\.md$)' <<<"$MUDOU" \
  && ! grep -q '^docs/planejamento/dados/' <<<"$MUDOU"; then
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
