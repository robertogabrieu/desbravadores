#!/usr/bin/env bash
# Sobe, mostra, derruba e varre a stack local de UM agente, e roda testes em container descartável.
#
#   agente-stack.sh up [--tipo efemero|validacao] [--espera SEG] [--rebuild]
#                      sem --rebuild só constrói imagem que ainda não existe;
#                      "pré-aquecer" = rodar up uma vez enquanto o código é escrito
#   agente-stack.sh portas
#   agente-stack.sh compose <args>         repassa ao docker compose do projeto (logs, ps, exec)
#   agente-stack.sh testar --<suíte> [--espera SEG] [-- args do runner]
#                      suítes e comandos vêm de scripts/agente-stack.conf.sh
#   agente-stack.sh down                   validação só cai com AGENTE_USUARIO_DECIDIU=1
#   agente-stack.sh liberar                no `gh pr ready`: derruba o efêmero, avisa se há validação
#   agente-stack.sh status
#   agente-stack.sh varrer [--horas N]     derruba efêmeros mais velhos que N horas (padrão 2)
#
# Este arquivo é o NÚCLEO e é igual em todos os projetos que usam o esquema; o que muda de um
# projeto para outro fica em scripts/agente-stack.conf.sh (serviços, passos de subida, testes).
# O projeto compose se chama <prefixo><worktree>; derrubar apaga containers, volumes (banco
# incluso) e rede dele. As imagens base ficam: outros agentes as usam.
set -euo pipefail

# Nesta máquina o `docker` do PATH é um atalho para o docker.exe do Windows, que não recebe as
# variáveis de ambiente do Linux (o tipo da stack e o usuário se perdiam em silêncio). O cliente
# nativo fala com o mesmo Docker Desktop e passa variáveis e caminhos como devem ser.
docker() { /usr/bin/docker "$@"; }

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- contrato com o scripts/agente-stack.conf.sh -----------------------------------------------
AGENTE_PREFIXO=""                 # prefixo do projeto compose, ex.: "iasd-ag-"
AGENTE_PROJETO_REGISTRO=""        # nome do projeto no registro `ambiente`
AGENTE_COMPOSE=()                 # arquivos compose (relativos à raiz), sempre usados
AGENTE_COMPOSE_TESTES=()          # camada extra, usada só nas rodadas de teste
AGENTE_PASTAS=()                  # pastas a criar com o dono certo antes de subir
AGENTE_MEM_UP_MB=2500             # memória livre exigida para subir a stack
AGENTE_HOST_URL="127.0.0.1"       # host das URLs impressas (o projeto pode exigir "localhost")
AGENTE_SUITES=()                  # suítes aceitas por `testar --<nome>`
agente_env_file() { echo ""; }    # arquivo --env-file do compose, se houver
agente_mem_testar() { echo 2200; }  # memória livre exigida por suíte ($1)
# funções que o conf DEVE definir:
#   agente_subir            sequência de subida (usa compose); banco primeiro, se for o caso.
#                           $AGENTE_REBUILD vale "--build" quando o up foi chamado com --rebuild
#   agente_portas           uma linha por porta: rotulo:servico:porta_interna
#                           (o rótulo "frontend" vira a URL do registro de ambientes)
#   agente_testar_<suite>   roda a suíte com os args do runner; o núcleo redireciona a saída para o log

# shellcheck source=/dev/null
source "$RAIZ/scripts/agente-stack.conf.sh"

ETIQUETA="agente.tipo"

projeto() {
  local nome
  nome="$(basename "$RAIZ" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-\n' '-' | cut -c1-30)"
  echo "${AGENTE_PREFIXO}${nome}${AGENTE_SUFIXO:-}"
}

id_no_registro() { echo "${AGENTE_PROJETO_REGISTRO}-stack:$(basename "$RAIZ")"; }

compose() {
  local arquivos=() envf=() f ef
  for f in "${AGENTE_COMPOSE[@]}"; do arquivos+=(-f "$RAIZ/$f"); done
  if [[ "${AGENTE_CAMADA_TESTES:-}" == 1 ]]; then
    for f in "${AGENTE_COMPOSE_TESTES[@]}"; do arquivos+=(-f "$RAIZ/$f"); done
  fi
  ef="$(agente_env_file)"
  [[ -n "$ef" ]] && envf=(--env-file "$ef")
  docker compose "${envf[@]}" -p "$(projeto)" "${arquivos[@]}" "$@"
}

# O Docker cria como root o ponto de montagem que não existe na pasta da worktree (uploads, logs,
# node_modules), e aí nem o usuário apaga a worktree depois nem o container grava nelas.
preparar_pastas() {
  local p
  for p in "${AGENTE_PASTAS[@]}"; do mkdir -p "$RAIZ/$p"; done
}

memoria_livre_mb() { awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo; }

# Segundo agente espera a memória liberar em vez de derrubar o WSL.
esperar_memoria() {
  local precisa="$1" espera="$2" ate=$((SECONDS + $2))
  while (( $(memoria_livre_mb) < precisa )); do
    if (( SECONDS >= ate )); then
      echo "memória livre $(memoria_livre_mb) MB, precisa de $precisa MB; tente com --espera SEG" >&2
      exit 3
    fi
    sleep 10
  done
}

portas() {
  local linha rotulo servico alvo saida
  while IFS= read -r linha; do
    [[ -n "$linha" ]] || continue
    IFS=: read -r rotulo servico alvo <<<"$linha"
    saida="$(compose port "$servico" "$alvo" 2>/dev/null || true)"
    if [[ -n "$saida" ]]; then echo "$rotulo  http://${AGENTE_HOST_URL}:${saida##*:}"; fi
  done < <(agente_portas)
}

# Porta livre do host, para o projeto que precisa saber o endereço do navegador antes de subir
# (ex.: a API confere a origem exata das requisições). Um instante de corrida é aceitável.
porta_livre() {
  python3 -I -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

cmd_up() {
  local tipo=efemero rebuild=() espera=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --rebuild) rebuild=(--build); shift ;;
      --tipo) tipo="$2"; shift 2 ;;
      --espera) espera="$2"; shift 2 ;;
      *) echo "opção desconhecida: $1" >&2; exit 2 ;;
    esac
  done
  [[ "$tipo" == efemero || "$tipo" == validacao ]] || { echo "--tipo: efemero ou validacao" >&2; exit 2; }

  preparar_pastas
  esperar_memoria "$AGENTE_MEM_UP_MB" "$espera"

  export AGENTE_TIPO="$tipo" AGENTE_UID="$(id -u)" AGENTE_GID="$(id -g)" AGENTE_REBUILD="${rebuild[*]:-}"
  agente_subir
  echo "projeto: $(projeto)  tipo: $tipo"
  portas
  registrar_validacao "$tipo"
}

# Só a validação entra no registro de ambientes: é ela que o usuário decide derrubar.
registrar_validacao() {
  [[ "$1" == validacao ]] && command -v ambiente >/dev/null || return 0
  local url
  url="$(portas | awk '$1 == "frontend" {print $2}')"
  ambiente registrar "$(id_no_registro)" --projeto "$AGENTE_PROJETO_REGISTRO" --url "${url:-http://127.0.0.1}" \
    --worktree "$RAIZ" --por "${AGENTE_QUEM:-agente}" --para "${AGENTE_PARA:-validar}" \
    --derrubar "AGENTE_USUARIO_DECIDIU=1 $RAIZ/scripts/agente-stack.sh down" >/dev/null || true
}

# Rodada de testes em container descartável; a rodada inteira cai quando termina, mesmo
# interrompida. A saída vai para um arquivo e a tela mostra só o final, para não encher o
# contexto de quem chamou.
cmd_testar() {
  local alvo="" args=() espera=0 s achou
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --espera) espera="$2"; shift 2 ;;
      --) shift; args+=("$@"); break ;;
      --*)
        achou=0
        for s in "${AGENTE_SUITES[@]}"; do [[ "--$s" == "$1" ]] && { alvo="$s"; achou=1; }; done
        (( achou )) || { echo "suíte desconhecida: $1 (aceitas: ${AGENTE_SUITES[*]})" >&2; exit 2; }
        shift ;;
      *) args+=("$1"); shift ;;
    esac
  done
  [[ -n "$alvo" ]] || { echo "diga a suíte: ${AGENTE_SUITES[*]/#/--}" >&2; exit 2; }
  preparar_pastas
  esperar_memoria "$(agente_mem_testar "$alvo")" "$espera"

  # nome próprio por rodada: duas rodadas da mesma worktree não derrubam uma à outra
  export AGENTE_SUFIXO="-t$$" AGENTE_CAMADA_TESTES=1 AGENTE_TIPO=efemero
  export AGENTE_UID="$(id -u)" AGENTE_GID="$(id -g)"
  local log rc=0
  log="${TMPDIR:-/tmp}/$(projeto)-$alvo.log"
  trap 'compose --profile testes down -v --remove-orphans >/dev/null 2>&1 || true' EXIT INT TERM

  "agente_testar_$alvo" "${args[@]}" >"$log" 2>&1 || rc=$?

  tail -n 25 "$log"
  echo "--- $alvo: saída $rc · log completo em $log"
  exit "$rc"
}

tipo_no_ar() {
  docker ps -a --filter "label=com.docker.compose.project=$(projeto)" \
    --format "{{.Label \"$ETIQUETA\"}}" | sort -u | head -1
}

# Validação é o que o usuário está olhando: só cai com a decisão dele, que chega
# pelo `ambiente derrubar`, e esse comando exporta AGENTE_USUARIO_DECIDIU=1.
cmd_down() {
  if [[ "$(tipo_no_ar)" == validacao && "${AGENTE_USUARIO_DECIDIU:-}" != 1 ]]; then
    echo "recusado: este ambiente é de validação e só cai com a decisão do usuário." >&2
    echo "Marque o uso com 'ambiente usado $(id_no_registro)' e deixe no ar." >&2
    exit 4
  fi
  compose --profile testes down -v --remove-orphans
  if command -v ambiente >/dev/null; then
    ambiente fechar "$(id_no_registro)" --motivo "stack derrubada" >/dev/null 2>&1 || true
  fi
}

# Chamado quando a PR sai do rascunho: o efêmero cai, a validação fica e avisa.
cmd_liberar() {
  case "$(tipo_no_ar)" in
    "") echo "nada no ar para $(projeto)" ;;
    validacao) echo "VALIDACAO_NO_AR: $(id_no_registro) segue no ar até o usuário decidir" ;;
    *) cmd_down; echo "stack efêmera derrubada: $(projeto)" ;;
  esac
}

cmd_status() {
  docker ps -a --filter "label=com.docker.compose.project" \
    --format "{{.Label \"com.docker.compose.project\"}}\t{{.Label \"$ETIQUETA\"}}\t{{.Names}}\t{{.Status}}" \
    | awk -F'\t' -v p="$AGENTE_PREFIXO" 'index($1, p) == 1' | sort
}

cmd_varrer() {
  local horas=2
  [[ "${1:-}" == "--horas" ]] && horas="$2"
  local limite=$((horas * 3600)) agora proj tipo criado idade
  agora="$(date +%s)"
  while IFS=$'\t' read -r proj tipo criado; do
    [[ "$proj" == "$AGENTE_PREFIXO"* ]] || continue
    criado="${criado% *}"   # tira o nome do fuso ("-03") que o date não entende
    idade=$((agora - $(date -d "$criado" +%s)))
    (( idade > limite )) || continue
    if [[ "$tipo" == validacao ]]; then
      echo "validação no ar há $((idade / 3600))h, não derrubo sozinho: $proj"
    else
      echo "derrubando efêmero esquecido há $((idade / 3600))h: $proj"
      docker compose -p "$proj" --profile testes down -v --remove-orphans
    fi
  done < <(docker ps -a --filter "label=com.docker.compose.project" \
    --format "{{.Label \"com.docker.compose.project\"}}\t{{.Label \"$ETIQUETA\"}}\t{{.CreatedAt}}" | sort -u)
}

case "${1:-}" in
  up) shift; cmd_up "$@" ;;
  portas) portas ;;
  compose) shift; export AGENTE_UID="$(id -u)" AGENTE_GID="$(id -g)"; compose "$@" ;;
  down) cmd_down ;;
  liberar) cmd_liberar ;;
  testar) shift; cmd_testar "$@" ;;
  status) cmd_status ;;
  varrer) shift; cmd_varrer "$@" ;;
  *) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
