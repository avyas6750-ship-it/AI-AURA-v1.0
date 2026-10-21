---
Task ID: full-prototype
Agent: main
Task: Build a complete, functional prototype for an interactive AI-powered Underwater Acoustic Classification GUI (Streamlit).

Work Log:
- Verified Python 3.12 env; installed streamlit, librosa, soundfile, scipy, scikit-learn, matplotlib, plotly, pandas, joblib via pip --break-system-packages.
- Created project structure under /home/z/my-project/{src,scripts,data/samples,models,download}.
- Implemented src/audio_processing.py: load WAV/MP3/FLAC, trim silence, bandpass filter, spectral-gate denoise, peak normalize, dominant frequency detection, WAV byte export.
- Implemented src/feature_extraction.py: 39-dim feature vector (13 MFCC means + 13 MFCC stds + 13 scalar stats including spectral centroid/rolloff/bandwidth/flatness, ZCR, RMS, tempo). Plus log-mel spectrogram helper.
- Implemented src/ml_pipeline.py: AcousticClassifier (loads baseline_model.joblib OR falls back to mock heuristic) + Retrainer (CSV append + incremental RandomForest retrain + version bump).
- Implemented src/visualization.py: Plotly waveform, log-mel spectrogram heatmap, probability bar chart, feature summary table, dominant frequency bar chart.
- Implemented src/active_learning.py: CSV label store + JSON prediction history log.
- Wrote scripts/generate_mock_audio.py: synthesizes whale moans, dolphin whistles, fish chorus (Biophonic); ship propeller, sonar ping, pile driving (Anthropogenic); rain hiss, earthquake rumble, ice cracks (Geophonic). 8 clips per class = 24 total.
- Wrote scripts/train_baseline.py: trains StandardScaler + RandomForestClassifier(n_estimators=200, class_weight='balanced') on the synthetic features. Achieves 100% 2-fold CV accuracy on the clean synthetic dataset.
- Wrote app.py: Streamlit GUI with deep-sea themed CSS, sidebar preprocessing controls, dashboard layout (audio player + waveform + spectrogram + classification banner + probability bar + metadata + dominant freqs), and 3 tabs (Feature Extraction, Active Learning, Model Details).
- Fixed critical bug in ml_pipeline.predict(): sklearn's predict_proba returns columns in classes_ order (alphabetical), not in CLASS_NAMES order. Now uses fitted classes_ to map probabilities correctly.
- Fixed librosa 0.10 deprecation: prefer librosa.feature.rhythm.tempo over librosa.beat.tempo.
- Wrote scripts/test_e2e.py: end-to-end test exercising full pipeline on each class + retrain + history log. ALL TESTS PASSED.
- Wrote scripts/launch_streamlit.py: uses subprocess.Popen(start_new_session=True) to fully detach Streamlit from the parent shell so it survives in the kata container.
- Wrote README.md with full install/run instructions.
- Generated 24 sample .wav files, trained baseline model (version 1.0.0, 100% CV accuracy).
- Launched Streamlit on 0.0.0.0:8501 (PID 1832, parent=init). HTTP 200 verified on /_stcore/health and /.

Stage Summary:
- Project: /home/z/my-project/
- Entry: app.py (run with `streamlit run app.py`)
- Model: models/baseline_model.joblib (version 1.0.0, RandomForest 200 trees)
- Dataset: data/labeled_features.csv (24 synthetic samples, 8 per class)
- Samples: data/samples/*.wav (24 files, 6s @ 22050 Hz each)
- Streamlit server: detached, PID 1832, listening on 0.0.0.0:8501
- All 5 required components implemented: A) Upload+Preprocessing, B) Feature Extraction, C) AI/ML Inference, D) Interactive GUI Dashboard, E) Active Learning & Model Refinement
