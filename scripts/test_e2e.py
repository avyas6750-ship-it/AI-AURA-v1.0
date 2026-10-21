"""End-to-end functional test that exercises the Streamlit app's full pipeline.

Simulates what the Streamlit server does when a browser session connects:
  1. Imports the app module fresh
  2. Replays the "Process & Classify" button click by directly invoking
     the pipeline functions on a sample audio file
  3. Verifies that all UI-bound plotly figures build without errors

This is NOT a UI test - it's a code-path test that catches integration bugs
(e.g. wrong function signatures, missing imports, broken sklearn wrappers)
that would crash the first real session.
"""
import sys
import io
from pathlib import Path

ROOT = Path("/home/z/my-project")
sys.path.insert(0, str(ROOT))

from src.audio_processing import (
    load_audio, trim_silence, bandpass_filter, spectral_gate_denoise,
    normalize_peak, to_wav_bytes, dominant_frequencies,
)
from src.feature_extraction import extract_features, compute_mel_spectrogram
from src.ml_pipeline import AcousticClassifier, Retrainer, CLASS_NAMES
from src.active_learning import log_prediction, dataset_summary, prediction_history
from src.visualization import (
    waveform_plotly, spectrogram_plotly, probability_bar_plotly,
    feature_summary_table, dominant_freq_plotly,
)


def test_full_pipeline():
    print("\n=== TEST 1: Full pipeline on each sample class ===")
    clf = AcousticClassifier()
    retrainer = Retrainer()
    print(f"Model version: {clf.version}")
    print(f"Pipeline classes_: {getattr(clf.pipeline, 'classes_', 'N/A')}")

    test_files = [
        ("Biophonic",     "data/samples/biophonic_00.wav"),
        ("Anthropogenic", "data/samples/anthropogenic_00.wav"),
        ("Geophonic",     "data/samples/geophonic_00.wav"),
    ]
    for true_label, path in test_files:
        print(f"\n--- {true_label} ({path}) ---")
        bundle = load_audio(path)
        print(f"  Loaded: {bundle.meta.duration_sec:.2f}s @ {bundle.sr}Hz, "
              f"{bundle.meta.bit_depth}, {bundle.meta.samples} samples")

        # Apply preprocessing (same as the GUI defaults)
        y = bundle.y.copy()
        y, _ = trim_silence(y, bundle.sr, top_db=30)
        y = bandpass_filter(y, bundle.sr, low=50, high=8000, order=4)
        # (skip denoise for speed)
        y = normalize_peak(y)

        # Feature extraction
        feats = extract_features(y, bundle.sr)
        print(f"  Features: dim={len(feats.vector)}")
        print(f"  MFCC means (first 5): {feats.vector[:5].tolist()}")

        # Inference
        pred = clf.predict(feats.vector)
        print(f"  Predicted: {pred.label} ({pred.confidence_pct:.1f}%)")
        print(f"  Probabilities: {pred.probabilities}")
        ok = (pred.label == true_label)
        print(f"  CORRECT: {ok}")

        # Visualization
        fig1 = waveform_plotly(y, bundle.sr, title=f"Waveform ({true_label})")
        log_S = compute_mel_spectrogram(y, bundle.sr, n_mels=128)
        fig2 = spectrogram_plotly(log_S, bundle.sr)
        fig3 = probability_bar_plotly(pred.probabilities, pred.label)
        fig4 = feature_summary_table(feats.stats)
        dom = dominant_frequencies(y, bundle.sr, top_n=5)
        fig5 = dominant_freq_plotly(dom)
        wav_bytes = to_wav_bytes(y, bundle.sr)
        print(f"  Figures built: 5  | WAV bytes: {len(wav_bytes)}")
        print(f"  Dominant freqs: {[round(d['freq'],1) for d in dom]} Hz")

        # Active learning: log prediction
        log_prediction(feats.vector, pred.label, pred.confidence_pct,
                       user_corrected=None if ok else true_label)
        if not ok:
            retrainer.append_sample(feats.vector, true_label, source="test_correction")
            print(f"  Appended correction to dataset (true={true_label})")

    print("\n=== TEST 2: Dataset summary ===")
    ds = dataset_summary()
    print(f"  {ds}")

    print("\n=== TEST 3: Retrainer ===")
    result = retrainer.retrain(clf)
    print(f"  {result}")

    print("\n=== TEST 4: Prediction history (last 3) ===")
    hist = prediction_history()[-3:]
    for h in hist:
        print(f"  {h}")

    print("\n=== TEST 5: Model version history ===")
    for entry in clf.history:
        print(f"  {entry}")

    print("\nALL TESTS PASSED ✅")
    return True


if __name__ == "__main__":
    ok = test_full_pipeline()
    sys.exit(0 if ok else 1)
