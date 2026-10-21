#!/usr/bin/env bash
# ============================================================
# start.sh - launches both the FastAPI backend AND the Next.js
# frontend on the same Render web service.
# ============================================================
set -euo pipefail

# Render assigns $PORT for the publicly-exposed service.
# We run Next.js on $PORT and FastAPI on an internal port (8000).
WEB_PORT="${PORT:-3000}"
API_PORT="${API_PORT:-8000}"

# Make sure node_modules/.bin is on PATH (where `next`, `uvicorn` live)
export PATH="$PWD/node_modules/.bin:$PATH"

# Also make sure local Python user bins are on PATH
export PATH="$HOME/.local/bin:$PATH"

echo "[start.sh] PATH=$PATH"
echo "[start.sh] Working dir: $(pwd)"
echo "[start.sh] Node version: $(node --version 2>/dev/null || echo 'node not found')"
echo "[start.sh] Next binary path: $(which next 2>/dev/null || echo 'next not on PATH')"
echo "[start.sh] Uvicorn binary path: $(which uvicorn 2>/dev/null || echo 'uvicorn not on PATH')"

# Tell Next.js where to find the backend.
export BACKEND_URL="http://127.0.0.1:${API_PORT}"

echo "[start.sh] Launching FastAPI backend on port ${API_PORT}…"
uvicorn backend.api:app --host 0.0.0.0 --port "${API_PORT}" --log-level info &
API_PID=$!

# Give the backend a moment to come up before the frontend starts proxying.
sleep 3

echo "[start.sh] Launching Next.js frontend on port ${WEB_PORT}…"
# Use the explicit path to `next` in case it's not on PATH
if [ -x "./node_modules/.bin/next" ]; then
  ./node_modules/.bin/next start -p "${WEB_PORT}" &
elif command -v npx >/dev/null 2>&1; then
  npx next start -p "${WEB_PORT}" &
else
  echo "[start.sh] ERROR: cannot find next binary"
  exit 1
fi
WEB_PID=$!

echo "[start.sh] Both services launched. API PID=${API_PID}, Web PID=${WEB_PID}"

# Wait for either process to exit; if one dies, kill the other.
trap "kill ${API_PID} ${WEB_PID} 2>/dev/null || true" EXIT INT TERM
wait -n "${API_PID}" "${WEB_PID}"