#!/usr/bin/env bash
set -euo pipefail

APP_NAME="lh-order-tiktok-helper"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DO_PULL=1

if [[ "${1:-}" == "--no-pull" ]]; then
  DO_PULL=0
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose is not installed." >&2
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f ".env" ]]; then
  echo ".env file not found in $APP_DIR" >&2
  echo "Copy .env.example to .env and set MONGODB_URI / DATABASE_NAME first." >&2
  exit 1
fi

echo "[$APP_NAME] using compose command: ${COMPOSE_CMD[*]}"

if [[ "$DO_PULL" -eq 1 ]]; then
  echo "[$APP_NAME] pulling latest code from git..."
  git pull --ff-only
else
  echo "[$APP_NAME] skipping git pull"
fi

echo "[$APP_NAME] rebuilding container..."
"${COMPOSE_CMD[@]}" build

echo "[$APP_NAME] starting service..."
"${COMPOSE_CMD[@]}" up -d

echo "[$APP_NAME] current status:"
"${COMPOSE_CMD[@]}" ps

echo "[$APP_NAME] health check:"
curl --fail --silent http://127.0.0.1:6600/api/tiktok-settled-sales/health || {
  echo
  echo "Health check failed." >&2
  exit 1
}

echo
echo "[$APP_NAME] deploy completed successfully."
