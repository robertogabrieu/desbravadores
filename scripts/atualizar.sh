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
compose build
compose up -d
echo "Atualizado. A carga oficial e separada: scripts/carga.sh."
