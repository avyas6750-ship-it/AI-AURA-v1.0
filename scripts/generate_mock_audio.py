"""Synthesize mock hydrophone audio for instant testing of the classifier.

Generates short clips for each of the three categories:
  - Biophonic:    whale moans + dolphin whistle + fish chorus
  - Anthropogenic: ship propeller broadband + sonar ping + pile driving
  - Geophonic:   rain hiss + underwater earthquake rumble + ice cracking

Each clip is saved as 16-bit PCM WAV at 22050 Hz mono under `data/samples/`.
ALSO writes a labeled feature CSV so `Retrainer.retrain()` can construct
the baseline RandomForest on first run.

Usage:
    python /home/z/my-project/scripts/generate_mock_audio.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import librosa

# Ensure we can import the project's feature extractor
# Use __file__ to find the project root (works on any machine, not just this sandbox)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from src.feature_extraction import extract_features, FEATURE_NAMES  # noqa: E402
from src.audio_processing import TARGET_SR  # noqa: E402

SR = TARGET_SR  # 22050
DURATION_SEC = 6.0
N_SAMPLES = int(SR * DURATION_SEC)
OUT_DIR = ROOT / "data" / "samples"
CSV_PATH = ROOT / "data" / "labeled_features.csv"


# ---------------------------------------------------------------------------
# Synthesizers (one per sound source)
# ---------------------------------------------------------------------------

def _t():
    return np.linspace(0, DURATION_SEC, N_SAMPLES, endpoint=False)


def synth_whale_moan(t, sr=SR):
    """Low-frequency tonal moan with slow frequency sweep."""
    f0 = 80 + 60 * np.sin(2 * np.pi * 0.3 * t)        # 80-140 Hz sweep
    phase = 2 * np.pi * np.cumsum(f0) / sr
    sig = np.sin(phase) * np.exp(-((t - 3) ** 2) / 4)  # envelope centered at 3s
    return 0.7 * sig


def synth_dolphin_whistle(t, sr=SR):
    """Rising whistle 2-8 kHz over ~0.4s, repeated 3 times."""
    sig = np.zeros_like(t)
    for start in (1.0, 2.5, 4.0):
        mask = (t >= start) & (t < start + 0.4)
        tt = t[mask] - start
        freq = 2000 + 15000 * tt  # rising
        phase = 2 * np.pi * np.cumsum(freq) / sr
        env = np.hanning(len(tt))
        sig[mask] += 0.4 * np.sin(phase) * env
    return sig


def synth_fish_chorus(t, sr=SR):
    """Pulsing 200-500 Hz grunts."""
    f = 300 + 100 * np.sin(2 * np.pi * 5 * t)
    phase = 2 * np.pi * np.cumsum(f) / sr
    pulse = (np.sin(2 * np.pi * 8 * t) > 0).astype(np.float32)  # 8 Hz pulse train
    return 0.2 * np.sin(phase) * pulse


def synth_biophonic(t, sr=SR):
    """Combine whale moan + dolphin whistle + fish chorus."""
    return synth_whale_moan(t, sr) + 0.4 * synth_dolphin_whistle(t, sr) + synth_fish_chorus(t, sr)


def synth_ship_propeller(t, sr=SR):
    """Broadband low-frequency rumble with propeller blade rate ~10 Hz."""
    f_blade = 10.0
    blade = np.sign(np.sin(2 * np.pi * f_blade * t))  # square wave gives rich harmonics
    # Lowpass via integration -> rumble
    blade = np.cumsum(blade)
    blade = blade / np.max(np.abs(blade) + 1e-9)
    noise = np.random.randn(len(t)) * 0.3
    # lowpass the noise
    from scipy.signal import butter, sosfilt
    sos = butter(4, 600, btype="lowpass", fs=sr, output="sos")
    noise_lp = sosfilt(sos, noise)
    return 0.6 * blade + 0.4 * noise_lp


def synth_sonar_ping(t, sr=SR):
    """Decaying 3.5 kHz ping repeated every ~2s."""
    sig = np.zeros_like(t)
    for start in (0.5, 2.5, 4.5):
        mask = (t >= start) & (t < start + 0.3)
        tt = t[mask] - start
        env = np.exp(-tt * 12)
        sig[mask] += 0.8 * np.sin(2 * np.pi * 3500 * tt) * env
    return sig


def synth_pile_driving(t, sr=SR):
    """Sharp broadband impulses every ~1.2s."""
    sig = np.zeros_like(t)
    for start in np.arange(0.5, DURATION_SEC, 1.2):
        idx = int(start * sr)
        if idx + 80 < len(sig):
            # Impulse + ringing
            impulse = np.random.randn(80) * 0.9
            sig[idx:idx + 80] += impulse
            # ringing tail
            for k in range(1, 200):
                if idx + 80 + k < len(sig):
                    sig[idx + 80 + k] += 0.6 * np.exp(-k / 40) * np.sin(2 * np.pi * 120 * k / sr)
    return sig


def synth_anthropogenic(t, sr=SR):
    return 0.7 * synth_ship_propeller(t, sr) + 0.4 * synth_sonar_ping(t, sr) + 0.3 * synth_pile_driving(t, sr)


def synth_rain_hiss(t, sr=SR):
    """Broadband white-noise hiss (high-flatness)."""
    noise = np.random.randn(len(t))
    # gentle lowpass to keep it rain-like
    from scipy.signal import butter, sosfilt
    sos = butter(2, 8000, btype="lowpass", fs=sr, output="sos")
    return sosfilt(sos, noise) * 0.5


def synth_earthquake_rumble(t, sr=SR):
    """Sub-50 Hz rumble that crescendos and decays."""
    f = 12 + 6 * np.sin(2 * np.pi * 0.2 * t)
    phase = 2 * np.pi * np.cumsum(f) / sr
    env = np.exp(-((t - 3) ** 2) / 5) * (1 + 0.5 * np.sin(2 * np.pi * 0.5 * t))
    return 0.8 * np.sin(phase) * env


def synth_ice_crack(t, sr=SR):
    """Series of sharp transient cracks."""
    sig = np.zeros_like(t)
    rng = np.random.default_rng(42)
    for start in rng.uniform(0.5, DURATION_SEC - 0.5, size=8):
        idx = int(start * sr)
        if idx + 200 < len(sig):
            crack = rng.standard_normal(200) * np.exp(-np.arange(200) / 30)
            sig[idx:idx + 200] += crack * 0.7
    return sig


def synth_geophonic(t, sr=SR):
    return 0.8 * synth_rain_hiss(t, sr) + 0.5 * synth_earthquake_rumble(t, sr) + 0.4 * synth_ice_crack(t, sr)


# ---------------------------------------------------------------------------
# Background ambient noise (always present)
# ---------------------------------------------------------------------------

def add_ambient(sig, sr=SR, level=0.05):
    """Add low-level ocean ambient noise."""
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(len(sig))
    from scipy.signal import butter, sosfilt
    sos = butter(4, 2000, btype="lowpass", fs=sr, output="sos")
    return sig + level * sosfilt(sos, noise)


def normalize(sig, target=0.9):
    p = np.max(np.abs(sig))
    return (sig / (p + 1e-9)) * target if p > 0 else sig


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

SYNTHS = {
    "Biophonic":     synth_biophonic,
    "Anthropogenic": synth_anthropogenic,
    "Geophonic":     synth_geophonic,
}


def generate(n_per_class: int = 6, seed: int = 0):
    """Generate `n_per_class` clips per category. Also writes the labeled
    feature CSV used to train the baseline RandomForest."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    rng = np.random.default_rng(seed)
    for cls, fn in SYNTHS.items():
        for i in range(n_per_class):
            t = _t()
            sig = fn(t, SR)
            # Add light random perturbation per sample
            sig = add_ambient(sig, level=float(rng.uniform(0.02, 0.08)))
            # Random gain
            sig = sig * float(rng.uniform(0.6, 1.0))
            sig = normalize(sig).astype(np.float32)
            name = f"{cls.lower()}_{i:02d}.wav"
            sf.write(OUT_DIR / name, sig, SR, format="WAV", subtype="PCM_16")
            # Extract features and append to CSV
            fs = extract_features(sig, SR)
            row = list(map(float, fs.vector)) + [cls, "synthetic"]
            rows.append(row)
    # Write CSV
    import csv
    with open(CSV_PATH, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(FEATURE_NAMES + ["label", "source"])
        writer.writerows(rows)
    print(f"[generate_mock_audio] Wrote {len(rows)} samples across {len(SYNTHS)} classes")
    print(f"[generate_mock_audio] Audio:   {OUT_DIR}")
    print(f"[generate_mock_audio] CSV:     {CSV_PATH}")
    return len(rows)


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    generate(n_per_class=n)
