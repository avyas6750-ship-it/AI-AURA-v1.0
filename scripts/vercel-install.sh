#!/usr/bin/env bash
# Vercel install: install BOTH Python deps (for serverless functions) AND Node deps (for Next.js)
set -euo pipefail

echo "[vercel-install] Installing Python dependencies for serverless functions…"
pip install --upgrade pip --break-system-packages
pip install -r requirements.txt --break-system-packages

# Pre-generate the synthetic audio samples + train the baseline model.
# These get bundled with the serverless function deployment.
echo "[vercel-install] Generating synthetic hydrophone samples + training baseline model…"
python scripts/generate_mock_audio.py 4
python scripts/train_baseline.py

echo "[vercel-install] Installing Node dependencies for Next.js frontend…"
npm install --legacy-peer-deps

echo "[vercel-install] Done."
