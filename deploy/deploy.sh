#!/usr/bin/env bash
# On-host deployment lifecycle for the vxtpl production stack. Invoked by CI
# (deploy.yml / rollback.yml) after the image build. Single-stack, prod only
# (ADR-002). worker02 is a data-array box, so a full-stack pull + up -d is fine.
#
#   bash deploy.sh all       # directories -> start -> verify
#   bash deploy.sh start     # pull image (GHCR primary, ACR fallback) + up -d
#   bash deploy.sh verify    # health check
#
# The image tag + registries come from the environment CI sets:
#   IMAGE_REGISTRY / IMAGE_NAMESPACE / IMAGE_TAG (primary = GHCR),
#   FALLBACK_IMAGE_REGISTRY / FALLBACK_IMAGE_NAMESPACE (ACR).
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"     # /srv/md0/vxtpl
ENV_FILE="$ROOT/etc/.env"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"

# CI passes PRODUCT_CODE explicitly; the default keeps a bare on-host run working.
PRODUCT_CODE="${PRODUCT_CODE:-vxtpl}"
PRODUCT_CODE_SNAKE="${PRODUCT_CODE//-/_}"
IMAGE_NAME="${PRODUCT_CODE}-app"
PROJECT_NAME="${PRODUCT_CODE}"
# The port the app listens on INSIDE the container. A LITERAL, matching the
# registry allocation and every other product on this host (atlas 3100, runos
# 3120, arda 3230). `verify` reaches it with `docker exec`, so it is the
# container side that matters here, never the published one.
#
# This was briefly read from the environment, and that is exactly how the
# 2026-08-17 deploy came to report a health failure against a container Docker
# had already marked healthy: CI does not export APP_PUBLISH_PORT over SSH, so
# the shell fell back to the default while the container listened on the
# operator .env's value. A constant cannot drift out of step with itself.
APP_CONTAINER_PORT=4000

# The published side, for the log only. If it ever disagrees with what the edge
# proxies to, that is the whole failure mode - so print it rather than leave the
# operator to infer it. Digits only, so quoting, spaces, CRLF and trailing
# comments fall away; last assignment wins, as the file itself means.
published_port() {
  local line=""
  if [ -f "$ENV_FILE" ]; then
    line="$(grep -E '^[[:space:]]*APP_PUBLISH_PORT[[:space:]]*=' "$ENV_FILE" | tail -n 1)"
  fi
  # Digits only, so quoting, spaces, a CRLF ending and a trailing comment all
  # fall away. No sed backreference: this file is copied into other repos, and
  # a backslash escape that survives one editor and not the next is how a
  # working script becomes a silently empty one.
  local v="$(printf '%s' "$line" | grep -oE '[0-9]+' | head -n 1)"
  printf '%s' "${v:-${APP_PUBLISH_PORT:-4000}}"
}
APP_PUBLISHED_PORT="$(published_port)"
# Persistent data lives OUTSIDE the deploy dir (which is rsync --delete'd on every
# deploy) - container-written data is root-owned and would otherwise break the
# next deploy's rsync. Absolute path under the stack root.
DATA_DIR="${DATA_DIR:-$ROOT/data}"

log() { echo "[deploy] $*"; }

compose() {
  PRODUCT_CODE="$PRODUCT_CODE" \
  PRODUCT_CODE_SNAKE="$PRODUCT_CODE_SNAKE" \
  PROJECT_NAME="$PROJECT_NAME" \
  DATA_DIR="$DATA_DIR" \
  APP_ENV_FILE="$ENV_FILE" \
  IMAGE_REGISTRY="${IMAGE_REGISTRY:-ghcr.io}" \
  IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-vxture}" \
  IMAGE_TAG="${IMAGE_TAG:-latest}" \
  docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

cmd_environment() {
  test -f "$ENV_FILE" || { log "missing $ENV_FILE"; exit 1; }
  test -f "$COMPOSE_FILE" || { log "missing $COMPOSE_FILE"; exit 1; }
  log "environment OK ($ROOT; container :${APP_CONTAINER_PORT}, published :${APP_PUBLISHED_PORT})"
}

cmd_directories() {
  mkdir -p "$DATA_DIR/redis" "$DATA_DIR/db"
  log "directories ready ($DATA_DIR)"
}

cmd_start() {
  local reg="${IMAGE_REGISTRY:-ghcr.io}" ns="${IMAGE_NAMESPACE:-vxture}" tag="${IMAGE_TAG:-latest}"
  local primary="${reg}/${ns}/${IMAGE_NAME}:${tag}"
  log "pulling ${primary}"
  if ! docker pull "$primary"; then
    local fb="${FALLBACK_IMAGE_REGISTRY:-}/${FALLBACK_IMAGE_NAMESPACE:-}/${IMAGE_NAME}:${tag}"
    log "primary pull failed; trying fallback ${fb}"
    docker pull "$fb"
    docker tag "$fb" "$primary"
  fi
  # Data-array box: full-stack recreate is fine.
  compose pull redis db || true
  compose up -d
  log "started"
}

cmd_verify() {
  local tries=0
  until [ "$tries" -ge 20 ]; do
    if docker exec "${PROJECT_NAME}-app" wget -qO- "http://127.0.0.1:${APP_CONTAINER_PORT}/api/health" >/dev/null 2>&1; then
      log "verify OK (health 200 on container :${APP_CONTAINER_PORT}, published :${APP_PUBLISHED_PORT})"
      return 0
    fi
    tries=$((tries + 1))
    sleep 3
  done
  log "verify FAILED: /api/health not healthy on container :${APP_CONTAINER_PORT} (published :${APP_PUBLISHED_PORT})"
  compose ps
  exit 1
}

cmd_all() {
  cmd_environment
  cmd_directories
  cmd_start
  cmd_verify
}

case "${1:-}" in
  all)         cmd_all ;;
  environment) cmd_environment ;;
  directories) cmd_directories ;;
  start)       cmd_start ;;
  verify)      cmd_verify ;;
  *) echo "usage: bash deploy.sh {all|environment|directories|start|verify}"; exit 1 ;;
esac
