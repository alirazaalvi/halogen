#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v podman >/dev/null 2>&1; then
  podman compose up -d --build
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose up -d --build
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d --build
else
  echo "No compose runtime found. Install Podman Compose, Docker Compose, or docker-compose." >&2
  exit 1
fi

echo "Database container is starting."
