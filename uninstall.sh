#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/lifecycle-common.sh"

require_docker_compose
load_env_if_present
cd "$MM_ROOT_DIR"

echo "Choose uninstall mode:"
echo "  1) Uninstall app/runtime, keep data"
echo "  2) Uninstall app/runtime and delete all data"
echo "  3) Cancel"
read -r -p "Selection [1-3]: " selection

case "$selection" in
  1)
    confirm_or_exit "Stop and uninstall containers while preserving data?"
    compose_cmd down --remove-orphans || true
    echo "Containers removed. Data and .env preserved."
    ;;
  2)
    cat <<'EOF'
This will remove:
- containers and networks
- bundled PostgreSQL volume data
- SQLite data
- control DB
- .env
EOF
    confirm_or_exit "Fully uninstall Matrix Manager and delete all data?"
    compose_cmd down -v --remove-orphans || true
    wipe_bind_mount_data
    rm -f "$MM_ENV_FILE"
    echo "Full uninstall complete."
    ;;
  3)
    echo "Canceled."
    exit 0
    ;;
  *)
    echo "Invalid selection." >&2
    exit 1
    ;;
esac
