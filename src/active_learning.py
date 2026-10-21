"""Active-learning label store & history tracking.

Wraps the CSV-based append and the per-clip prediction history (which the
GUI uses to render the version control display).
"""
from __future__ import annotations

import csv
import json
import os
from pathlib import Path
from datetime import datetime
from typing import Optional

import numpy as np

from .ml_pipeline import DATASET_PATH, FEATURE_NAMES, CLASS_NAMES


# Resolve project root relative to this file so paths work on any machine
# (sandbox, Render, local dev, etc.) — never hardcode absolute paths.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
HISTORY_PATH = _PROJECT_ROOT / "data" / "prediction_history.json"

# On Render's free tier the filesystem can be read-only in certain paths.
# If the project dir isn't writable, fall back to /tmp (always writable).
def _writable(path: Path) -> Path:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        # Touch-test: try to open for append, then close
        with open(path, "a"):
            pass
        return path
    except (OSError, PermissionError):
        # Fall back to /tmp/hydrograph
        fallback = Path("/tmp") / "hydrograph" / path.name
        fallback.parent.mkdir(parents=True, exist_ok=True)
        return fallback


def _read_json(path: Path):
    try:
        return json.loads(path.read_text())
    except Exception:
        return []


def log_prediction(features: np.ndarray, prediction_label: str, confidence_pct: float,
                   user_corrected: Optional[str] = None):
    """Append a prediction record (and any user correction) to the history log."""
    history_path = _writable(HISTORY_PATH)
    history = _read_json(history_path) if history_path.exists() else []
    entry = {
        "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "predicted": prediction_label,
        "confidence_pct": round(confidence_pct, 2),
        "user_corrected": user_corrected,
        "feature_dim": len(features),
    }
    history.append(entry)
    # cap at last 500 records to keep the file manageable
    if len(history) > 500:
        history = history[-500:]
    history_path.write_text(json.dumps(history, indent=2))


def dataset_summary() -> dict:
    """Return counts per class for display."""
    if not DATASET_PATH.exists():
        return {"total": 0, "per_class": {c: 0 for c in CLASS_NAMES}}
    rows = list(csv.DictReader(open(DATASET_PATH)))
    per_class = {c: 0 for c in CLASS_NAMES}
    for r in rows:
        lbl = r.get("label", "")
        if lbl in per_class:
            per_class[lbl] += 1
    return {"total": len(rows), "per_class": per_class}


def prediction_history() -> list[dict]:
    history_path = _writable(HISTORY_PATH)
    if not history_path.exists():
        return []
    return _read_json(history_path)
