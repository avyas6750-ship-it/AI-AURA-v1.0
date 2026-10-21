#!/usr/bin/env bash
# Vercel install: install Python deps + train model + install Node deps
set -euo pipefail

echo "[vercel-install] Installing Python BUILD dependencies (includes pandas for training)…"
pip install --upgrade pip --break-system-packages
pip install -r requirements-build.txt --break-system-packages

echo "[vercel-install] Generating synthetic hydrophone samples + training baseline model…"
python scripts/generate_mock_audio.py 4
python scripts/train_baseline.py

echo "[vercel-install] Uninstalling heavy build-only deps to shrink serverless bundle…"
pip uninstall --yes pandas matplotlib plotly --break-system-packages 2>/dev/null || true

echo "[vercel-install] Installing Node dependencies for Next.js frontend…"
npm install --legacy-peer-deps

echo "[vercel-install] Done."
