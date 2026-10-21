"""Streamlit GUI for the AI-powered Underwater Acoustic Classification prototype.

Run with:
    streamlit run /home/z/my-project/app.py

Pipeline:
    Upload .wav/.mp3/.flac
       -> preprocessing (trim / bandpass / spectral-gate / normalize)
       -> feature extraction (MFCC + spectral + ZCR + RMS + tempo)
       -> RandomForest inference (with mock heuristic fallback)
       -> interactive dashboard (waveform + log-mel + probability + metadata)
       -> active-learning loop (correct label -> append to CSV -> retrain)
"""

from __future__ import annotations

import io
import os
import sys
import time
import wave
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st
import plotly.graph_objects as go

# Make project importable
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from src.audio_processing import (
    load_audio, trim_silence, bandpass_filter, spectral_gate_denoise,
    normalize_peak, to_wav_bytes, dominant_frequencies, AudioBundle,
)
from src.feature_extraction import extract_features, compute_mel_spectrogram
from src.ml_pipeline import AcousticClassifier, Retrainer, CLASS_NAMES
from src.active_learning import log_prediction, dataset_summary, prediction_history
from src.visualization import (
    waveform_plotly, spectrogram_plotly, probability_bar_plotly,
    feature_summary_table, dominant_freq_plotly,
)


# ---------------------------------------------------------------------------
# Page config + styling
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="Underwater Acoustic Classifier",
    page_icon="🌊",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Inline CSS for a more polished look (deep-sea theme)
st.markdown("""
<style>
    .main .block-container { padding-top: 1.5rem; max-width: 1400px; }
    .stApp { background-color: #060d1a; }
    h1, h2, h3, h4, h5 { color: #e2e8f0 !important; font-weight: 600; }
    .stMetric { background-color: #0f172a; border: 1px solid #1e293b;
                border-radius: 10px; padding: 12px 16px; }
    .stMetric label { color: #94a3b8 !important; font-size: 0.78rem !important;
                      text-transform: uppercase; letter-spacing: 0.05em; }
    .stMetric div[data-testid="stMetricValue"] { color: #22d3ee !important;
                                                  font-size: 1.5rem !important; }
    .css-1d391kg, .css-1v0mbdj { background-color: #0b1220; }
    .stFileUploader { background-color: #0f172a; border-radius: 10px;
                      border: 1px dashed #334155; padding: 12px; }
    .prediction-banner {
        background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
        padding: 18px 22px; border-radius: 12px;
        border-left: 5px solid #22d3ee; margin: 10px 0;
    }
    .prediction-banner .label {
        font-size: 1.4rem; font-weight: 700; color: #22d3ee;
    }
    .prediction-banner .conf {
        font-size: 2.2rem; font-weight: 800; color: #f1f5f9;
    }
    .prediction-banner .sub {
        font-size: 0.85rem; color: #94a3b8;
    }
    .section-card {
        background-color: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 12px;
    }
    .badge {
        display: inline-block; padding: 3px 10px; border-radius: 12px;
        font-size: 0.75rem; font-weight: 600; margin-right: 4px;
    }
    .badge-biophonic     { background: #10b981; color: #052e16; }
    .badge-anthropogenic { background: #f59e0b; color: #422006; }
    .badge-geophonic     { background: #3b82f6; color: #0a1a2e; }
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------

def init_state():
    defaults = {
        "classifier": None,
        "retrainer": None,
        "audio_bundle": None,
        "processed_y": None,
        "sr": None,
        "features": None,
        "prediction": None,
        "feature_cache": None,    # cache features of processed_y
        "pred_cache_key": None,   # signature to know when to recompute
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

init_state()


def get_classifier() -> AcousticClassifier:
    if st.session_state.classifier is None:
        st.session_state.classifier = AcousticClassifier()
    return st.session_state.classifier


def get_retrainer() -> Retrainer:
    if st.session_state.retrainer is None:
        st.session_state.retrainer = Retrainer()
    return st.session_state.retrainer


# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

st.markdown("""
<div style="display:flex; align-items:center; gap:14px; padding-bottom:8px;">
    <div style="font-size:2.6rem;">🌊</div>
    <div>
        <h1 style="margin:0; padding:0;">Underwater Acoustic Classifier</h1>
        <p style="margin:2px 0 0 0; color:#94a3b8; font-size:0.95rem;">
            AI-powered classification of hydrophone recordings into
            <span class="badge badge-biophonic">Biophonic</span>
            <span class="badge badge-anthropogenic">Anthropogenic</span>
            <span class="badge badge-geophonic">Geophonic</span>
            sound sources
        </p>
    </div>
</div>
""", unsafe_allow_html=True)

# Model status bar
clf = get_classifier()
retrainer = get_retrainer()
ds = dataset_summary()
cols = st.columns([1, 1, 1, 1, 1])
cols[0].metric("Model version", clf.version)
cols[1].metric("Dataset size", f"{ds['total']} samples")
cols[2].metric("Biophonic", f"{ds['per_class'].get('Biophonic', 0)}")
cols[3].metric("Anthropogenic", f"{ds['per_class'].get('Anthropogenic', 0)}")
cols[4].metric("Geophonic", f"{ds['per_class'].get('Geophonic', 0)}")

st.markdown("---")


# ---------------------------------------------------------------------------
# Sidebar: upload + preprocessing controls
# ---------------------------------------------------------------------------

st.sidebar.markdown("## 🎛️ Controls")

# 1) Load sample (for instant demo)
st.sidebar.markdown("### Quick test")
sample_dir = ROOT / "data" / "samples"
sample_files = sorted(sample_dir.glob("*.wav")) if sample_dir.exists() else []
if sample_files:
    sample_options = ["— pick a synthetic sample —"] + [f.name for f in sample_files]
    picked = st.sidebar.selectbox("Synthetic samples", sample_options, index=0)
else:
    picked = "— pick a synthetic sample —"

use_sample = picked != "— pick a synthetic sample —"

# 2) Upload
uploaded = st.sidebar.file_uploader(
    "Upload hydrophone audio", type=["wav", "mp3", "flac"],
    help="Raw hydrophone recording in WAV/MP3/FLAC format."
)

# Decide which input to load
load_target = None
if uploaded is not None:
    load_target = uploaded
elif use_sample:
    load_target = sample_dir / picked

# 3) Preprocessing controls
st.sidebar.markdown("### Preprocessing")
enable_trim = st.sidebar.checkbox("Trim silence", value=True, help="Remove leading/trailing silence below -30 dB")
trim_db = st.sidebar.slider("Trim threshold (dB)", 10, 60, 30, disabled=not enable_trim)

enable_bandpass = st.sidebar.checkbox("Bandpass filter", value=True)
bp_low = st.sidebar.slider("Low cutoff (Hz)", 10, 1000, 50, disabled=not enable_bandpass)
bp_high = st.sidebar.slider("High cutoff (Hz)", 1000, 11000, 8000, disabled=not enable_bandpass)

enable_denoise = st.sidebar.checkbox("Spectral-gate denoise", value=False)
noise_strength = st.sidebar.slider("Noise reduction strength", 0.1, 1.5, 0.5, disabled=not enable_denoise)

enable_normalize = st.sidebar.checkbox("Peak normalize", value=True)

process_btn = st.sidebar.button("▶ Process & Classify", type="primary", use_container_width=True,
                                disabled=(load_target is None))


# ---------------------------------------------------------------------------
# Processing pipeline (runs on button press)
# ---------------------------------------------------------------------------

def run_pipeline(bundle: AudioBundle, do_trim, do_bp, do_dn, do_norm) -> np.ndarray:
    """Apply preprocessing chain and return processed waveform."""
    y = bundle.y.copy()
    if do_trim and len(y) > bundle.sr:
        try:
            y, _ = trim_silence(y, bundle.sr, top_db=trim_db)
        except Exception:
            pass
    if do_bp:
        y = bandpass_filter(y, bundle.sr, low=bp_low, high=bp_high, order=4)
    if do_dn:
        y = spectral_gate_denoise(y, bundle.sr, noise_strength=noise_strength)
    if do_norm:
        y = normalize_peak(y)
    return y.astype(np.float32)


if process_btn and load_target is not None:
    with st.spinner("Loading audio…"):
        try:
            bundle = load_audio(load_target)
        except Exception as e:
            st.error(f"Failed to load audio: {e}")
            bundle = None
    if bundle is not None:
        with st.spinner("Preprocessing + extracting features + inferring…"):
            y_proc = run_pipeline(bundle, enable_trim, enable_bandpass, enable_denoise, enable_normalize)
            feats = extract_features(y_proc, bundle.sr)
            pred = clf.predict(feats.vector)
        # Store state
        st.session_state.audio_bundle = bundle
        st.session_state.processed_y = y_proc
        st.session_state.sr = bundle.sr
        st.session_state.features = feats
        st.session_state.prediction = pred
        # Log the prediction
        log_prediction(feats.vector, pred.label, pred.confidence_pct)
        st.success(f"Classified as **{pred.label}** with {pred.confidence_pct:.1f}% confidence.")


# ---------------------------------------------------------------------------
# Main dashboard
# ---------------------------------------------------------------------------

bundle = st.session_state.audio_bundle
y_proc = st.session_state.processed_y
sr = st.session_state.sr
feats = st.session_state.features
pred = st.session_state.prediction

if bundle is None:
    st.info("👈 Upload a hydrophone recording or pick a synthetic sample from the sidebar, then click **Process & Classify**.")
    st.markdown("""
    <div class="section-card">
        <h4>What this prototype does</h4>
        <ul style="color:#cbd5e1;">
            <li><b>Preprocesses</b> raw audio with silence trimming, bandpass filtering, and spectral-gating noise reduction.</li>
            <li><b>Extracts</b> MFCCs, spectral centroid/rolloff/bandwidth, zero-crossing rate, RMS energy, and tempo.</li>
            <li><b>Classifies</b> the clip into Biophonic / Anthropogenic / Geophonic with a RandomForest model (trained on synthetic hydrophone data).</li>
            <li><b>Visualizes</b> the waveform, log-mel spectrogram, dominant frequencies, and class probabilities.</li>
            <li><b>Active learning</b>: correct wrong predictions, append the labeled sample to the dataset, and retrain the model in-place.</li>
        </ul>
    </div>
    """, unsafe_allow_html=True)
else:
    # ----- Audio player + metadata banner -------------------------------
    col_left, col_right = st.columns([2, 1])

    with col_left:
        st.markdown("### 🔊 Audio Player")
        # Play processed audio
        wav_bytes = to_wav_bytes(y_proc, sr)
        st.audio(wav_bytes, format="audio/wav")
        # Plot waveform (with vertical line synced via JS would need a custom
        # component; we plot static waveform + a small note about playback sync)
        st.plotly_chart(waveform_plotly(y_proc, sr, title="Processed Waveform"),
                        use_container_width=True)
        # Log-mel spectrogram
        log_S = compute_mel_spectrogram(y_proc, sr, n_mels=128)
        st.plotly_chart(spectrogram_plotly(log_S, sr, hop_length=512,
                                            title="Log-Mel Spectrogram (dB)"),
                        use_container_width=True)

    with col_right:
        st.markdown("### 🏷️ Classification")
        # Prediction banner
        color_map = {"Biophonic": "#10b981", "Anthropogenic": "#f59e0b", "Geophonic": "#3b82f6"}
        c = color_map.get(pred.label, "#22d3ee")
        st.markdown(f"""
        <div class="prediction-banner" style="border-left-color:{c};">
            <div class="sub">PREDICTED CLASS</div>
            <div class="label" style="color:{c};">{pred.label}</div>
            <div class="conf">{pred.confidence_pct:.1f}%</div>
        </div>
        """, unsafe_allow_html=True)

        # Probability breakdown
        st.plotly_chart(probability_bar_plotly(pred.probabilities, pred.label),
                        use_container_width=True)

        # Signal metadata
        st.markdown("#### Signal Metadata")
        meta_df = pd.DataFrame(list(bundle.meta.as_dict().items()),
                               columns=["Field", "Value"])
        st.dataframe(meta_df, use_container_width=True, hide_index=True, height=240)

        # Dominant frequencies
        dom_freqs = dominant_frequencies(y_proc, sr, top_n=5)
        st.plotly_chart(dominant_freq_plotly(dom_freqs), use_container_width=True)

    st.markdown("---")

    # ----- Tabs: Features / Active Learning / Model ---------------------
    tab_feat, tab_al, tab_model = st.tabs([
        "📊 Feature Extraction",
        "🎓 Active Learning",
        "🤖 Model Details",
    ])

    # --- Tab: Feature extraction ---------------------------------------
    with tab_feat:
        st.markdown("#### Extracted acoustic features")
        st.caption(f"Feature vector dimension: **{len(feats.vector)}** "
                   f"(13 MFCC means + 13 MFCC stds + 13 scalar stats)")
        st.plotly_chart(feature_summary_table(feats.stats), use_container_width=True)

        st.markdown("#### Feature vector (first 13 = MFCC means, next 13 = MFCC stds, last 13 = scalars)")
        with st.expander("Show raw feature vector", expanded=False):
            feat_df = pd.DataFrame({
                "name": feats.feature_names,
                "value": feats.vector,
            })
            st.dataframe(feat_df, use_container_width=True, hide_index=True)

    # --- Tab: Active learning ----------------------------------------
    with tab_al:
        st.markdown("#### Correct the label (active learning)")
        st.markdown("If the model misclassified the clip, choose the correct label below. "
                    "The feature vector will be appended to the labeled dataset and used "
                    "during the next retraining step.")

        chosen_label = st.radio("Correct label", CLASS_NAMES, index=CLASS_NAMES.index(pred.label),
                                horizontal=True)
        commit_btn = st.button("✓ Save correction to dataset", type="primary")
        if commit_btn:
            retrainer.append_sample(feats.vector, chosen_label, source="user")
            log_prediction(feats.vector, pred.label, pred.confidence_pct,
                           user_corrected=chosen_label)
            st.success(f"Appended 1 sample labeled **{chosen_label}** to dataset.")
            st.rerun()

        st.markdown("---")
        st.markdown("#### Retrain the model")
        st.markdown("Trigger an incremental fine-tune of the RandomForest on the accumulated dataset. "
                    "The model version bumps and the new accuracy is recorded in history.")
        ds_now = dataset_summary()
        st.caption(f"Dataset now: **{ds_now['total']}** samples "
                   f"(Biophonic {ds_now['per_class'].get('Biophonic', 0)} · "
                   f"Anthropogenic {ds_now['per_class'].get('Anthropogenic', 0)} · "
                   f"Geophonic {ds_now['per_class'].get('Geophonic', 0)})")
        retrain_btn = st.button("🔄 Retrain model", type="secondary")
        if retrain_btn:
            with st.spinner("Retraining RandomForest…"):
                result = retrainer.retrain(st.session_state.classifier)
            if result.get("status") == "ok":
                acc_str = f"{result['accuracy']*100:.1f}%" if result.get("accuracy") is not None else "N/A"
                st.success(
                    f"Retrained. New version: **{result['version']}** · "
                    f"trained on **{result['trained_on']}** samples · "
                    f"CV accuracy: {acc_str}"
                )
                st.rerun()
            else:
                st.warning(result.get("message", "Retrain failed."))

    # --- Tab: Model details -------------------------------------------
    with tab_model:
        st.markdown("#### Model pipeline")
        if st.session_state.classifier.pipeline is not None:
            st.code(str(st.session_state.classifier.pipeline), language="text")
        else:
            st.info("Using **mock heuristic classifier**. Run "
                    "`python scripts/train_baseline.py` to package a RandomForest.")
        st.markdown("#### Version history")
        hist = st.session_state.classifier.history
        if hist:
            hist_df = pd.DataFrame(hist)
            st.dataframe(hist_df, use_container_width=True, hide_index=True)
        else:
            st.caption("No history yet.")
        st.markdown("#### Recent predictions")
        recent = prediction_history()[-10:]
        if recent:
            st.dataframe(pd.DataFrame(recent), use_container_width=True, hide_index=True)
        else:
            st.caption("No predictions logged yet.")
