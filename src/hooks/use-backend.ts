"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Build the API URL for a given path.
 *
 * On Vercel (production), the Python serverless function lives at /api/py/*.
 * We detect the Vercel environment via the URL hostname (.vercel.app) and
 * rewrite /py/* → /api/py/* automatically.
 *
 * In local dev, Next.js's next.config.ts rewrite proxies /py/* to the local
 * FastAPI server on port 8000 — so we just use /py/* as-is.
 */
function apiUrl(path: string) {
  // On Vercel production, route /py/* to /api/py/* (the Python serverless function)
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
    if (path.startsWith("/py/")) {
      return `/api${path}`;
    }
    if (path.startsWith("py/")) {
      return `/api/${path}`;
    }
  }
  return path;
}

export interface PreprocessingParams {
  enable_trim: boolean;
  trim_db: number;
  enable_bandpass: boolean;
  bp_low: number;
  bp_high: number;
  enable_denoise: boolean;
  noise_strength: number;
  enable_normalize: boolean;
}

export interface SegmentationParams {
  window_sec: number;
  hop_sec: number;
  min_event_sec: number;
  merge_gap_sec: number;
  confidence_threshold: number;
}

export const DEFAULT_SEGMENTATION: SegmentationParams = {
  window_sec: 1.0,
  hop_sec: 0.5,
  min_event_sec: 0.3,
  merge_gap_sec: 0.4,
  confidence_threshold: 0.4,
};

export interface HydroEvent {
  id: string;
  class: "Biophonic" | "Anthropogenic" | "Geophonic";
  subclass: string;
  confidence_pct: number;
  confidence: number;
  probabilities: Record<string, number>;
  start: number;
  end: number;
  duration_sec: number;
  audio_base64: string;
  waveform: { t: number[]; y: number[] };
  spectrogram: { z: number[][]; x: number[]; y: number[] };
  dominant_freqs: { freq: number; magnitude: number }[];
  features: {
    vector: number[];
    names: string[];
    stats: Record<string, { min: number; max: number; mean: number; std: number }>;
  };
  meta: Record<string, string>;
}

export interface SegmentResult {
  events: HydroEvent[];
  summary: {
    total: number;
    per_class: Record<string, number>;
    per_class_pct: Record<string, number>;
  };
  global_meta: Record<string, string>;
  global_audio_base64: string;
  global_waveform: { t: number[]; y: number[] };
  global_spectrogram: { z: number[][]; x: number[]; y: number[] };
  duration_sec: number;
  sample_rate: number;
  model_version: string;
  segmentation_params: SegmentationParams;
}

// Legacy single-event result (kept for backward compat if /py/process is used)
export interface ProcessResult {
  meta: Record<string, string>;
  waveform: { t: number[]; y: number[] };
  spectrogram: { z: number[][]; x: number[]; y: number[] };
  dominant_freqs: { freq: number; magnitude: number }[];
  features: {
    vector: number[];
    names: string[];
    stats: Record<string, { min: number; max: number; mean: number; std: number }>;
  };
  prediction: {
    label: string;
    confidence_pct: number;
    probabilities: Record<string, number>;
  };
  audio_base64: string;
  model_version: string;
}

export interface ModelInfo {
  version: string;
  history: Array<{
    version: string;
    accuracy: number | null;
    trained_on: number;
    note: string;
  }>;
  pipeline: {
    steps?: Array<{ name: string; class: string; n_estimators?: number; class_weight?: string }>;
    error?: string;
  } | string | null;
  dataset: { total: number; per_class: Record<string, number> };
}

export interface SampleList {
  samples: string[];
  grouped: Record<string, string[]>;
}

export interface SubclassCatalog {
  Biophonic: string[];
  Anthropogenic: string[];
  Geophonic: string[];
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = j.detail || j.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

/** Build a multipart/form-data body for file upload + scalar fields. */
function buildFormData(file: File | Blob, fields: Record<string, string | boolean | number>) {
  const fd = new FormData();
  fd.append("file", file);
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, String(v));
  }
  return fd;
}

export function useBackend() {
  const [samples, setSamples] = useState<SampleList>({ samples: [], grouped: {} });
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [segmentResult, setSegmentResult] = useState<SegmentResult | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [correctedLabel, setCorrectedLabel] = useState<string | null>(null);
  const [subclassCatalog, setSubclassCatalog] = useState<SubclassCatalog | null>(null);

  const refreshModelInfo = useCallback(async () => {
    try {
      const info = await fetchJson<ModelInfo>(apiUrl("/py/model"));
      setModelInfo(info);
    } catch (e) {
      console.error("Failed to fetch model info:", e);
    }
  }, []);

  const refreshSamples = useCallback(async () => {
    try {
      const data = await fetchJson<SampleList>(apiUrl("/py/samples"));
      setSamples(data);
    } catch (e) {
      console.error("Failed to fetch samples:", e);
    }
  }, []);

  const refreshSubclassCatalog = useCallback(async () => {
    try {
      const data = await fetchJson<SubclassCatalog>(apiUrl("/py/subclasses"));
      setSubclassCatalog(data);
    } catch (e) {
      console.error("Failed to fetch subclasses:", e);
    }
  }, []);

  useEffect(() => {
    refreshSamples();
    refreshModelInfo();
    refreshSubclassCatalog();
  }, [refreshSamples, refreshModelInfo, refreshSubclassCatalog]);

  const segmentFile = useCallback(
    async (
      file: File | Blob,
      filename: string,
      preprocessing: PreprocessingParams,
      segmentation: SegmentationParams = DEFAULT_SEGMENTATION,
    ) => {
      setProcessing(true);
      setError(null);
      setCorrectedLabel(null);
      setSelectedEventId(null);
      try {
        const fileObj = file instanceof File ? file : new File([file], filename);
        const fd = buildFormData(fileObj, { ...preprocessing, ...segmentation });
        const r = await fetchJson<SegmentResult>(apiUrl("/py/segment"), {
          method: "POST",
          body: fd,
        });
        setSegmentResult(r);
        // Auto-select the first event (highest confidence)
        if (r.events.length > 0) {
          const top = [...r.events].sort((a, b) => b.confidence_pct - a.confidence_pct)[0];
          setSelectedEventId(top.id);
        }
        refreshModelInfo();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setProcessing(false);
      }
    },
    [refreshModelInfo],
  );

  const segmentSample = useCallback(
    async (
      sampleName: string,
      preprocessing: PreprocessingParams,
      segmentation: SegmentationParams = DEFAULT_SEGMENTATION,
    ) => {
      setProcessing(true);
      setError(null);
      setCorrectedLabel(null);
      setSelectedEventId(null);
      try {
        const r = await fetch(apiUrl(`/py/samples/${encodeURIComponent(sampleName)}`));
        if (!r.ok) throw new Error(`Failed to fetch sample: HTTP ${r.status}`);
        const blob = await r.blob();
        await segmentFile(blob, sampleName, preprocessing, segmentation);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setProcessing(false);
      }
    },
    [segmentFile],
  );

  // Legacy single-clip processing (kept for the "Correct the label" flow which
  // sends the whole file to /py/correct)
  const correctLabel = useCallback(
    async (
      file: File | Blob,
      filename: string,
      label: string,
      preprocessing: PreprocessingParams,
    ) => {
      setCorrecting(true);
      setError(null);
      try {
        const fileObj = file instanceof File ? file : new File([file], filename);
        const fd = buildFormData(fileObj, { label, ...preprocessing });
        await fetchJson(apiUrl("/py/correct"), {
          method: "POST",
          body: fd,
        });
        setCorrectedLabel(label);
        refreshModelInfo();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setCorrecting(false);
      }
    },
    [refreshModelInfo],
  );

  const correctSample = useCallback(
    async (
      sampleName: string,
      label: string,
      preprocessing: PreprocessingParams,
    ) => {
      setCorrecting(true);
      setError(null);
      try {
        const r = await fetch(apiUrl(`/py/samples/${encodeURIComponent(sampleName)}`));
        if (!r.ok) throw new Error(`Failed to fetch sample: HTTP ${r.status}`);
        const blob = await r.blob();
        await correctLabel(blob, sampleName, label, preprocessing);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setCorrecting(false);
      }
    },
    [correctLabel],
  );

  const retrain = useCallback(async () => {
    setRetraining(true);
    setError(null);
    try {
      const r = await fetchJson<{ status: string; version?: string; accuracy?: number | null; trained_on?: number; message?: string }>(
        apiUrl("/py/retrain"),
        { method: "POST" },
      );
      await refreshModelInfo();
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    } finally {
      setRetraining(false);
    }
  }, [refreshModelInfo]);

  const selectEvent = useCallback((eventId: string | null) => {
    setSelectedEventId(eventId);
    setCorrectedLabel(null);
  }, []);

  return {
    samples,
    modelInfo,
    subclassCatalog,
    segmentResult,
    selectedEventId,
    selectedEvent: segmentResult?.events.find((e) => e.id === selectedEventId) ?? null,
    processing,
    error,
    correcting,
    retraining,
    correctedLabel,
    setCorrectedLabel,
    segmentFile,
    segmentSample,
    correctLabel,
    correctSample,
    retrain,
    refreshModelInfo,
    selectEvent,
  };
}

export { apiUrl };
