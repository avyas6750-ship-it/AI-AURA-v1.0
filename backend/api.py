"""FastAPI backend for the Underwater Acoustic Classifier.

Exposes endpoints that the Next.js frontend calls (via Caddy proxy with
?XTransformPort=8000):
    GET  /api/health          -> {"status": "ok"}
    GET  /api/samples         -> list of synthetic sample files
    GET  /api/samples/{name}  -> download a sample .wav
    POST /api/process         -> multipart upload of audio file + preprocessing
                                  params; returns features, prediction, plot data
    POST /api/correct         -> append a labeled sample to dataset
    POST /api/retrain         -> trigger incremental RandomForest retrain
    GET  /api/model           -> model version + history
    GET  /api/dataset         -> dataset summary

Run with:
    uvicorn backend.api:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import io
import os
import sys
import json
import base64
import csv
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.audio_processing import (
    load_audio, trim_silence, bandpass_filter, spectral_gate_denoise,
    normalize_peak, to_wav_bytes, dominant_frequencies, AudioBundle,
)
from src.feature_extraction import extract_features, compute_mel_spectrogram
from src.ml_pipeline import AcousticClassifier, Retrainer, CLASS_NAMES, MODEL_PATH, META_PATH
from src.active_learning import dataset_summary, prediction_history

SAMPLES_DIR = ROOT / "data" / "samples"

# ---------------------------------------------------------------------------
# App + state
# ---------------------------------------------------------------------------

app = FastAPI(title="Underwater Acoustic Classifier API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Singleton classifier + retrainer (loaded once at startup)
_classifier = AcousticClassifier()
_retrainer = Retrainer()


# ---------------------------------------------------------------------------
# Vercel routing helper
# ---------------------------------------------------------------------------
# When deployed on Vercel, requests come in as /api/py/segment (because the
# serverless function is mounted at /api/py/[...path]). We strip the /api
# prefix so FastAPI sees /py/segment as it expects.
# In local dev (uvicorn), requests come in directly as /py/segment — no strip needed.
from starlette.middleware.base import BaseHTTPMiddleware

class StripApiPrefixMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        # Strip /api prefix if present (Vercel routes /api/py/* to this function)
        if path.startswith("/api/py/"):
            request.scope["path"] = path[4:]  # Remove "/api" -> "/py/..."
        elif path == "/api/py":
            request.scope["path"] = "/py"
        return await call_next(request)

app.add_middleware(StripApiPrefixMiddleware)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/py/health")
async def health():
    return {"status": "ok", "model_version": _classifier.version}


@app.get("/py/samples")
async def list_samples():
    """List available synthetic sample .wav files."""
    if not SAMPLES_DIR.exists():
        return {"samples": []}
    files = sorted(p.name for p in SAMPLES_DIR.glob("*.wav"))
    grouped = {"biophonic": [], "anthropogenic": [], "geophonic": []}
    for f in files:
        prefix = f.split("_")[0]
        if prefix in grouped:
            grouped[prefix].append(f)
    return {"samples": files, "grouped": grouped}


@app.get("/py/samples/{name}")
async def download_sample(name: str):
    """Download a synthetic sample .wav file."""
    path = SAMPLES_DIR / name
    if not path.exists() or not path.is_file():
        raise HTTPException(404, f"Sample '{name}' not found")
    return FileResponse(path, media_type="audio/wav", filename=name)


@app.post("/py/process")
async def process_audio(
    file: UploadFile = File(...),
    enable_trim: bool = Form(True),
    trim_db: int = Form(30),
    enable_bandpass: bool = Form(True),
    bp_low: float = Form(50.0),
    bp_high: float = Form(8000.0),
    enable_denoise: bool = Form(False),
    noise_strength: float = Form(0.5),
    enable_normalize: bool = Form(True),
):
    """Process an uploaded audio file: preprocess -> features -> predict -> viz data."""
    raw_bytes = await file.read()
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        bundle = load_audio(tmp_path)
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(400, f"Failed to load audio: {e}")

    os.unlink(tmp_path)

    # Apply preprocessing chain
    y = bundle.y.copy()
    if enable_trim and len(y) > bundle.sr:
        try:
            y, _ = trim_silence(y, bundle.sr, top_db=trim_db)
        except Exception:
            pass
    if enable_bandpass:
        y = bandpass_filter(y, bundle.sr, low=bp_low, high=bp_high, order=4)
    if enable_denoise:
        y = spectral_gate_denoise(y, bundle.sr, noise_strength=noise_strength)
    if enable_normalize:
        y = normalize_peak(y)
    y = y.astype(np.float32)

    # Extract features
    feats = extract_features(y, bundle.sr)

    # Predict
    pred = _classifier.predict(feats.vector)

    # Compute visualization data
    log_S = compute_mel_spectrogram(y, bundle.sr, n_mels=128)
    dom_freqs = dominant_frequencies(y, bundle.sr, top_n=5)

    # Build a downsampled waveform for the frontend
    max_points = 1000
    step = max(1, len(y) // max_points)
    waveform = y[::step].tolist()
    wave_t = (np.arange(len(waveform)) * step / bundle.sr).tolist()

    # Mel spectrogram -> downsample + transpose for frontend heatmap
    n_mels, T = log_S.shape
    t_step = max(1, T // 150)
    log_S_ds = log_S[:, ::t_step]
    t_axis = (np.arange(log_S_ds.shape[1]) * t_step * 512 / bundle.sr).tolist()
    import librosa
    mel_freqs = librosa.filters.mel_frequencies(n_mels=n_mels + 2, fmin=0, fmax=bundle.sr / 2)[1:-1].tolist()

    # Encode processed audio as base64 WAV for the frontend player
    wav_bytes = to_wav_bytes(y, bundle.sr)
    audio_b64 = base64.b64encode(wav_bytes).decode("ascii")

    # Log prediction (no user correction here)
    from src.active_learning import log_prediction
    log_prediction(feats.vector, pred.label, pred.confidence_pct)

    return {
        "meta": bundle.meta.as_dict(),
        "waveform": {"t": wave_t, "y": waveform},
        "spectrogram": {
            "z": log_S_ds.tolist(),
            "x": t_axis,
            "y": mel_freqs,
        },
        "dominant_freqs": dom_freqs,
        "features": {
            "vector": feats.vector.tolist(),
            "names": feats.feature_names,
            "stats": feats.stats,
        },
        "prediction": {
            "label": pred.label,
            "confidence_pct": pred.confidence_pct,
            "probabilities": pred.probabilities,
        },
        "audio_base64": audio_b64,
        "model_version": _classifier.version,
    }


@app.post("/py/correct")
async def correct_label(
    file: UploadFile = File(...),
    label: str = Form(...),
    enable_trim: bool = Form(True),
    trim_db: int = Form(30),
    enable_bandpass: bool = Form(True),
    bp_low: float = Form(50.0),
    bp_high: float = Form(8000.0),
    enable_denoise: bool = Form(False),
    noise_strength: float = Form(0.5),
    enable_normalize: bool = Form(True),
):
    """Re-extract features from the uploaded file (with same preprocessing)
    and append the (features, label) row to the dataset CSV."""
    if label not in CLASS_NAMES:
        raise HTTPException(400, f"Invalid label '{label}'. Must be one of {CLASS_NAMES}")

    raw_bytes = await file.read()
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        bundle = load_audio(tmp_path)
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(400, f"Failed to load audio: {e}")
    os.unlink(tmp_path)

    y = bundle.y.copy()
    if enable_trim and len(y) > bundle.sr:
        try:
            y, _ = trim_silence(y, bundle.sr, top_db=trim_db)
        except Exception:
            pass
    if enable_bandpass:
        y = bandpass_filter(y, bundle.sr, low=bp_low, high=bp_high, order=4)
    if enable_denoise:
        y = spectral_gate_denoise(y, bundle.sr, noise_strength=noise_strength)
    if enable_normalize:
        y = normalize_peak(y)
    y = y.astype(np.float32)

    feats = extract_features(y, bundle.sr)
    _retrainer.append_sample(feats.vector, label, source="user")
    return {"status": "ok", "label": label, "dataset_total": dataset_summary()["total"]}


@app.post("/py/retrain")
async def retrain():
    """Trigger incremental RandomForest retrain on the accumulated dataset."""
    result = _retrainer.retrain(_classifier)
    return result


@app.get("/py/model")
async def model_info():
    """Return current model version + history."""
    # Avoid str(pipeline) due to a known sklearn 1.5 + Pipeline repr bug
    # ("'Pipeline' object has no attribute 'transform_input'"). We only need
    # basic info for the UI display, so we summarize the steps manually.
    pipeline_summary = None
    if _classifier.pipeline is not None:
        try:
            steps = []
            for name, step in _classifier.pipeline.steps:
                cls_name = type(step).__name__
                steps.append({"name": name, "class": cls_name})
            # Try to peek at the final estimator's n_estimators if RF
            clf_step = _classifier.pipeline.steps[-1][1]
            if hasattr(clf_step, "n_estimators"):
                steps[-1]["n_estimators"] = clf_step.n_estimators
            if hasattr(clf_step, "class_weight"):
                steps[-1]["class_weight"] = str(clf_step.class_weight)
            pipeline_summary = {"steps": steps}
        except Exception as e:
            pipeline_summary = {"error": str(e)}
    return {
        "version": _classifier.version,
        "history": _classifier.history,
        "pipeline": pipeline_summary,
        "dataset": dataset_summary(),
    }


@app.get("/py/dataset")
async def dataset_info():
    return dataset_summary()


@app.get("/py/predictions")
async def predictions(limit: int = Query(20)):
    hist = prediction_history()
    return {"predictions": hist[-limit:], "total": len(hist)}


# ---------------------------------------------------------------------------
# Multi-event segmentation endpoint
# ---------------------------------------------------------------------------

def _preprocess_bundle(bundle: AudioBundle, pre: dict) -> np.ndarray:
    """Apply the standard preprocessing chain. `pre` is a dict of preprocessing params."""
    y = bundle.y.copy()
    if pre.get("enable_trim", True) and len(y) > bundle.sr:
        try:
            y, _ = trim_silence(y, bundle.sr, top_db=int(pre.get("trim_db", 30)))
        except Exception:
            pass
    if pre.get("enable_bandpass", True):
        y = bandpass_filter(
            y, bundle.sr,
            low=float(pre.get("bp_low", 50)),
            high=float(pre.get("bp_high", 8000)),
            order=4,
        )
    if pre.get("enable_denoise", False):
        y = spectral_gate_denoise(
            y, bundle.sr,
            noise_strength=float(pre.get("noise_strength", 0.5)),
        )
    if pre.get("enable_normalize", True):
        y = normalize_peak(y)
    return y.astype(np.float32)


def _infer_subclass(label: str, feats_vec: np.ndarray, feature_names: list[str]) -> str:
    """Heuristic subclass inference based on extracted features.

    Uses simple rules on spectral centroid, flatness, RMS, ZCR, tempo, MFCC[0]
    to pick a plausible subclass label per detected class. This is NOT a real
    subclass classifier — it just makes the demo's event list feel real by
    giving each event a meaningful sub-label instead of "Unknown".
    """
    f = dict(zip(feature_names, feats_vec))
    centroid = float(f.get("spectral_centroid_mean", 1500))
    flatness = float(f.get("spectral_flatness_mean", 0.1))
    rolloff = float(f.get("spectral_rolloff_mean", 3000))
    zcr = float(f.get("zcr_mean", 0.05))
    rms = float(f.get("rms_mean", 0.05))
    tempo = float(f.get("tempo_bpm", 100))

    if label == "Biophonic":
        # Tonal calls (low flatness) with low centroid -> whale moan
        if flatness < 0.15 and centroid < 1200:
            return "Humpback Whale"
        # High-frequency whistle -> dolphin
        if centroid > 3500 or rolloff > 6000:
            return "Dolphin Whistle"
        # Pulsing pattern -> fish chorus
        if tempo > 100 and 200 < centroid < 1500:
            return "Fish Chorus"
        # Sharp transient with low flatness -> sperm whale click
        if zcr > 0.15 and rms > 0.1:
            return "Sperm Whale Click"
        return "Whale Call"

    if label == "Anthropogenic":
        # Very low centroid, broadband -> ship
        if centroid < 800 and flatness > 0.2:
            return "Cargo Ship"
        # Mid-band tonal ~3.5 kHz -> sonar
        if 2500 < centroid < 5000 and flatness < 0.2:
            return "Sonar Ping"
        # Impulsive -> pile driving
        if zcr > 0.2 and rms > 0.15:
            return "Pile Driving"
        # Steady broadband -> propeller
        if tempo > 50 and tempo < 150:
            return "Propeller Cavitation"
        return "Ship Noise"

    if label == "Geophonic":
        # High flatness, broadband -> rain
        if flatness > 0.4:
            return "Rain Hiss"
        # Very low centroid, sustained -> earthquake
        if centroid < 200:
            return "Earthquake Rumble"
        # Impulsive transients -> ice crack
        if zcr > 0.15:
            return "Ice Crack"
        # Default geophonic
        return "Wave Action"

    return "Unknown"


@app.post("/py/segment")
async def segment_audio(
    file: UploadFile = File(...),
    enable_trim: bool = Form(True),
    trim_db: int = Form(30),
    enable_bandpass: bool = Form(True),
    bp_low: float = Form(50.0),
    bp_high: float = Form(8000.0),
    enable_denoise: bool = Form(False),
    noise_strength: float = Form(0.5),
    enable_normalize: bool = Form(True),
    window_sec: float = Form(1.0),
    hop_sec: float = Form(0.5),
    min_event_sec: float = Form(0.3),
    merge_gap_sec: float = Form(0.4),
    confidence_threshold: float = Form(0.4),
):
    """Segment the audio into windows, classify each, and merge adjacent
    same-class windows into discrete events.

    Returns:
        - events: list of {id, class, subclass, confidence, start, end, audio_base64,
                  waveform, spectrogram, dominant_freqs, features, probabilities}
        - summary: per-class counts + total
        - timeline: compact list for the timeline strip
        - global_meta: signal metadata for header display
    """
    raw_bytes = await file.read()
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        bundle = load_audio(tmp_path)
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(400, f"Failed to load audio: {e}")
    os.unlink(tmp_path)

    pre = {
        "enable_trim": enable_trim,
        "trim_db": trim_db,
        "enable_bandpass": enable_bandpass,
        "bp_low": bp_low,
        "bp_high": bp_high,
        "enable_denoise": enable_denoise,
        "noise_strength": noise_strength,
        "enable_normalize": enable_normalize,
    }
    y_full = _preprocess_bundle(bundle, pre)
    sr = bundle.sr

    # DOWNSAMPLE to 11025 Hz to fit within Render's free-tier memory + CPU budget.
    # Original 22050 Hz is 2x more data; 11025 Hz is still plenty for vocal-range
    # marine sounds (whale moans, dolphin whistles, ship rumble, rain hiss).
    TARGET_SR = 11025
    if sr > TARGET_SR:
        downsample_factor = sr // TARGET_SR
        y_full = y_full[::downsample_factor].astype(np.float32)
        sr = TARGET_SR

    duration = len(y_full) / sr

    # 1. Slide a window across the audio and classify each window
    win_samples = max(int(window_sec * sr), 512)
    hop_samples = max(int(hop_sec * sr), 256)

    windows = []  # list of {start, end, y, feats, pred}
    i = 0
    while i + win_samples <= len(y_full):
        y_win = y_full[i:i + win_samples]
        feats = extract_features(y_win, sr)
        pred = _classifier.predict(feats.vector)
        windows.append({
            "start": i / sr,
            "end": (i + win_samples) / sr,
            "y": y_win,
            "feats": feats,
            "pred": pred,
        })
        i += hop_samples

    # Cover the tail if any
    if i < len(y_full) - 1024:
        y_tail = y_full[i:]
        if len(y_tail) >= 1024:
            feats = extract_features(y_tail, sr)
            pred = _classifier.predict(feats.vector)
            windows.append({
                "start": i / sr,
                "end": len(y_full) / sr,
                "y": y_tail,
                "feats": feats,
                "pred": pred,
            })

    if not windows:
        raise HTTPException(400, "Audio too short to segment with current window size.")

    # 2. Merge adjacent windows of the same class with confidence >= threshold
    min_event_samples = int(min_event_sec * sr)
    merge_gap_samples = int(merge_gap_sec * sr)

    events_raw = []
    current = None
    for w in windows:
        cls = w["pred"].label
        conf = w["pred"].confidence_pct / 100.0
        # Below-threshold windows break the current run
        if conf < confidence_threshold:
            if current is not None:
                events_raw.append(current)
                current = None
            continue
        if current is None or current["class"] != cls or \
           (w["start"] * sr - current["end_sample"]) > merge_gap_samples:
            if current is not None:
                events_raw.append(current)
            current = {
                "class": cls,
                "start_sample": int(w["start"] * sr),
                "end_sample": int(w["end"] * sr),
                "start": w["start"],
                "end": w["end"],
                "confidence_sum": conf,
                "confidence_count": 1,
                "feats": w["feats"],
                "pred": w["pred"],
            }
        else:
            # Extend current run
            current["end_sample"] = int(w["end"] * sr)
            current["end"] = w["end"]
            current["confidence_sum"] += conf
            current["confidence_count"] += 1
            # Keep latest window's feats as representative
            current["feats"] = w["feats"]
            current["pred"] = w["pred"]
    if current is not None:
        events_raw.append(current)

    # 3. Filter out events shorter than min_event_sec
    events_raw = [e for e in events_raw
                  if (e["end_sample"] - e["start_sample"]) >= min_event_samples]

    # 4. Build event payloads (lean — no per-event spectrogram, smaller audio)
    events = []
    per_class = {c: 0 for c in CLASS_NAMES}
    for i, e in enumerate(events_raw):
        y_seg = y_full[e["start_sample"]:e["end_sample"]]
        # Re-extract features on the merged segment for better subclass inference
        feats_seg = extract_features(y_seg, sr)
        pred_seg = _classifier.predict(feats_seg.vector)
        # Use mean confidence from the windows OR the merged prediction, whichever is higher
        mean_conf = (e["confidence_sum"] / max(1, e["confidence_count"])) * 100
        conf = max(mean_conf, pred_seg.confidence_pct)

        subclass = _infer_subclass(e["class"], feats_seg.vector, feats_seg.feature_names)

        # Audio bytes for the segment (downsample to 11 kHz to halve size)
        seg_sr = sr
        if sr > 16000 and len(y_seg) > 0:
            # Downsample by 2x using simple stride
            y_seg_ds = y_seg[::2]
            seg_sr = sr // 2
        else:
            y_seg_ds = y_seg
        seg_wav = to_wav_bytes(y_seg_ds.astype(np.float32), seg_sr)
        seg_b64 = base64.b64encode(seg_wav).decode("ascii")

        # Downsampled waveform for this segment (max 200 pts)
        max_pts = 200
        step = max(1, len(y_seg) // max_pts)
        wave_y = y_seg[::step].tolist()
        wave_t = (np.arange(len(wave_y)) * step / sr + e["start"]).tolist()

        # Dominant frequencies for this segment
        dom_freqs = dominant_frequencies(y_seg, sr, top_n=5)

        per_class[e["class"]] = per_class.get(e["class"], 0) + 1
        events.append({
            "id": f"evt-{i+1:03d}",
            "class": e["class"],
            "subclass": subclass,
            "confidence_pct": float(conf),
            "confidence": float(conf) / 100.0,
            "probabilities": pred_seg.probabilities,
            "start": float(e["start"]),
            "end": float(e["end"]),
            "duration_sec": float(e["end"] - e["start"]),
            "audio_base64": seg_b64,
            "waveform": {"t": wave_t, "y": wave_y},
            # NOTE: per-event spectrogram dropped — frontend can derive from global
            "spectrogram": {"z": [], "x": [], "y": []},
            "dominant_freqs": dom_freqs,
            "features": {
                "vector": feats_seg.vector.tolist(),
                "names": feats_seg.feature_names,
                "stats": feats_seg.stats,
            },
            "meta": {
                "Duration (s)": f"{e['end'] - e['start']:.2f}",
                "Sample rate (Hz)": f"{sr:,}",
                "Channels": "Mono",
                "Bit depth": "16-bit PCM",
                "Samples": f"{e['end_sample'] - e['start_sample']:,}",
                "Format": "wav",
            },
        })

    # 5. Build summary
    total = len(events)
    summary = {
        "total": total,
        "per_class": per_class,
        "per_class_pct": {
            c: (per_class[c] / total * 100) if total > 0 else 0
            for c in CLASS_NAMES
        },
    }

    # 6. Global metadata (whole clip)
    global_meta = bundle.meta.as_dict()

    # 7. Encode full audio for the global player
    # Downsample to 11 kHz to halve the base64 size (still plenty for listening)
    if sr > 16000 and len(y_full) > 0:
        y_full_ds = y_full[::2]
        full_sr = sr // 2
    else:
        y_full_ds = y_full
        full_sr = sr
    full_wav = to_wav_bytes(y_full_ds.astype(np.float32), full_sr)
    full_audio_b64 = base64.b64encode(full_wav).decode("ascii")

    # 8. Downsampled global waveform + spectrogram (smaller for Render free tier)
    # Waveform: 800 points max (was 1500)
    max_pts = 800
    step = max(1, len(y_full) // max_pts)
    wave_y = y_full[::step].tolist()
    wave_t = (np.arange(len(wave_y)) * step / sr).tolist()

    # Spectrogram: 16 mel bands × 40 time frames (tiny — for Render free tier)
    log_S_full = compute_mel_spectrogram(y_full, sr, n_mels=16)
    n_mels, T = log_S_full.shape
    t_step_ds = max(1, T // 40)
    log_S_ds = log_S_full[:, ::t_step_ds]
    # Round to 1 decimal to shrink JSON size
    log_S_ds = np.round(log_S_ds, 1)
    t_axis = (np.arange(log_S_ds.shape[1]) * t_step_ds * 512 / sr).tolist()
    import librosa
    mel_freqs = librosa.filters.mel_frequencies(
        n_mels=n_mels + 2, fmin=0, fmax=sr / 2
    )[1:-1].tolist()

    # 9. Log this segmentation as one prediction event
    if events:
        from src.active_learning import log_prediction
        top = max(events, key=lambda e: e["confidence_pct"])
        log_prediction(
            np.zeros(len(events[0]["features"]["vector"])),  # placeholder feats
            top["class"], top["confidence_pct"],
        )

    return {
        "events": events,
        "summary": summary,
        "global_meta": global_meta,
        "global_audio_base64": full_audio_b64,
        "global_waveform": {"t": wave_t, "y": wave_y},
        "global_spectrogram": {
            "z": log_S_ds.tolist(),
            "x": t_axis,
            "y": mel_freqs,
        },
        "duration_sec": float(duration),
        "sample_rate": int(sr),
        "model_version": _classifier.version,
        "segmentation_params": {
            "window_sec": window_sec,
            "hop_sec": hop_sec,
            "min_event_sec": min_event_sec,
            "merge_gap_sec": merge_gap_sec,
            "confidence_threshold": confidence_threshold,
        },
    }


# ---------------------------------------------------------------------------
# Subclass catalog (for UI reference)
# ---------------------------------------------------------------------------

@app.get("/py/subclasses")
async def subclasses():
    """Return the catalog of subclass labels the heuristic can produce."""
    return {
        "Biophonic": ["Humpback Whale", "Dolphin Whistle", "Fish Chorus",
                      "Sperm Whale Click", "Whale Call"],
        "Anthropogenic": ["Cargo Ship", "Sonar Ping", "Pile Driving",
                          "Propeller Cavitation", "Ship Noise"],
        "Geophonic": ["Rain Hiss", "Earthquake Rumble", "Ice Crack",
                      "Wave Action"],
    }


# ---------------------------------------------------------------------------
# Run directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
