#!/usr/bin/env bash
set -euo pipefail

cd /app

install_deps() {
  local npm_config_previous="${npm_config_production-}"
  export npm_config_production=false
  if [ ! -d node_modules ] || [ ! -f node_modules/.deps_installed ] || \
     [ package-lock.json -nt node_modules/.deps_installed ] || \
     [ package.json -nt node_modules/.deps_installed ]; then
    echo "[app-entrypoint] Installing dependencies..."
    npm ci || npm install
    date +%s > node_modules/.deps_installed || true
  else
    echo "[app-entrypoint] Using cached node_modules"
  fi
  if [ -n "$npm_config_previous" ]; then
    export npm_config_production="$npm_config_previous"
  else
    unset npm_config_production
  fi
}

install_deps

if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "[app-entrypoint] Production mode: build then run"
  npm run build
  npm prune --omit=dev || true
  exec node dist/main.js
else
  echo "[app-entrypoint] Development mode: start with watch"
  exec npm run start:dev
fi
