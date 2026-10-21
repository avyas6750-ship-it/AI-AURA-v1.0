#!/usr/bin/env bash
# Package HYDROGRAPH source code into a downloadable ZIP for GitHub + Render.
set -euo pipefail

PROJECT_DIR="/home/z/my-project"
OUT_DIR="${PROJECT_DIR}/download"
OUT_FILE="${OUT_DIR}/hydrograph-source.zip"

mkdir -p "${OUT_DIR}"
rm -f "${OUT_FILE}"

echo "[package] Building ZIP at ${OUT_FILE}…"

# We use `git archive` if available (respects .gitignore), else fall back to zip.
cd "${PROJECT_DIR}"

if command -v git >/dev/null 2>&1 && [ -d .git ]; then
    # Use git ls-files so we only include tracked files (no node_modules etc.)
    git ls-files > /tmp/hydrograph-files.txt
    # Also include models/ and data/ which may be gitignored
    {
        find models -type f 2>/dev/null
        find data -type f 2>/dev/null
    } >> /tmp/hydrograph-files.txt
    # Include the freshly created config files even if not committed yet
    for f in render.yaml Procfile .gitignore .env.example LICENSE \
             scripts/build.sh scripts/start.sh README.md; do
        [ -f "${f}" ] && echo "${f}" >> /tmp/hydrograph-files.txt
    done
    # Dedup
    sort -u /tmp/hydrograph-files.txt -o /tmp/hydrograph-files.txt
    # Build the zip
    zip -q -r "${OUT_FILE}" --names-stdin < /tmp/hydrograph-files.txt
    rm -f /tmp/hydrograph-files.txt
else
    # Fallback: explicit file list, excluding heavy / transient dirs
    zip -r "${OUT_FILE}" . \
        -x 'node_modules/*' \
        -x '.next/*' \
        -x '.git/*' \
        -x '.zscripts/*' \
        -x 'upload/*' \
        -x 'download/*' \
        -x 'skills/*' \
        -x '.agent-browser/*' \
        -x '*/__pycache__/*' \
        -x '*.log' \
        -x 'TODO' \
        -x '.env' \
        > /dev/null
fi

# Print final size + summary
FILES_COUNT=$(unzip -l "${OUT_FILE}" | tail -1 | awk '{print $2}')
SIZE=$(du -h "${OUT_FILE}" | awk '{print $1}')
echo "[package] ✅ Packaged ${FILES_COUNT} files (${SIZE})"
echo "[package] ZIP: ${OUT_FILE}"
