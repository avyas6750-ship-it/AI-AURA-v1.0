"""Acoustic feature extraction for underwater audio classification.

Computes the features most discriminative for biophonic vs. anthropogenic
vs. geophonic separation:
  - MFCCs (13 coefficients x mean & std)
  - Spectral centroid (brightness)
  - Spectral rolloff (energy concentration)
  - Spectral bandwidth (spread)
  - Zero-crossing rate (noisiness / percussive content)
  - RMS energy (loudness envelope)

All features are aggregated to a single fixed-length vector per clip so
they can be fed to a classical classifier (RandomForest / LogisticRegression).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import numpy as np
import librosa


@dataclass
class FeatureSet:
    """Container holding both the scalar feature vector and per-feature stats."""
    vector: np.ndarray          # (D,) float32 - ready for classifier input
    feature_names: list[str]    # same length as `vector`
    stats: Dict[str, dict]      # {feature_family: {mean, std, min, max}}


# ---------------------------------------------------------------------------
# Feature configuration
# ---------------------------------------------------------------------------

N_MFCC = 13
N_FFT = 1024
HOP_LENGTH = 512

# Names of scalar features (order MUST match `_build_vector`)
SCALAR_FEATURE_NAMES = [
    "spectral_centroid_mean", "spectral_centroid_std",
    "spectral_rolloff_mean", "spectral_rolloff_std",
    "spectral_bandwidth_mean", "spectral_bandwidth_std",
    "zcr_mean", "zcr_std",
    "rms_mean", "rms_std",
    "tempo_bpm",
    "spectral_flatness_mean", "spectral_flatness_std",
]
# MFCC means + stds come first in the vector
FEATURE_NAMES = (
    [f"mfcc_{i}_mean" for i in range(N_MFCC)]
    + [f"mfcc_{i}_std" for i in range(N_MFCC)]
    + SCALAR_FEATURE_NAMES
)
FEATURE_DIM = len(FEATURE_NAMES)  # 13 + 13 + 13 = 39


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_features(y: np.ndarray, sr: int) -> FeatureSet:
    """Extract a fixed-length feature vector from a mono waveform."""
    if len(y) < N_FFT:
        # pad short clips
        y = np.pad(y, (0, N_FFT - len(y) + 1))

    # MFCCs
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT,
                                hop_length=HOP_LENGTH)
    mfcc_mean = mfcc.mean(axis=1)
    mfcc_std = mfcc.std(axis=1)

    # Spectral features
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=N_FFT,
                                                  hop_length=HOP_LENGTH)[0]
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, n_fft=N_FFT,
                                                hop_length=HOP_LENGTH, roll_percent=0.85)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr, n_fft=N_FFT,
                                                   hop_length=HOP_LENGTH)[0]
    flatness = librosa.feature.spectral_flatness(y=y, n_fft=N_FFT,
                                                 hop_length=HOP_LENGTH)[0]

    # Time-domain features
    zcr = librosa.feature.zero_crossing_rate(y, hop_length=HOP_LENGTH)[0]
    rms = librosa.feature.rms(y=y, frame_length=N_FFT, hop_length=HOP_LENGTH)[0]

    # Tempo (bpm) - approximate beat tracking on the onset envelope
    try:
        # librosa 0.10+ moved tempo to librosa.feature.rhythm.tempo
        tempo_fn = getattr(librosa.feature, "rhythm", None)
        if tempo_fn is not None and hasattr(tempo_fn, "tempo"):
            tempo = float(tempo_fn.tempo(y=y, sr=sr, hop_length=HOP_LENGTH)[0])
        else:
            tempo = float(librosa.beat.tempo(y=y, sr=sr, hop_length=HOP_LENGTH)[0])
    except Exception:
        tempo = 0.0

    scalar_vec = np.array([
        centroid.mean(), centroid.std(),
        rolloff.mean(), rolloff.std(),
        bandwidth.mean(), bandwidth.std(),
        zcr.mean(), zcr.std(),
        rms.mean(), rms.std(),
        tempo,
        flatness.mean(), flatness.std(),
    ], dtype=np.float32)

    vector = np.concatenate([mfcc_mean, mfcc_std, scalar_vec]).astype(np.float32)

    stats = {
        "MFCC (mean)": {"min": float(mfcc_mean.min()), "max": float(mfcc_mean.max()),
                        "mean": float(mfcc_mean.mean()), "std": float(mfcc_mean.std())},
        "MFCC (std)":  {"min": float(mfcc_std.min()), "max": float(mfcc_std.max()),
                        "mean": float(mfcc_std.mean()), "std": float(mfcc_std.std())},
        "Spectral centroid (Hz)": {"min": float(centroid.min()), "max": float(centroid.max()),
                                   "mean": float(centroid.mean()), "std": float(centroid.std())},
        "Spectral rolloff (Hz)": {"min": float(rolloff.min()), "max": float(rolloff.max()),
                                  "mean": float(rolloff.mean()), "std": float(rolloff.std())},
        "Spectral bandwidth (Hz)": {"min": float(bandwidth.min()), "max": float(bandwidth.max()),
                                    "mean": float(bandwidth.mean()), "std": float(bandwidth.std())},
        "Spectral flatness (0-1)": {"min": float(flatness.min()), "max": float(flatness.max()),
                                    "mean": float(flatness.mean()), "std": float(flatness.std())},
        "Zero-crossing rate": {"min": float(zcr.min()), "max": float(zcr.max()),
                               "mean": float(zcr.mean()), "std": float(zcr.std())},
        "RMS energy": {"min": float(rms.min()), "max": float(rms.max()),
                       "mean": float(rms.mean()), "std": float(rms.std())},
        "Tempo (BPM)": {"min": tempo, "max": tempo, "mean": tempo, "std": 0.0},
    }

    return FeatureSet(vector=vector, feature_names=list(FEATURE_NAMES), stats=stats)


def compute_mel_spectrogram(y: np.ndarray, sr: int, n_mels: int = 128) -> tuple[np.ndarray, np.ndarray]:
    """Return (log-mel spectrogram in dB, time_axis, freq_axis).
    The spectrogram is shape (n_mels, T) in dB units.
    """
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=N_FFT,
                                       hop_length=HOP_LENGTH, n_mels=n_mels)
    log_S = librosa.power_to_db(S, ref=np.max)
    return log_S
