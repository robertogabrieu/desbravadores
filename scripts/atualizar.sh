#!/usr/bin/env bash
# Atualiza a producao: recusa arvore suja, puxa, reconstroi e sobe. NAO roda a carga (SPEC D13).
set -euo pipefail
source "$(dirname "$0")/comum.sh"

cd "$RAIZ"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "A arvore de trabalho tem alteracoes nao commitadas. Resolva antes de atualizar." >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

git pull --ff-only

# .env de antes das fotos: so o segredo dos links de arquivo e novo (nunca troca um que exista).
[ -f "$ENV_ARQUIVO" ] || { echo "Falta $ENV_ARQUIVO. Rode scripts/deploy.sh primeiro." >&2; exit 1; }
if ! grep -q '^ARQUIVOS_SEGREDO=' "$ENV_ARQUIVO"; then
  exigir_comando openssl "Instale o openssl."
  echo "ARQUIVOS_SEGREDO=$(openssl rand -hex 32)" >> "$ENV_ARQUIVO"
  echo "Acrescentado ARQUIVOS_SEGREDO ao $ENV_ARQUIVO."
fi

compose build
compose up -d
echo "Atualizado. A carga oficial e separada: scripts/carga.sh."
