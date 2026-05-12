#!/usr/bin/env bash
set -euo pipefail

REPO="${QRATING_REPO:-brightcolor/qrating}"
INSTALL_DIR="${QRATING_DIR:-/opt/qrating}"
REQUESTED_ADMIN_APP_URL="${QRATING_ADMIN_APP_URL:-}"
REQUESTED_FEEDBACK_APP_URL="${QRATING_FEEDBACK_APP_URL:-}"
REQUESTED_PUBLIC_APP_URL="${QRATING_PUBLIC_URL:-}"
ADMIN_APP_URL="${REQUESTED_ADMIN_APP_URL:-${REQUESTED_PUBLIC_APP_URL:-https://qrating.app}}"
FEEDBACK_APP_URL="${REQUESTED_FEEDBACK_APP_URL:-${REQUESTED_PUBLIC_APP_URL:-https://qrat.ing}}"
ORGANIZATION_NAME="${QRATING_ORGANIZATION_NAME:-Demo Events}"
ORGANIZATION_SLUG="${QRATING_ORGANIZATION_SLUG:-demo-events}"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Fehlt: $1"
    exit 1
  fi
}

random_hex() {
  openssl rand -hex "$1"
}

env_value() {
  local key="$1"
  if [ ! -f .env ]; then
    return 1
  fi
  grep -E "^${key}=" .env | tail -n1 | cut -d= -f2- || true
}

env_or_default() {
  local key="$1"
  local fallback="$2"
  local current
  current="$(env_value "$key" || true)"
  if [ -n "$current" ]; then
    printf '%s' "$current"
  else
    printf '%s' "$fallback"
  fi
}

set_env() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\/&]/\\&/g')"
  if grep -qE "^${key}=" .env; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

is_weak_value() {
  local value="${1:-}"
  [ -z "$value" ] && return 0
  case "$value" in
    change-me*|qrating|dev-secret-change-me)
      return 0
      ;;
  esac
  return 1
}

clone_or_update_repo() {
  mkdir -p "$(dirname "$INSTALL_DIR")"

  if [ -d "$INSTALL_DIR/.git" ]; then
    echo "Aktualisiere bestehendes Repository: $INSTALL_DIR"
    git -C "$INSTALL_DIR" pull --ff-only
    return
  fi

  if [ -e "$INSTALL_DIR" ]; then
    echo "Ziel existiert, ist aber kein Git-Repository: $INSTALL_DIR"
    exit 1
  fi

  echo "Klone qrating nach $INSTALL_DIR"
  if [[ "$REPO" == http://* || "$REPO" == https://* || "$REPO" == git@* ]]; then
    git clone "$REPO" "$INSTALL_DIR"
  elif [ -n "${GH_TOKEN:-}" ]; then
    git clone "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" "$INSTALL_DIR"
    git -C "$INSTALL_DIR" remote set-url origin "https://github.com/${REPO}.git"
  elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    gh repo clone "$REPO" "$INSTALL_DIR"
  else
    git clone "https://github.com/${REPO}.git" "$INSTALL_DIR"
  fi
}

require_command git
require_command docker
require_command openssl

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose Plugin fehlt. Erwartet wird: docker compose ..."
  exit 1
fi

clone_or_update_repo
cd "$INSTALL_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  ENV_CREATED=1
else
  ENV_CREATED=0
fi

POSTGRES_DB="$(env_value POSTGRES_DB || true)"
POSTGRES_USER="$(env_value POSTGRES_USER || true)"
POSTGRES_PASSWORD="$(env_value POSTGRES_PASSWORD || true)"
SESSION_SECRET="$(env_value SESSION_SECRET || true)"
PRETIX_TOKEN_SECRET="$(env_value PRETIX_TOKEN_SECRET || true)"
EXISTING_PUBLIC_APP_URL="$(env_value PUBLIC_APP_URL || true)"

if [ -z "$REQUESTED_ADMIN_APP_URL" ]; then
  ADMIN_APP_URL="$(env_or_default ADMIN_APP_URL "${REQUESTED_PUBLIC_APP_URL:-${EXISTING_PUBLIC_APP_URL:-$ADMIN_APP_URL}}")"
fi
if [ -z "$REQUESTED_FEEDBACK_APP_URL" ]; then
  FEEDBACK_APP_URL="$(env_or_default FEEDBACK_APP_URL "${REQUESTED_PUBLIC_APP_URL:-${EXISTING_PUBLIC_APP_URL:-$FEEDBACK_APP_URL}}")"
fi

[ -n "$POSTGRES_DB" ] || POSTGRES_DB="qrating"
[ -n "$POSTGRES_USER" ] || POSTGRES_USER="qrating"

if [ "$ENV_CREATED" = "1" ] || is_weak_value "$POSTGRES_PASSWORD"; then
  POSTGRES_PASSWORD="$(random_hex 24)"
fi
if [ "$ENV_CREATED" = "1" ] || is_weak_value "$SESSION_SECRET"; then
  SESSION_SECRET="$(random_hex 48)"
fi
if [ "$ENV_CREATED" = "1" ] || is_weak_value "$PRETIX_TOKEN_SECRET"; then
  PRETIX_TOKEN_SECRET="$(random_hex 32)"
fi

set_env NODE_ENV production
set_env PORT 4000
set_env ADMIN_APP_URL "$ADMIN_APP_URL"
set_env FEEDBACK_APP_URL "$FEEDBACK_APP_URL"
set_env POSTGRES_DB "$POSTGRES_DB"
set_env POSTGRES_USER "$POSTGRES_USER"
set_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
set_env DATABASE_URL "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
set_env SESSION_SECRET "$SESSION_SECRET"
set_env PRETIX_TOKEN_SECRET "$PRETIX_TOKEN_SECRET"
set_env ORGANIZATION_NAME "$ORGANIZATION_NAME"
set_env ORGANIZATION_SLUG "$ORGANIZATION_SLUG"
set_env RATE_LIMIT_WINDOW_MS "$(env_or_default RATE_LIMIT_WINDOW_MS 60000)"
set_env RATE_LIMIT_MAX "$(env_or_default RATE_LIMIT_MAX 30)"
set_env IMAGE_CACHE_MAX_BYTES "$(env_or_default IMAGE_CACHE_MAX_BYTES 5242880)"
set_env WORKER_INTERVAL_MS "$(env_or_default WORKER_INTERVAL_MS 5000)"
set_env PRETIX_SCHEDULER_INTERVAL_MS "$(env_or_default PRETIX_SCHEDULER_INTERVAL_MS 60000)"
set_env BILLING_ADMIN_EMAILS "$(env_or_default BILLING_ADMIN_EMAILS '')"

mkdir -p storage/event-images
chmod 600 .env

cat > .qrating-quickstart-info <<EOF
qrating Quickstart
Install dir: ${INSTALL_DIR}
WebUI URL: ${ADMIN_APP_URL}
Feedback URL: ${FEEDBACK_APP_URL}
Admin URL: ${ADMIN_APP_URL}/admin
Ersteinrichtung: Admin-URL oeffnen und den ersten Owner-Account anlegen.
EOF
chmod 600 .qrating-quickstart-info

docker compose up -d --build

echo
echo "qrating wurde gestartet."
echo "Admin: ${ADMIN_APP_URL}/admin"
echo "Feedback Demo: ${FEEDBACK_APP_URL}/f/${ORGANIZATION_SLUG}"
echo "Ersteinrichtung: Lege den ersten Admin im Browser an."
echo "Installationsinfo: ${INSTALL_DIR}/.qrating-quickstart-info"
