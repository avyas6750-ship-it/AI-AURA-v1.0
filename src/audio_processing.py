"""Audio loading, trimming, filtering, and noise reduction for hydrophone recordings.

This module wraps librosa + scipy + soundfile behind a small, well-documented API
so the Streamlit GUI can:
  * load .wav / .mp3 / .flac files at a consistent sample rate
  * trim leading/trailing silence
  * apply a bandpass filter tuned for underwater acoustic energy
  * apply spectral-gating noise reduction
  * return metadata (duration, sample rate, bit depth) for display
"""

from __future__ import annotations

import io
import os
import wave
from dataclasses import dataclass
from typing import Tuple

import numpy as np
import soundfile as sf
import librosa
from scipy.signal import butter, sosfilt


# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------

@dataclass
class AudioMeta:
    """Lightweight metadata describing a loaded audio clip."""
    duration_sec: float
    sample_rate: int
    channels: int
    bit_depth: str
    samples: int
    file_format: str

    def as_dict(self) -> dict:
        return {
            "Duration (s)": f"{self.duration_sec:.2f}",
            "Sample rate (Hz)": f"{self.sample_rate:,}",
            "Channels": "Mono" if self.channels == 1 else f"{self.channels} (downmixed to mono)",
            "Bit depth": self.bit_depth,
            "Samples": f"{self.samples:,}",
            "Format": self.file_format,
        }


@dataclass
class AudioBundle:
    """Container returned by `load_audio` carrying signal + metadata."""
    y: np.ndarray          # mono float32 waveform
    sr: int                # sample rate
    meta: AudioMeta
    raw_bytes: bytes       # original file bytes (used to write a temp WAV for the player)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Target sample rate for all downstream processing. Hydrophone recordings
# commonly range 44.1k - 192k; 22050 keeps features compact while preserving
# frequencies up to ~11 kHz which covers most biophonic / anthropogenic content.
TARGET_SR = 22050


def load_audio(file_obj, target_sr: int = TARGET_SR) -> AudioBundle:
    """Load an uploaded audio file as a mono float32 waveform.

    Parameters
    ----------
    file_obj : streamlit UploadedFile OR path-like
        Object exposing a `.read()` method OR a filesystem path.
    target_sr : int
        Resample to this rate. Pass None to keep native sample rate.

    Returns
    -------
    AudioBundle
    """
    # Accept both UploadedFile (has .read, .name) and raw paths
    if hasattr(file_obj, "read"):
        raw_bytes = file_obj.read()
        name = getattr(file_obj, "name", "audio.wav")
        # librosa can read from a file-like object
        y, sr = librosa.load(io.BytesIO(raw_bytes), sr=target_sr, mono=True)
        file_format = os.path.splitext(name)[1].lower().lstrip(".") or "wav"
    else:
        raw_bytes = open(file_obj, "rb").read()
        name = os.path.basename(file_obj)
        y, sr = librosa.load(file_obj, sr=target_sr, mono=True)
        file_format = os.path.splitext(name)[1].lower().lstrip(".") or "wav"

    # Best-effort bit-depth detection via soundfile on the raw bytes
    bit_depth = _detect_bit_depth(raw_bytes, name)

    meta = AudioMeta(
        duration_sec=len(y) / sr,
        sample_rate=sr,
        channels=1,
        bit_depth=bit_depth,
        samples=len(y),
        file_format=file_format,
    )
    return AudioBundle(y=y.astype(np.float32), sr=sr, meta=meta, raw_bytes=raw_bytes)


def _detect_bit_depth(raw_bytes: bytes, name: str) -> str:
    """Infer bit depth from WAV header; fallback to extension for mp3/flac."""
    ext = os.path.splitext(name)[1].lower()
    if ext == ".wav":
        try:
            with wave.open(io.BytesIO(raw_bytes), "rb") as wf:
                sw = wf.getsampwidth()  # bytes per sample
                return {1: "8-bit PCM", 2: "16-bit PCM", 3: "24-bit PCM", 4: "32-bit float"}.get(
                    sw, f"{sw*8}-bit"
                )
        except Exception:
            return "16-bit PCM (assumed)"
    if ext == ".flac":
        try:
            info = sf.info(io.BytesIO(raw_bytes))
            return f"{info.subtype}"
        except Exception:
            return "FLAC (16-24 bit)"
    if ext == ".mp3":
        return "MP3 (compressed)"
    return "Unknown"


# ---------------------------------------------------------------------------
# Preprocessing primitives
# ---------------------------------------------------------------------------

def trim_silence(y: np.ndarray, sr: int, top_db: int = 30) -> Tuple[np.ndarray, np.ndarray]:
    """Trim leading/trailing silence below `top_db` of peak.

    Returns (trimmed_signal, indices) - indices are librosa trim's [start, end] sample indices.
    """
    yt, idx = librosa.effects.trim(y, top_db=top_db)
    return yt, idx


def bandpass_filter(y: np.ndarray, sr: int, low: float = 50.0, high: float = 8000.0,
                    order: int = 4) -> np.ndarray:
    """Apply a Butterworth bandpass filter.

    Underwater acoustic energy of interest typically lives in 50 Hz - 8 kHz:
    whale calls (~20-5000 Hz), dolphin clicks (~40-150 kHz, but downsampled here),
    ship noise (50-1000 Hz broadband), rain (1-20 kHz).
    """
    nyq = 0.5 * sr
    if high >= nyq:
        high = nyq * 0.95
    if low <= 0:
        low = 1.0
    sos = butter(order, [low / nyq, high / nyq], btype="bandpass", output="sos")
    return sosfilt(sos, y).astype(np.float32)


def spectral_gate_denoise(y: np.ndarray, sr: int, noise_strength: float = 0.5) -> np.ndarray:
    """Apply spectral-gating noise reduction via librosa.

    Estimates a noise profile from the quietest 10% of frames and subtracts
    it from the magnitude spectrum. `noise_strength` scales the noise floor.
    """
    # Use a short noise-only slice (first 0.5s OR quietest decile)
    frame = int(0.5 * sr)
    if len(y) < frame * 2:
        # too short - skip denoising
        return y
    noise_slice = y[:frame]
    # If the start isn't quiet, fall back to the quietest 0.5s window
    win_e = np.array([np.sqrt(np.mean(y[i:i+frame]**2))
                      for i in range(0, len(y) - frame, frame)])
    if len(win_e):
        quiet_start = max(0, np.argmin(win_e) * frame)
        noise_slice = y[quiet_start:quiet_start + frame]

    try:
        stft = librosa.stft(y)
        noise_stft = librosa.stft(noise_slice)
        noise_mag = np.mean(np.abs(noise_stft), axis=1, keepdims=True)
        # soft mask via magnitude subtraction
        mag = np.abs(stft)
        mask = np.maximum(0, mag - noise_strength * noise_mag) / (mag + 1e-8)
        stft_denoised = stft * mask
        y_denoised = librosa.istft(stft_denoised)
        return y_denoised.astype(np.float32)
    except Exception:
        return y


def normalize_peak(y: np.ndarray, target: float = 0.9) -> np.ndarray:
    """Peak-normalize to `target` amplitude."""
    peak = np.max(np.abs(y))
    if peak < 1e-8:
        return y
    return (y / peak) * target


def to_wav_bytes(y: np.ndarray, sr: int) -> bytes:
    """Convert a float32 mono waveform to in-memory 16-bit PCM WAV bytes.

    Used by Streamlit's `st.audio` player.
    """
    buf = io.BytesIO()
    sf.write(buf, y, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def dominant_frequencies(y: np.ndarray, sr: int, top_n: int = 5) -> list[dict]:
    """Return the `top_n` strongest frequencies (Hz) via FFT peak-picking.

    Each entry: {"freq": float, "magnitude": float}
    """
    n = len(y)
    if n < 64:
        return []
    # Hann window + rfft
    win = y * np.hanning(n)
    spectrum = np.abs(np.fft.rfft(win))[: n // 2]
    freqs = np.fft.rfftfreq(n, 1 / sr)[: n // 2]
    # Mask out DC and below 20 Hz
    mask = freqs >= 20
    spectrum = spectrum[mask]
    freqs = freqs[mask]
    if len(spectrum) == 0:
        return []
    # Find local peaks
    from scipy.signal import find_peaks
    peaks, _ = find_peaks(spectrum, height=np.max(spectrum) * 0.05, distance=10)
    if len(peaks) == 0:
        # fall back to top-N indices
        idx = np.argsort(spectrum)[-top_n:][::-1]
    else:
        idx = peaks[np.argsort(spectrum[peaks])][-top_n:][::-1]
    return [{"freq": float(freqs[i]), "magnitude": float(spectrum[i])} for i in idx]
