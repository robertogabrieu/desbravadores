#!/usr/bin/env bash
# Roda a carga oficial (classes, requisitos, especialidades) no container da API.
# Uso: scripts/carga.sh [--forcar]
set -euo pipefail
source "$(dirname "$0")/comum.sh"

compose exec -T api node dist/scripts/carga.js "$@"
