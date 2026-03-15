#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/lifecycle-common.sh"

require_docker_compose
load_env_if_present
cd "$MM_ROOT_DIR"

compose_cmd ps

echo
if command -v curl >/dev/null 2>&1; then
  APP_PORT="${MATRIX_APP_PORT:-8000}"
  if curl --fail --silent "http://127.0.0.1:${APP_PORT}/health" >/dev/null 2>&1; then
    echo "Health endpoint: OK (http://127.0.0.1:${APP_PORT}/health)"
  else
    echo "Health endpoint: not reachable yet (http://127.0.0.1:${APP_PORT}/health)"
  fi
else
  echo "curl not found; skipping HTTP health check."
fi
