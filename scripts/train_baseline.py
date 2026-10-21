"""Train the baseline RandomForest classifier on synthetic mock audio features.

Run after `generate_mock_audio.py`. Produces:
  - models/baseline_model.joblib   (Pipeline: StandardScaler + RandomForest)
  - models/model_meta.json         (version + history)

Usage:
    python /home/z/my-project/scripts/train_baseline.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score, StratifiedKFold

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.feature_extraction import FEATURE_NAMES  # noqa: E402
from src.ml_pipeline import MODEL_PATH, META_PATH, CLASS_NAMES  # noqa: E402

CSV_PATH = ROOT / "data" / "labeled_features.csv"


def train():
    if not CSV_PATH.exists():
        print(f"[train_baseline] No CSV at {CSV_PATH}. Run generate_mock_audio.py first.")
        return False
    df = pd.read_csv(CSV_PATH)
    if len(df) == 0:
        print("[train_baseline] Empty CSV.")
        return False
    X = df[FEATURE_NAMES].values
    y = df["label"].values

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(
            n_estimators=200, max_depth=None, random_state=42,
            class_weight="balanced", n_jobs=-1,
        )),
    ])

    # Cross-validated accuracy
    n_splits = min(5, min(np.bincount(np.searchsorted(CLASS_NAMES, y))))
    n_splits = max(2, n_splits)
    try:
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        scores = cross_val_score(pipeline, X, y, cv=cv, scoring="accuracy")
        accuracy = float(scores.mean())
        print(f"[train_baseline] CV accuracy ({n_splits}-fold): {accuracy*100:.1f}% (+/- {scores.std()*100:.1f}%)")
    except Exception as e:
        accuracy = None
        print(f"[train_baseline] CV skipped: {e}")

    # Fit on full data
    pipeline.fit(X, y)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    version = "1.0.0"
    meta = {
        "version": version,
        "history": [{
            "version": version,
            "accuracy": accuracy,
            "trained_on": int(len(df)),
            "note": f"Baseline RandomForest on {len(df)} synthetic samples",
        }],
    }
    with open(META_PATH, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"[train_baseline] Saved model: {MODEL_PATH}")
    print(f"[train_baseline] Saved meta:  {META_PATH}")
    return True


if __name__ == "__main__":
    ok = train()
    sys.exit(0 if ok else 1)
