#!/usr/bin/env bash
set -euo pipefail

MM_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MM_ENV_FILE="${MM_ROOT_DIR}/.env"
MM_DATA_DIR="${MM_ROOT_DIR}/data"
MM_SQLITE_DIR="${MM_DATA_DIR}/sqlite"
MM_APP_DIR="${MM_DATA_DIR}/app"
MM_BACKUPS_DIR="${MM_DATA_DIR}/backups"
MM_FALLBACK_BACKUPS_DIR="${MM_ROOT_DIR}/backups"

require_docker_compose() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is required but not installed or not in PATH." >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "Error: docker compose is required but not available." >&2
    exit 1
  fi
}

load_env_if_present() {
  if [[ -f "$MM_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$MM_ENV_FILE"
    set +a
  fi
}

get_install_mode() {
  printf '%s' "${MATRIX_INSTALL_MODE:-sqlite}"
}

compose_cmd() {
  if [[ "$(get_install_mode)" == "postgresql" ]]; then
    docker compose --profile postgres "$@"
  else
    docker compose "$@"
  fi
}

ensure_runtime_dirs() {
  mkdir -p "$MM_SQLITE_DIR" "$MM_APP_DIR"
  if ! mkdir -p "$MM_BACKUPS_DIR" 2>/dev/null; then
    mkdir -p "$MM_FALLBACK_BACKUPS_DIR"
  fi
}

confirm_or_exit() {
  local prompt="$1"
  local answer
  read -r -p "$prompt [y/N]: " answer
  answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"
  if [[ "$answer" != "y" && "$answer" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
}

wipe_bind_mount_data() {
  rm -f "$MM_SQLITE_DIR"/* 2>/dev/null || true
  rm -f "$MM_APP_DIR"/* 2>/dev/null || true
}
