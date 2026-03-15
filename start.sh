#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/lifecycle-common.sh"

require_docker_compose
load_env_if_present
ensure_runtime_dirs
cd "$MM_ROOT_DIR"

if [[ ! -f "$MM_ENV_FILE" ]]; then
  echo "Warning: .env not found at $MM_ENV_FILE. Docker Compose will use defaults." >&2
fi

compose_cmd up -d --build

echo "Matrix Manager started ($(get_install_mode) mode)."
echo "Run ./status.sh to inspect health."
