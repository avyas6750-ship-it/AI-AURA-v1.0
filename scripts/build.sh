#!/usr/bin/env bash
# ============================================================
# build.sh - runs AFTER `next build` on Render
# Generates synthetic hydrophone samples + trains baseline model
# so the FastAPI backend has data to serve on first boot.
# ============================================================
set -euo pipefail

echo "[build.sh] Generating synthetic hydrophone audio samples…"
python scripts/generate_mock_audio.py 8

echo "[build.sh] Training baseline RandomForest classifier…"
python scripts/train_baseline.py

echo "[build.sh] Build complete."
ls -la models/ data/samples/ 2>/dev/null | head -20
