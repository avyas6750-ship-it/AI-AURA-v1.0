# 🌊 HYDROGRAPH — Underwater Acoustic Classifier

> **Listen to the ocean.**
> AI-powered classification of hydrophone recordings into **biophonic**, **anthropogenic**, and **geophonic** sound events — built for marine researchers, by marine researchers.

A mission-control dashboard for passive acoustic monitoring (PAM). Built with Next.js 16 + TypeScript + Tailwind on the frontend, FastAPI + Librosa + scikit-learn on the backend.

---

## 📸 Features

| Module | What it does |
|--------|--------------|
| **Multi-event detection** | Slides a window across the audio, classifies each window, then merges adjacent same-class windows into discrete events |
| **Real subclass inference** | "Humpback Whale", "Dolphin Whistle", "Cargo Ship", "Sonar Ping", "Pile Driving", "Rain Hiss", "Earthquake Rumble", "Ice Crack" — based on spectral features |
| **Interactive timeline** | Click any event block to inspect its audio, spectrogram, dominant frequencies, and metadata |
| **Active learning loop** | Correct misclassified events, append to dataset, retrain the RandomForest in-place (version bumps + CV accuracy tracked) |
| **Deep-space mission-control UI** | Animated hero, scroll-revealed sections, focus-cards nav hub, animated marine anchor logo, sticky header with animated icons |
| **Pre-trained baseline** | Ships with a 24-sample synthetic dataset and a RandomForest model (v1.0.0, 100% CV accuracy) |

---

## 🏗️ Tech Stack

**Frontend**
- Next.js 16 (App Router, Turbopack)
- React 19 + TypeScript 5
- Tailwind CSS 4 + shadcn/ui (New York style)
- Framer Motion for scroll animations
- Recharts for probability/donut/freq charts
- Custom SVG waveform + log-mel spectrogram (no plotly.js, keeps bundle small)

**Backend**
- FastAPI + Uvicorn
- Librosa 0.10 (MFCC, spectral features, log-mel)
- scikit-learn 1.5 (RandomForest classifier with incremental retraining)
- soundfile, scipy, numpy

---

## 📁 Project Structure

```
hydrograph/
├── app.py                          # Legacy Streamlit prototype (kept for reference)
├── render.yaml                     # Render Blueprint (2 services)
├── Procfile                        # Render single-service alternative
├── requirements.txt                # Python deps
├── package.json                    # Node deps + scripts
├── next.config.ts                  # /py/* rewrite → FastAPI
├── backend/
│   ├── __init__.py
│   └── api.py                      # FastAPI app (all endpoints under /py/*)
├── src/                            # Python ML modules
│   ├── audio_processing.py         # Load, trim, bandpass, spectral-gate
│   ├── feature_extraction.py       # 39-dim feature vector
│   ├── ml_pipeline.py              # AcousticClassifier + Retrainer
│   ├── visualization.py             # Plotly helpers (legacy, kept for app.py)
│   └── active_learning.py          # CSV label store + prediction history
├── src/app/                        # Next.js App Router
│   ├── layout.tsx                  # Root layout with hydro-theme
│   ├── page.tsx                    # Main dashboard (hero + 7 scroll sections)
│   └── globals.css                 # Tailwind + custom theme vars
├── src/components/
│   ├── scroll/anim.tsx             # Reveal, Stagger, AnimatedCounter, Parallax
│   ├── viz/                        # Waveform, Spectrogram, Donut, Sparkline
│   └── ui/                         # shadcn/ui + custom (hydro-focus-cards, hydro-logo, animated-icons)
├── src/hooks/use-backend.ts        # Frontend ↔ FastAPI hook
├── scripts/
│   ├── generate_mock_audio.py      # Synthesize whale/ship/rain test audio
│   ├── train_baseline.py           # Train baseline RandomForest
│   ├── build.sh                    # Post-build script (regenerates samples + model)
│   ├── start.sh                    # Single-service launcher (Next.js + FastAPI)
│   ├── launch_fastapi.py           # Detached launcher for dev
│   └── test_e2e.py                 # End-to-end test
├── data/
│   ├── samples/                    # 24 synthetic .wav files (8 per class)
│   └── labeled_features.csv        # Labeled feature dataset
├── models/
│   ├── baseline_model.joblib        # Trained Pipeline (StandardScaler + RF)
│   └── model_meta.json              # Version + accuracy history
└── public/                         # Static assets
```

---

## 🚀 Local Development

### Prerequisites
- **Node.js 20+** (recommend using [bun](https://bun.sh) for faster installs)
- **Python 3.12+**
- ~2GB free disk space (for node_modules + Python deps)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/hydrograph.git
cd hydrograph

# 2. Install Python deps
python -m venv .venv
source .venv/bin/activate          # on Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3. (Optional) Regenerate samples + train baseline
python scripts/generate_mock_audio.py 8
python scripts/train_baseline.py

# 4. Start FastAPI backend in one terminal
uvicorn backend.api:app --host 0.0.0.0 --port 8000 --reload

# 5. Start Next.js dev server in another terminal
bun install                         # or: npm install
bun run dev                         # or: npm run dev
```

Open **http://localhost:3000**.

---

## 🌐 Deploy to Render

### Option A — Render Blueprint (recommended, 2 services)

1. Push this repo to GitHub.
2. On Render, go to **Dashboard → New → Blueprint**.
3. Pick your GitHub repo. Render will detect `render.yaml` and create 2 services:
   - `hydrograph-api` (FastAPI on Python runtime, free tier)
   - `hydrograph-web` (Next.js on Node runtime, free tier)
4. Once `hydrograph-api` is deployed, copy its public URL (e.g. `https://hydrograph-api.onrender.com`).
5. Go to **`hydrograph-web` → Environment → Add Environment Variable**:
   - Key: `BACKEND_URL`
   - Value: `https://hydrograph-api.onrender.com` (no trailing slash)
6. Trigger a redeploy of `hydrograph-web`.

### Option B — Single-service deploy (simpler, both in one process)

1. Push this repo to GitHub.
2. On Render, go to **Dashboard → New → Web Service**.
3. Pick your GitHub repo. Render will detect the `Procfile` automatically:
   - **Build Command**: `pip install -r requirements.txt && bun install && bun run build && python scripts/generate_mock_audio.py 8 && python scripts/train_baseline.py`
   - **Start Command**: `bash scripts/start.sh`
4. Add env var: `PYTHON_VERSION` = `3.12.14` and `NODE_VERSION` = `20.18.0`.
5. Deploy. Render assigns `$PORT` automatically — the start script runs Next.js on `$PORT` and FastAPI on an internal port `8000`.

> ⚠️ Option B is simpler but shares resources between frontend + backend. For production use, prefer Option A.

---

## 🔌 API Reference

All backend endpoints live under `/py/*` and are proxied by Next.js (`next.config.ts → rewrites`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/py/health` | Health check + model version |
| GET | `/py/samples` | List of synthetic sample .wav files |
| GET | `/py/samples/{name}` | Download a sample .wav |
| POST | `/py/process` | Upload audio + preprocessing params → single prediction |
| POST | `/py/segment` | Upload audio + segmentation params → multi-event detection |
| POST | `/py/correct` | Append a corrected label to the dataset |
| POST | `/py/retrain` | Incremental RandomForest retrain |
| GET | `/py/model` | Model version + pipeline + dataset summary + history |
| GET | `/py/dataset` | Dataset summary |
| GET | `/py/predictions` | Recent prediction history |
| GET | `/py/subclasses` | Subclass label catalog |

---

## 🧪 Testing

```bash
# End-to-end test (loads each sample class, runs the full pipeline, exercises retrain)
python scripts/test_e2e.py
```

Expected output ends with `ALL TESTS PASSED ✅`.

---

## 📦 What's in the Box

- ✅ 24 synthetic hydrophone samples (8 biophonic + 8 anthropogenic + 8 geophonic)
- ✅ Pre-trained RandomForest baseline (v1.0.0, 100% CV accuracy on synthetic data)
- ✅ 14 subclass labels with feature-based inference
- ✅ Active learning loop with version-bumping retrain
- ✅ Scroll-animated UI with hero, focus cards, and 7 sequential sections
- ✅ Animated marine anchor brand mark + 3 animated icon buttons (Arrow, Menu, Volume)

---

## 🎯 What to Try Next

1. **Upload real hydrophone audio** — the bandpass filter (50 Hz – 8 kHz) is tuned for underwater energy.
2. **Stress-test multi-event detection** — upload a long recording with mixed sources.
3. **Active learning loop** — correct 3-4 misclassified events, click "Retrain RandomForest", watch the version bump.
4. **Tune segmentation params** — open "Segmentation" panel, try `window_sec=2.0` for sparser events or `0.5` for denser.
5. **Swap the model** — replace RandomForest with a 1D CNN over log-mel spectrograms (PyTorch) in `src/ml_pipeline.py` for higher accuracy on real recordings.

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

Built with ❤️ for ocean science.
