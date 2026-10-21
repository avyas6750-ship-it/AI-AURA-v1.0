"""ML inference + incremental retraining pipeline.

Two modes:
  - **Packaged baseline**: a RandomForest trained on synthetic features derived
    from `generate_mock_audio.py` (see scripts/). Loads from
    `models/baseline_model.joblib`.
  - **Fallback mock**: if no packaged model exists, derives predictions from
    hand-crafted heuristics on extracted features (still produces a valid
    probability distribution for UI testing).

Implements `Retrainer` to append user-corrected labels to the dataset and
incrementally fine-tune the RandomForest, bumping the model version.
"""

from __future__ import annotations

import os
import json
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

from .feature_extraction import FEATURE_DIM, FEATURE_NAMES


# ---------------------------------------------------------------------------
# Constants — paths resolved relative to project root so they work on any
# machine (sandbox, Render, local dev). Never hardcode absolute paths.
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

CLASS_NAMES = ["Biophonic", "Anthropogenic", "Geophonic"]
MODEL_PATH = _PROJECT_ROOT / "models" / "baseline_model.joblib"
META_PATH = _PROJECT_ROOT / "models" / "model_meta.json"
DATASET_PATH = _PROJECT_ROOT / "data" / "labeled_features.csv"


# ---------------------------------------------------------------------------
# Public data containers
# ---------------------------------------------------------------------------

@dataclass
class Prediction:
    label: str
    confidence_pct: float
    probabilities: dict   # {class_name: prob_float}


# ---------------------------------------------------------------------------
# Classifier wrapper
# ---------------------------------------------------------------------------

class AcousticClassifier:
    """Loads (or constructs) a classifier, exposes `predict()`."""

    def __init__(self):
        self.pipeline: Optional[Pipeline] = None
        self.version: str = "0.0.0-baseline"
        self.history: list[dict] = []
        self._load_or_init()

    # ----- loading ---------------------------------------------------------

    def _load_or_init(self):
        if MODEL_PATH.exists() and META_PATH.exists():
            try:
                self.pipeline = joblib.load(MODEL_PATH)
                with open(META_PATH) as f:
                    meta = json.load(f)
                self.version = meta.get("version", "unknown")
                self.history = meta.get("history", [])
                return
            except Exception as e:
                print(f"[ml_pipeline] Failed to load packaged model: {e}")
        # Fall back to mock classifier (still returns valid probs)
        self.pipeline = None
        self.version = "0.0.0-mock"
        self.history = [{"version": "0.0.0-mock", "accuracy": None,
                         "trained_on": 0, "note": "Mock heuristic classifier"}]

    # ----- inference -------------------------------------------------------

    def predict(self, feature_vector: np.ndarray) -> Prediction:
        if feature_vector.ndim == 1:
            feature_vector = feature_vector.reshape(1, -1)
        if self.pipeline is not None:
            probs = self.pipeline.predict_proba(feature_vector)[0]
            # IMPORTANT: sklearn returns prob columns in model.classes_ order
            # (alphabetical by default), NOT in our CLASS_NAMES order.
            # Use the fitted classes_ to map probabilities -> labels.
            fitted_classes = list(getattr(self.pipeline, "classes_", CLASS_NAMES))
            label_to_prob = {c: float(p) for c, p in zip(fitted_classes, probs)}
            # Re-map into our canonical CLASS_NAMES order for the UI
            probabilities = {c: label_to_prob.get(c, 0.0) for c in CLASS_NAMES}
            # Pick the argmax using the canonical ordering
            idx = int(np.argmax([probabilities[c] for c in CLASS_NAMES]))
            return Prediction(
                label=CLASS_NAMES[idx],
                confidence_pct=float(probabilities[CLASS_NAMES[idx]] * 100),
                probabilities=probabilities,
            )
        return self._mock_predict(feature_vector[0])

    def _mock_predict(self, features: np.ndarray) -> Prediction:
        """Heuristic fallback when no packaged model exists.

        Uses simple rules on the most discriminative features:
          - High spectral centroid + flatness ~ Geophonic (rain)
          - Strong low-freq energy + rhythmic tempo ~ Anthropogenic (ship)
          - Mid-band spectral peaks + low flatness ~ Biophonic (whale call)
        """
        # Map feature names to values
        f = dict(zip(FEATURE_NAMES, features))
        centroid = f.get("spectral_centroid_mean", 1500)
        flatness = f.get("spectral_flatness_mean", 0.1)
        rolloff = f.get("spectral_rolloff_mean", 3000)
        zcr = f.get("zcr_mean", 0.05)
        rms = f.get("rms_mean", 0.05)
        tempo = f.get("tempo_bpm", 100)
        mfcc0 = f.get("mfcc_0_mean", -200)

        scores = np.zeros(3, dtype=np.float32)
        # Biophonic: moderate centroid, low flatness (tonal calls), moderate tempo
        scores[0] = (
            (1.0 - min(1.0, abs(centroid - 1500) / 3000)) * 0.35
            + (1.0 - flatness) * 0.35
            + (1.0 - min(1.0, abs(tempo - 60) / 200)) * 0.15
            + (mfcc0 > -300) * 0.15
        )
        # Anthropogenic: low centroid, high rolloff spread, steady tempo, broadband
        scores[1] = (
            (1.0 - min(1.0, centroid / 3000)) * 0.3
            + flatness * 0.2
            + (1.0 - min(1.0, abs(tempo - 80) / 200)) * 0.2
            + min(1.0, rolloff / 6000) * 0.15
            + min(1.0, rms * 8) * 0.15
        )
        # Geophonic: very high flatness (white-noise rain), high centroid
        scores[2] = (
            flatness * 0.5
            + (1.0 - min(1.0, abs(centroid - 4000) / 4000)) * 0.3
            + (zcr > 0.1) * 0.2
        )
        # Apply softmax with temperature
        scores = np.exp(scores * 2.0)
        scores = scores / scores.sum()
        idx = int(np.argmax(scores))
        return Prediction(
            label=CLASS_NAMES[idx],
            confidence_pct=float(scores[idx] * 100),
            probabilities={c: float(p) for c, p in zip(CLASS_NAMES, scores)},
        )


# ---------------------------------------------------------------------------
# Retrainer (active learning loop)
# ---------------------------------------------------------------------------

class Retrainer:
    """Append (features, label) pairs to CSV and trigger incremental retrain."""

    def __init__(self):
        # ensure dirs exist (best-effort — on read-only filesystems like Render's
        # /home/z path, the retrain will fail later but at least import won't crash)
        try:
            MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
            DATASET_PATH.parent.mkdir(parents=True, exist_ok=True)
        except (OSError, PermissionError):
            pass  # Fall back to read-only model + dataset shipped with repo

    def append_sample(self, features: np.ndarray, label: str, source: str = "user"):
        """Append a labeled feature vector to the CSV dataset."""
        import csv
        try:
            exists = DATASET_PATH.exists()
            mode = "a" if exists else "w"
            with open(DATASET_PATH, mode, newline="") as f:
                writer = csv.writer(f)
                if not exists:
                    writer.writerow(FEATURE_NAMES + ["label", "source"])
                writer.writerow(list(map(float, features)) + [label, source])
        except (OSError, PermissionError) as e:
            # Read-only filesystem — can't persist the new sample.
            # The UI will still show the correction, but the next retrain
            # won't include it (which is fine for the demo).
            print(f"[Retrainer.append_sample] Cannot write to {DATASET_PATH}: {e}")

    def retrain(self, classifier: AcousticClassifier) -> dict:
        """Retrain the RandomForest on the accumulated CSV dataset.

        Returns a dict with new version, accuracy, and sample count.
        """
        import pandas as pd
        from sklearn.model_selection import cross_val_score

        if not DATASET_PATH.exists():
            return {"status": "no_data", "message": "No labeled samples yet."}

        df = pd.read_csv(DATASET_PATH)
        if len(df) < 6 or df["label"].nunique() < 2:
            return {"status": "insufficient",
                    "message": f"Need >=6 samples covering >=2 classes; have {len(df)} samples / {df['label'].nunique()} classes."}

        X = df[FEATURE_NAMES].values
        y = df["label"].values

        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", RandomForestClassifier(
                n_estimators=100, max_depth=None, random_state=42,
                class_weight="balanced",
            )),
        ])
        pipeline.fit(X, y)

        # Cross-validated accuracy if enough samples
        try:
            cv = min(5, min(np.bincount(np.searchsorted(CLASS_NAMES, y))))
            cv = max(2, cv)
            scores = cross_val_score(pipeline, X, y, cv=cv, scoring="accuracy")
            accuracy = float(scores.mean())
            acc_str = f"{accuracy*100:.1f}%"
        except Exception:
            accuracy = None
            acc_str = "N/A"

        # Bump version
        old_ver = classifier.version
        parts = old_ver.split(".")
        try:
            parts[1] = str(int(parts[1]) + 1)
            new_ver = ".".join(parts[:3])
        except Exception:
            new_ver = "0.1.0"

        # Persist (best-effort — on read-only filesystem, we keep the new
        # pipeline in memory for the current session only)
        try:
            joblib.dump(pipeline, MODEL_PATH)
        except (OSError, PermissionError) as e:
            print(f"[Retrainer.retrain] Cannot persist model to {MODEL_PATH}: {e}")
        entry = {
            "version": new_ver,
            "accuracy": accuracy,
            "trained_on": int(len(df)),
            "note": f"Incremental retrain on {len(df)} samples (CV acc {acc_str})",
        }
        classifier.pipeline = pipeline
        classifier.version = new_ver
        classifier.history.append(entry)
        try:
            meta = {"version": new_ver, "history": classifier.history}
            with open(META_PATH, "w") as f:
                json.dump(meta, f, indent=2)
        except (OSError, PermissionError) as e:
            print(f"[Retrainer.retrain] Cannot persist meta to {META_PATH}: {e}")
        return {"status": "ok", **entry}
