"""Plotly-based visualizations for the acoustic dashboard.

Renders:
  - Interactive waveform (amplitude vs. time)
  - Log-mel spectrogram heatmap (frequency vs. time, dB)
  - Classification probability bar chart
  - Feature summary table-friendly dict
"""

from __future__ import annotations

import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots


# Color palette tuned for underwater theme
PALETTE = {
    "Biophonic": "#10b981",       # emerald
    "Anthropogenic": "#f59e0b",   # amber
    "Geophonic": "#3b82f6",       # blue
    "waveform": "#22d3ee",        # cyan
    "spectrogram_low": "#0b1d3a",
    "spectrogram_high": "#fde047",
}


# ---------------------------------------------------------------------------
# Waveform
# ---------------------------------------------------------------------------

def waveform_plotly(y: np.ndarray, sr: int, title: str = "Waveform") -> go.Figure:
    """Interactive waveform plot. Downsamples for very long clips."""
    # downsample for display if huge
    max_points = 4000
    if len(y) > max_points:
        step = len(y) // max_points
        y_disp = y[::step]
    else:
        y_disp = y
        step = 1
    t = np.arange(len(y_disp)) * step / sr
    fig = go.Figure()
    fig.add_trace(go.Scattergl(
        x=t, y=y_disp, mode="lines",
        line=dict(color=PALETTE["waveform"], width=1),
        name="amplitude",
    ))
    fig.update_layout(
        title=title,
        xaxis_title="Time (s)",
        yaxis_title="Amplitude",
        template="plotly_dark",
        height=260,
        margin=dict(l=40, r=20, t=40, b=40),
        paper_bgcolor="#0b1220",
        plot_bgcolor="#0b1220",
    )
    return fig


# ---------------------------------------------------------------------------
# Log-mel spectrogram
# ---------------------------------------------------------------------------

def spectrogram_plotly(log_S: np.ndarray, sr: int, hop_length: int = 512,
                       title: str = "Log-Mel Spectrogram (dB)") -> go.Figure:
    """Heatmap of log-mel spectrogram. log_S shape: (n_mels, T)."""
    n_mels, T = log_S.shape
    t = np.arange(T) * hop_length / sr
    # mel freq axis (approximate - librosa's mel scale)
    mel_freqs = librosa_mel_frequencies(n_mels, sr)
    fig = go.Figure(data=go.Heatmap(
        z=log_S,
        x=t,
        y=mel_freqs,
        colorscale=[[0, PALETTE["spectrogram_low"]],
                    [0.5, "#1e3a8a"],
                    [0.75, "#22d3ee"],
                    [1.0, PALETTE["spectrogram_high"]]],
        zmid=float(np.median(log_S)),
        colorbar=dict(title="dB"),
        hovertemplate="Time: %{x:.2f}s<br>Freq: %{y:.0f}Hz<br>Level: %{z:.1f}dB<extra></extra>",
    ))
    fig.update_layout(
        title=title,
        xaxis_title="Time (s)",
        yaxis_title="Frequency (Hz)",
        template="plotly_dark",
        height=380,
        margin=dict(l=40, r=20, t=40, b=40),
        paper_bgcolor="#0b1220",
        plot_bgcolor="#0b1220",
        yaxis=dict(type="log"),
    )
    return fig


def librosa_mel_frequencies(n_mels: int, sr: int, fmin: float = 0.0, fmax: float = None):
    """Wrap librosa.filters.mel_frequencies to get the Hz of each mel band."""
    import librosa
    if fmax is None:
        fmax = sr / 2
    return librosa.filters.mel_frequencies(n_mels=n_mels + 2, fmin=fmin, fmax=fmax)[1:-1]


# ---------------------------------------------------------------------------
# Probability bar chart
# ---------------------------------------------------------------------------

def probability_bar_plotly(probabilities: dict, predicted_label: str) -> go.Figure:
    """Horizontal bar chart of class probabilities."""
    classes = list(probabilities.keys())
    probs = [probabilities[c] * 100 for c in classes]
    colors = [PALETTE.get(c, "#94a3b8") for c in classes]
    fig = go.Figure(data=go.Bar(
        x=probs,
        y=classes,
        orientation="h",
        marker_color=colors,
        text=[f"{p:.1f}%" for p in probs],
        textposition="outside",
        hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
    ))
    fig.update_layout(
        title="Classification Confidence",
        xaxis_title="Probability (%)",
        xaxis=dict(range=[0, 110]),
        yaxis=dict(autorange="reversed"),
        template="plotly_dark",
        height=220,
        margin=dict(l=120, r=80, t=40, b=40),
        paper_bgcolor="#0b1220",
        plot_bgcolor="#0b1220",
        showlegend=False,
    )
    # Highlight the predicted class with a thicker outline
    for i, c in enumerate(classes):
        if c == predicted_label:
            fig.data[0].marker.line = dict(color="#ffffff", width=2)
    return fig


# ---------------------------------------------------------------------------
# Feature summary table
# ---------------------------------------------------------------------------

def feature_summary_table(stats: dict) -> go.Figure:
    """Render a tidy summary table of feature statistics."""
    headers = ["Feature", "Mean", "Std", "Min", "Max"]
    cells = []
    for k, v in stats.items():
        cells.append([
            k,
            f"{v['mean']:.3f}",
            f"{v['std']:.3f}",
            f"{v['min']:.3f}",
            f"{v['max']:.3f}",
        ])
    fig = go.Figure(data=[go.Table(
        header=dict(values=headers,
                    fill_color="#1e293b",
                    font=dict(color="#f1f5f9", size=12),
                    align="left"),
        cells=dict(values=list(zip(*cells)),
                   fill_color="#0f172a",
                   font=dict(color="#cbd5e1", size=11),
                   align="left",
                   height=24),
    )])
    fig.update_layout(
        template="plotly_dark",
        height=360,
        margin=dict(l=10, r=10, t=10, b=10),
        paper_bgcolor="#0b1220",
    )
    return fig


# ---------------------------------------------------------------------------
# Dominant frequencies bar chart
# ---------------------------------------------------------------------------

def dominant_freq_plotly(freqs: list[dict]) -> go.Figure:
    """Bar chart of top-N dominant frequencies."""
    if not freqs:
        fig = go.Figure()
        fig.update_layout(template="plotly_dark",
                          paper_bgcolor="#0b1220",
                          height=240,
                          annotations=[dict(text="No dominant frequencies detected",
                                             showarrow=False, font=dict(color="#94a3b8"))])
        return fig
    f_hz = [f["freq"] for f in freqs]
    mag = [f["magnitude"] for f in freqs]
    # Normalize magnitudes for visualization
    mag = np.array(mag)
    if mag.max() > 0:
        mag = mag / mag.max() * 100
    fig = go.Figure(data=go.Bar(
        x=[f"{f:.0f} Hz" for f in f_hz],
        y=mag,
        marker_color=PALETTE["waveform"],
        text=[f"{f:.0f} Hz" for f in f_hz],
        textposition="outside",
    ))
    fig.update_layout(
        title="Top Dominant Frequencies",
        xaxis_title="Frequency",
        yaxis_title="Relative magnitude (%)",
        template="plotly_dark",
        height=240,
        margin=dict(l=40, r=20, t=40, b=40),
        paper_bgcolor="#0b1220",
        plot_bgcolor="#0b1220",
    )
    return fig
