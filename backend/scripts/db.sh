#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="ni-postgres"
IMAGE_NAME="ni-postgres-local"
DB_NAME="neighborhood_intelligence"
DB_USER="postgres"
DB_PASSWORD="postgres"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

start_container() {
  if command -v podman >/dev/null 2>&1; then
    podman run -d \
      --name "$CONTAINER_NAME" \
      -p 5432:5432 \
      -e POSTGRES_USER="$DB_USER" \
      -e POSTGRES_PASSWORD="$DB_PASSWORD" \
      -e POSTGRES_DB="$DB_NAME" \
      "$IMAGE_NAME" >/dev/null || true

    if ! podman ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
      podman start "$CONTAINER_NAME" >/dev/null
    fi

    echo "Started $CONTAINER_NAME with Podman"
  elif command -v docker >/dev/null 2>&1; then
    docker run -d \
      --name "$CONTAINER_NAME" \
      -p 5432:5432 \
      -e POSTGRES_USER="$DB_USER" \
      -e POSTGRES_PASSWORD="$DB_PASSWORD" \
      -e POSTGRES_DB="$DB_NAME" \
      "$IMAGE_NAME" >/dev/null || true

    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
      docker start "$CONTAINER_NAME" >/dev/null
    fi

    echo "Started $CONTAINER_NAME with Docker"
  else
    echo "Neither podman nor docker is installed." >&2
    exit 1
  fi
}

stop_container() {
  if command -v podman >/dev/null 2>&1; then
    podman stop "$CONTAINER_NAME" >/dev/null || true
    echo "Stopped $CONTAINER_NAME"
  elif command -v docker >/dev/null 2>&1; then
    docker stop "$CONTAINER_NAME" >/dev/null || true
    echo "Stopped $CONTAINER_NAME"
  else
    echo "Neither podman nor docker is installed." >&2
    exit 1
  fi
}

status_container() {
  if command -v podman >/dev/null 2>&1; then
    podman ps -a --filter "name=$CONTAINER_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  elif command -v docker >/dev/null 2>&1; then
    docker ps -a --filter "name=$CONTAINER_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  else
    echo "Neither podman nor docker is installed." >&2
    exit 1
  fi
}

logs_container() {
  if command -v podman >/dev/null 2>&1; then
    podman logs -f "$CONTAINER_NAME"
  elif command -v docker >/dev/null 2>&1; then
    docker logs -f "$CONTAINER_NAME"
  else
    echo "Neither podman nor docker is installed." >&2
    exit 1
  fi
}

case "${1:-}" in
  start)
    start_container
    ;;
  stop)
    stop_container
    ;;
  restart)
    stop_container
    start_container
    ;;
  status)
    status_container
    ;;
  logs)
    logs_container
    ;;
  *)
    echo "Usage: ./scripts/db.sh {start|stop|restart|status|logs}" >&2
    exit 1
    ;;
esac
