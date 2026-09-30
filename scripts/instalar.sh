#!/usr/bin/env bash
# Instala o app em producao num comando: .env com segredos, porta livre na VPS, stack no ar, carga
# oficial, primeiro clube e, com --nginx, o site no Nginx do servidor com HTTPS (certbot).
#
#   scripts/instalar.sh [--nginx dominio] [--email-certbot email] [--carga]
#                       [--clube-nome N --clube-slug S --adm-nome N --adm-email E]
#
# Rodar de novo e seguro: mantem o .env, a porta escolhida e o certificado. A carga so roda na
# primeira instalacao ou com --carga (ela e idempotente, mas fora do deploy automatico — SPEC D13).
set -euo pipefail
source "$(dirname "$0")/comum.sh"

PORTA_PADRAO=8090
PORTA_MAXIMA=8190

uso() {
  sed -n '5,6p' "${BASH_SOURCE[0]}" | sed 's/^# *//' >&2
  exit 2
}

erro() {
  echo "Erro: $*" >&2
  exit 1
}

como_root() {
  echo "[sudo] $1"
  shift
  sudo "$@"
}

dominio=""
email_certbot=""
forcar_carga=0
clube_nome=""
clube_slug=""
adm_nome=""
adm_email=""
while [ $# -gt 0 ]; do
  case "$1" in
    --nginx) [ $# -ge 2 ] || uso; dominio="$2"; shift 2 ;;
    --email-certbot) [ $# -ge 2 ] || uso; email_certbot="$2"; shift 2 ;;
    --carga) forcar_carga=1; shift ;;
    --clube-nome) [ $# -ge 2 ] || uso; clube_nome="$2"; shift 2 ;;
    --clube-slug) [ $# -ge 2 ] || uso; clube_slug="$2"; shift 2 ;;
    --adm-nome) [ $# -ge 2 ] || uso; adm_nome="$2"; shift 2 ;;
    --adm-email) [ $# -ge 2 ] || uso; adm_email="$2"; shift 2 ;;
    *) uso ;;
  esac
done

# O clube e tudo ou nada: com metade dos dados, o clube:criar falharia depois da stack ja no ar.
dados_do_clube="$clube_nome$clube_slug$adm_nome$adm_email"
if [ -n "$dados_do_clube" ] && { [ -z "$clube_nome" ] || [ -z "$clube_slug" ] || [ -z "$adm_nome" ] || [ -z "$adm_email" ]; }; then
  erro "para criar o clube, informe --clube-nome, --clube-slug, --adm-nome e --adm-email juntos."
fi

# --- 1. Ferramentas e DNS (tudo que pode barrar o Nginx e conferido antes de construir qualquer coisa) ---
exigir_comando docker "Instale: https://docs.docker.com/engine/install/"
exigir_comando openssl "Instale o openssl."
docker compose version >/dev/null 2>&1 || erro "o Docker Compose nao esta disponivel."

if [ -n "$dominio" ]; then
  [[ "$dominio" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] || erro "--nginx espera so o dominio (ex.: desbravadores.exemplo.org), sem https:// e sem barra."
  exigir_comando nginx "O Nginx nao esta instalado neste servidor."
  exigir_comando certbot "Instale: sudo apt install certbot python3-certbot-nginx"
  exigir_comando sudo "O sudo e necessario para configurar o Nginx."

  enderecos_dominio="$(getent ahostsv4 "$dominio" | awk '{print $1}' | sort -u || true)"
  [ -n "$enderecos_dominio" ] || erro "o dominio $dominio ainda nao existe no DNS. Crie um registro A apontando \
para o IP publico deste servidor, espere propagar e rode de novo."
  enderecos_locais="$(hostname -I 2>/dev/null || true)"
  if command -v curl >/dev/null 2>&1; then
    enderecos_locais="$enderecos_locais $(curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  fi
  aponta_para_ca=0
  for endereco in $enderecos_dominio; do
    for local in $enderecos_locais; do
      [ "$endereco" = "$local" ] && aponta_para_ca=1
    done
  done
  [ "$aponta_para_ca" -eq 1 ] || erro "o dominio $dominio aponta para $(tr '\n' ' ' <<< "$enderecos_dominio"), que nao e \
este servidor ($enderecos_locais). Corrija o registro A, espere propagar e rode de novo."
fi

# --- 2. Porta do host ---
# A VPS e compartilhada: a porta vem antes do .env e do Nginx, que apontam para ela.
portas_ocupadas() {
  local nosso
  nosso="$(compose ps -q web 2>/dev/null || true)"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://'
  fi
  # Portas publicadas por outros containers (o nosso nao conta: e a porta que queremos manter).
  docker ps --no-trunc --format '{{.ID}} {{.Ports}}' 2>/dev/null | while read -r id portas; do
    case "$nosso" in "$id"*) continue ;; esac
    echo "$portas" | grep -oE ':[0-9]+->' | sed 's/[^0-9]//g' || true
  done
}

# Lida uma vez: com pipefail, `lista | grep -q` pode dar falso negativo (o grep sai cedo e a lista leva SIGPIPE).
OCUPADAS="$(portas_ocupadas || true)"
porta_ocupada() {
  grep -qx "$1" <<< "$OCUPADAS"
}

porta_atual=""
if [ -f "$ENV_ARQUIVO" ]; then
  porta_atual="$(grep -E '^WEB_PORTA=' "$ENV_ARQUIVO" | cut -d= -f2 || true)"
fi
nosso_web="$(compose ps -q web 2>/dev/null || true)"
if [ -n "$porta_atual" ] && { [ -n "$nosso_web" ] || ! porta_ocupada "$porta_atual"; }; then
  porta="$porta_atual"
elif [ -n "$porta_atual" ]; then
  erro "a porta $porta_atual, gravada em $ENV_ARQUIVO, esta ocupada por outro processo. Libere a porta, ou apague \
a linha WEB_PORTA do .env para o instalador escolher outra."
else
  porta=""
  for candidata in $(seq "$PORTA_PADRAO" "$PORTA_MAXIMA"); do
    porta_ocupada "$candidata" || { porta="$candidata"; break; }
  done
  [ -n "$porta" ] || erro "nenhuma porta livre entre $PORTA_PADRAO e $PORTA_MAXIMA. Defina WEB_PORTA=<porta> no .env."
fi
echo "Porta do host: $porta."

# --- 3. .env ---
if [ -n "$dominio" ]; then
  app_url="https://$dominio"
else
  app_url="${APP_URL:-http://localhost:$porta}"
fi
primeira_instalacao=0
if criar_env_se_faltar "$app_url" "$porta"; then
  primeira_instalacao=1
  echo "Criado $ENV_ARQUIVO com segredos novos."
else
  echo "Mantendo os segredos de $ENV_ARQUIVO."
  [ "$porta_atual" = "$porta" ] || definir_no_env WEB_PORTA "$porta"
  # Com --nginx, o endereco do app tem de ser o do dominio: os links dos e-mails usam o APP_URL.
  if [ -n "$dominio" ] && ! grep -qxF "APP_URL=$app_url" "$ENV_ARQUIVO"; then
    definir_no_env APP_URL "$app_url"
    echo "APP_URL ajustado para $app_url."
  fi
fi

# --- 4. Stack ---
compose up -d --build
esperar_api

# --- 5. Carga oficial ---
if [ "$primeira_instalacao" -eq 1 ] || [ "$forcar_carga" -eq 1 ]; then
  "$RAIZ/scripts/carga.sh"
else
  echo "Carga oficial nao rodada (ja instalado). Para rodar: scripts/instalar.sh --carga, ou scripts/carga.sh."
fi

# --- 6. Primeiro clube ---
if [ -n "$dados_do_clube" ]; then
  compose exec -T api node dist/scripts/clube-criar.js \
    --nome "$clube_nome" --slug "$clube_slug" --adm-nome "$adm_nome" --adm-email "$adm_email" </dev/null
fi

# --- 7. Nginx do servidor e HTTPS ---
if [ -n "$dominio" ]; then
  site_disponivel="/etc/nginx/sites-available/$dominio"
  site_habilitado="/etc/nginx/sites-enabled/$dominio"

  if sudo test -f "$site_disponivel" && sudo grep -q 'managed by Certbot' "$site_disponivel"; then
    # O certbot reescreveu o arquivo: so a porta do proxy_pass pode mudar; o resto e dele.
    portas_no_proxy="$(sudo grep -oE 'proxy_pass +http://127\.0\.0\.1:[0-9]+' "$site_disponivel" | grep -oE '[0-9]+$' | sort -u || true)"
    if [ -n "$portas_no_proxy" ] && [ "$portas_no_proxy" != "$porta" ]; then
      como_root "Apontando o proxy_pass de $site_disponivel para a porta $porta." \
        sed -i -E "s#(proxy_pass +http://127\.0\.0\.1:)[0-9]+#\1$porta#" "$site_disponivel"
      como_root "Conferindo a configuracao do Nginx (nginx -t)." nginx -t || erro "o Nginx recusou a nova porta (mensagem acima)."
      como_root "Recarregando o Nginx." systemctl reload nginx
    else
      echo "$site_disponivel ja tem certificado e aponta para a porta $porta: mantido."
    fi
  else
    gerado="$(mktemp)"
    trap 'rm -f "$gerado"' EXIT
    sed -e "s/__DOMINIO__/$dominio/g" -e "s/__PORTA__/$porta/g" "$RAIZ/scripts/nginx-host.conf" > "$gerado"
    anterior=""
    if sudo test -f "$site_disponivel"; then
      anterior="$(mktemp)"
      sudo cp "$site_disponivel" "$anterior"
    fi

    como_root "Criando a pasta de logs /var/log/nginx/desbravadores." install -d -m 0755 -o root -g adm /var/log/nginx/desbravadores
    como_root "Instalando a rotacao de logs (30 dias)." install -m 0644 "$RAIZ/scripts/nginx-host-logrotate" /etc/logrotate.d/desbravadores
    como_root "Gravando $site_disponivel." install -m 0644 "$gerado" "$site_disponivel"
    como_root "Habilitando o site." ln -sf "$site_disponivel" "$site_habilitado"

    if ! como_root "Conferindo a configuracao do Nginx (nginx -t)." nginx -t; then
      # Volta ao que era antes, para nao deixar o Nginx dos outros sites sem conseguir recarregar.
      if [ -n "$anterior" ]; then
        sudo install -m 0644 "$anterior" "$site_disponivel"
      else
        sudo rm -f "$site_disponivel" "$site_habilitado"
      fi
      erro "o Nginx recusou a configuracao (mensagem acima). Nada foi recarregado."
    fi
    como_root "Recarregando o Nginx (os outros sites continuam no ar)." systemctl reload nginx

    certbot_args=(--nginx -d "$dominio" --redirect)
    if [ -n "$email_certbot" ]; then
      certbot_args+=(-m "$email_certbot" --agree-tos --no-eff-email --non-interactive)
    fi
    if ! como_root "Pedindo o certificado HTTPS de $dominio (certbot)." certbot "${certbot_args[@]}"; then
      erro "o certbot nao conseguiu o certificado. O site ficou em HTTP, e o login nao se mantem sem HTTPS \
(COOKIE_SECURE=true). Corrija o problema acima e rode de novo com --nginx $dominio."
    fi
  fi
fi

# --- 8. Resumo ---
carregar_env
echo
echo "Instalado. Endereco: $APP_URL (porta do host $porta)."
if [ -z "$dominio" ]; then
  echo "Sem --nginx: configure o proxy HTTPS do servidor para 127.0.0.1:$porta, com client_max_body_size 21m"
  echo "(modelo em scripts/nginx-host.conf), ou rode de novo com --nginx <dominio>."
fi
grep -q '^SMTP_HOST=smtp.exemplo.org' "$ENV_ARQUIVO" && echo "Falta: preencher SMTP_* no .env (convites e senhas) e rodar scripts/atualizar.sh."
grep -q '^BACKUP_AGE_DESTINATARIO=$' "$ENV_ARQUIVO" && echo "Falta: BACKUP_AGE_DESTINATARIO e RCLONE_REMOTO no .env, para o scripts/backup.sh."
exit 0
