#!/usr/bin/env bash
# End-to-end checks against a freshly started Docker Compose stack (PostgreSQL 16).
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080/api}"
WEB_URL="${WEB_URL:-http://localhost:8080}"
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

compose() {
  docker compose "$@"
}

sql() {
  compose exec -T postgres psql -U "${POSTGRES_USER:-qrating}" -d "${POSTGRES_DB:-qrating}" -tAc "$1"
}

wait_for_backend() {
  for _ in $(seq 1 30); do
    if curl -fsS "$BACKEND_URL/health/ready" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  compose logs backend >&2
  fail "backend is not ready"
}

wait_for_backend

echo "Guest page for the dynamic QR code"
curl -fsS -o "$WORK_DIR/guest.json" "$API_URL/public/f/demo-events" || fail "guest page request failed"
grep -q '"status":"ok"' "$WORK_DIR/guest.json" || fail "guest page did not resolve the demo event"

echo "First admin setup with an own organization"
curl -fsS -o /dev/null -D "$WORK_DIR/setup.headers" \
  -H 'content-type: application/json' \
  -d '{"name":"Smoke Owner","email":"owner@example.test","password":"smoke-password-123","organizationName":"Smoke Events"}' \
  "$API_URL/admin/setup/first-admin" || fail "first admin setup failed"
cookie="$(grep -i '^set-cookie: qrating_admin=' "$WORK_DIR/setup.headers" | head -n1 | sed -E 's/^[^:]+: ([^;]+).*/\1/')"
[ -n "$cookie" ] || fail "setup returned no session cookie"

echo "Manual event next to the demo event"
curl -fsS -o /dev/null \
  -H 'content-type: application/json' \
  -H "cookie: $cookie" \
  -d '{"name":"Smoke Event","dateFrom":"2026-01-01T18:00:00.000Z"}' \
  "$API_URL/admin/events" || fail "event creation failed"

echo "Backend restart after the setup"
compose restart backend >/dev/null
wait_for_backend
[ "$(sql 'SELECT count(*) FROM organizations')" = "1" ] || fail "the restart added an organization"
[ "$(sql "SELECT count(*) FROM feedback_forms WHERE name = 'Schnellfeedback'")" = "1" ] || fail "the restart duplicated the demo form"
curl -fsS -o /dev/null "$BACKEND_URL/public/f/smoke-events" || fail "guest page after the restart failed"

echo "Short domain leads to the website, tracking links keep their target"
web_status() {
  curl -sS -o /dev/null -w '%{http_code}' -H "Host: $1" "$WEB_URL$2"
}
[ "$(web_status qrat.ing /)" = "301" ] || fail "qrat.ing/ does not lead to the website"
[ "$(curl -sS -o /dev/null -w '%{redirect_url}' -H 'Host: qrat.ing' "$WEB_URL/")" = "https://qrating.de/" ] \
  || fail "qrat.ing/ leads somewhere else than the website"
[ "$(web_status qrat.ing '/?utm_source=flyer')" = "200" ] || fail "a tracking link on qrat.ing/ was redirected"
[ "$(web_status qrating.de /)" = "200" ] || fail "the website domain was redirected"
[ "$(web_status qrat.ing /f/demo-events)" = "200" ] || fail "the guest page on qrat.ing was redirected"

echo "Smoke test passed"
