#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/lifecycle-common.sh"

require_docker_compose
load_env_if_present
cd "$MM_ROOT_DIR"

cat <<'EOF'
This will reset Matrix Manager application data.
It will remove:
- SQLite data
- control DB / user accounts / audit history / DB connection configs
- bundled PostgreSQL volume data

It will preserve:
- .env
- Docker/compose files
- installer/runtime scripts
EOF

confirm_or_exit "Reset Matrix Manager data?"

compose_cmd down -v --remove-orphans || true
wipe_bind_mount_data
ensure_runtime_dirs

echo "Matrix Manager data reset complete."
echo "You can now run ./start.sh or ./install.sh again."
