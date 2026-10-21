#!/usr/bin/env bash
# Vercel build: build the Next.js frontend.
# Python deps + model training already done in vercel-install.sh.
set -euo pipefail

echo "[vercel-build] Building Next.js frontend…"
npm run build

echo "[vercel-build] Done."
