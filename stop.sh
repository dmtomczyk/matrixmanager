#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/lifecycle-common.sh"

require_docker_compose
load_env_if_present
cd "$MM_ROOT_DIR"

compose_cmd down

echo "Matrix Manager stopped. Data was preserved."
