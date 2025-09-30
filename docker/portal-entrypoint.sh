#!/usr/bin/env bash
set -euo pipefail

cd /portal

install_deps() {
  local npm_config_previous="${npm_config_production-}"
  export npm_config_production=false
  if [ ! -d node_modules ] || [ ! -f node_modules/.deps_installed ] || \
     [ package-lock.json -nt node_modules/.deps_installed ] || \
     [ package.json -nt node_modules/.deps_installed ]; then
    echo "[portal-entrypoint] Installing dependencies..."
    npm ci || npm install
    date +%s > node_modules/.deps_installed || true
  else
    echo "[portal-entrypoint] Using cached node_modules"
  fi
  if [ -n "$npm_config_previous" ]; then
    export npm_config_production="$npm_config_previous"
  else
    unset npm_config_production
  fi
}

install_deps

export NODE_ENV=${NODE_ENV:-production}

echo "[portal-entrypoint] Building portal for production..."
npm run build

PORT="${PORT:-3001}"
HOST="${HOSTNAME_OVERRIDE:-0.0.0.0}"

echo "[portal-entrypoint] Starting portal in production mode on ${HOST}:${PORT}"
exec npm run start -- --hostname "$HOST" --port "$PORT"
