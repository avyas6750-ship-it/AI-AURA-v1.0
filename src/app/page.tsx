"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  useBackend,
  DEFAULT_SEGMENTATION,
  type PreprocessingParams,
  type SegmentationParams,
  type HydroEvent,
} from "@/hooks/use-backend";
import { WaveformChart } from "@/components/viz/waveform-chart";
import { SpectrogramChart } from "@/components/viz/spectrogram-chart";
import { ProbabilityChart } from "@/components/viz/probability-chart";
import { DominantFreqChart } from "@/components/viz/dominant-freq-chart";
import { DonutChart } from "@/components/viz/donut-chart";
import { Sparkline } from "@/components/viz/sparkline";
import {
  Reveal,
  Stagger,
  StaggerItem,
  AnimatedCounter,
  ScrollProgress,
  Parallax,
  SectionHeading,
  HeroTitle,
} from "@/components/scroll/anim";
import { motion } from "framer-motion";
import { HydroFocusCards, type HydroCard } from "@/components/ui/hydro-focus-cards";
import {
  AnimatedArrowButton,
  AnimatedMenuButton,
  AnimatedVolumeButton,
} from "@/components/ui/animated-icons";
import { HydroLogo, MarineAvatar } from "@/components/ui/hydro-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Waves,
  Upload,
  Play,
  Loader2,
  Brain,
  History,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Fish,
  Ship,
  CloudRain,
  Sparkles,
  Eye,
  Crosshair,
  BarChart3,
  Settings as SettingsIcon,
  Search,
  Volume2,
  Download,
  Activity,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter,
  ArrowUpDown,
  ArrowRight,
  ArrowDown,
  Radio,
} from "lucide-react";

const CLASS_LABELS = ["Biophonic", "Anthropogenic", "Geophonic"] as const;
type ClassLabel = (typeof CLASS_LABELS)[number];

const CLASS_COLORS: Record<ClassLabel, string> = {
  Biophonic: "#22d3ee",
  Anthropogenic: "#fbbf24",
  Geophonic: "#34d399",
};

const CLASS_ICONS: Record<ClassLabel, React.ElementType> = {
  Biophonic: Fish,
  Anthropogenic: Ship,
  Geophonic: CloudRain,
};

const DEFAULT_PREPROCESSING: PreprocessingParams = {
  enable_trim: true,
  trim_db: 30,
  enable_bandpass: true,
  bp_low: 50,
  bp_high: 8000,
  enable_denoise: false,
  noise_strength: 0.5,
  enable_normalize: true,
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const backend = useBackend();
  const [pre, setPre] = useState<PreprocessingParams>(DEFAULT_PREPROCESSING);
  const [seg, setSeg] = useState<SegmentationParams>(DEFAULT_SEGMENTATION);
  const [selectedSample, setSelectedSample] = useState<string>("");
  const [correctionLabel, setCorrectionLabel] = useState<ClassLabel>("Biophonic");
  const [activeTab, setActiveTab] = useState("waveform");
  const [showPrePanel, setShowPrePanel] = useState(false);
  const [showSegPanel, setShowSegPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  // Local ref for the last analyzed file blob (used by /py/correct)
  const lastFileRef = useRef<{ blob: Blob | null; name: string }>({ blob: null, name: "" });

  const handleProcessSample = useCallback(async () => {
    if (!selectedSample) {
      toast.error("Pick a sample first");
      return;
    }
    toast.info(`Analyzing "${selectedSample}"…`);
    lastFileRef.current = { blob: null, name: selectedSample };
    await backend.segmentSample(selectedSample, pre, seg);
    if (!backend.error) toast.success("Analysis complete");
  }, [selectedSample, pre, seg, backend]);

  const handleProcessUpload = useCallback(async () => {
    if (!uploadedFile) {
      toast.error("Upload an audio file first");
      return;
    }
    toast.info(`Analyzing "${uploadedFile.name}"…`);
    lastFileRef.current = { blob: uploadedFile, name: uploadedFile.name };
    await backend.segmentFile(uploadedFile, uploadedFile.name, pre, seg);
    if (!backend.error) toast.success("Analysis complete");
  }, [uploadedFile, pre, seg, backend]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setUploadedFile(f);
      setUploadedFileName(f.name);
    }
  }, []);

  const handleCorrect = useCallback(async () => {
    if (!backend.segmentResult) return;
    toast.info(`Saving correction as "${correctionLabel}"…`);
    if (lastFileRef.current.blob) {
      await backend.correctLabel(
        lastFileRef.current.blob,
        lastFileRef.current.name,
        correctionLabel,
        pre,
      );
    } else if (lastFileRef.current.name) {
      await backend.correctSample(lastFileRef.current.name, correctionLabel, pre);
    }
    if (!backend.error) toast.success(`Correction saved as ${correctionLabel}`);
  }, [backend, correctionLabel, pre]);

  const handleRetrain = useCallback(async () => {
    toast.info("Retraining RandomForest…");
    const r = await backend.retrain();
    if (r?.status === "ok") {
      const acc = r.accuracy != null ? `${(r.accuracy * 100).toFixed(1)}%` : "N/A";
      toast.success(`Retrained → v${r.version} (CV acc ${acc}, ${r.trained_on} samples)`);
    } else if (r) {
      toast.warning(r.message || "Retrain skipped");
    }
  }, [backend]);

  const handleDownloadClip = useCallback(() => {
    const evt = backend.selectedEvent;
    if (!evt) return;
    const url = `data:audio/wav;base64,${evt.audio_base64}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${evt.id}_${evt.class.toLowerCase().replace(/\s+/g, "-")}_${evt.subclass.toLowerCase().replace(/\s+/g, "-")}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Downloaded ${a.download}`);
  }, [backend.selectedEvent]);

  const segmentResult = backend.segmentResult;
  const modelInfo = backend.modelInfo;
  const selectedEvent = backend.selectedEvent;

  return (
    <div className="min-h-screen relative">
      <ScrollProgress />

      <div className="flex flex-col min-w-0 min-h-screen">
        <TopHeader
          onMenuClick={() => {
            // Menu button scrolls back to the focus-cards hub (the new nav)
            document.getElementById("focus-cards-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onArrowClick={() => {
            // Arrow button advances to the next logical section after the current scroll position
            const sections = [
              "upload-section",
              "signal-section",
              "detected-events",
              "events-list-section",
              "analysis-summary",
              "active-learning-section",
              "model-history",
            ];
            const scrollY = window.scrollY;
            const next = sections
              .map((id) => document.getElementById(id))
              .filter((el): el is HTMLElement => el !== null)
              .find((el) => el.offsetTop > scrollY + 80);
            if (next) {
              next.scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          onVolumeClick={() => {
            // Toggle mute on any playing audio element on the page
            const audios = Array.from(document.querySelectorAll("audio"));
            if (audios.length === 0) return;
            const anyMuted = audios.some((a) => a.muted);
            audios.forEach((a) => {
              a.muted = !anyMuted;
            });
          }}
          modelVersion={modelInfo?.version}
          datasetTotal={modelInfo?.dataset.total}
        />

        <main className="flex-1 overflow-y-auto">
          {/* =====================================================
              HERO SECTION - landing with animated title + CTA
              ===================================================== */}
          <HeroSection
            modelVersion={modelInfo?.version}
            datasetTotal={modelInfo?.dataset.total}
            onPickSample={() => {
              document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />

          {/* =====================================================
              FOCUS CARDS - hub for navigating to each section
              ===================================================== */}
          <section id="focus-cards-section" className="scroll-section px-4 md:px-6">
            <Reveal>
              <SectionHeading
                eyebrow="Quick Access"
                title="Pick a Workspace"
                subtitle="Hover a card to focus it. Click any card to jump straight to that section of the dashboard."
                icon={Sparkles}
                align="center"
              />
            </Reveal>
            <Reveal delay={0.15} className="mt-8 max-w-5xl mx-auto">
              <HydroFocusCards
                cards={[
                  {
                    id: "card-upload",
                    title: "Upload Data",
                    description: "Pick a synthetic sample or upload your own hydrophone recording.",
                    icon: Upload,
                    color: "#22d3ee",
                    onClick: () => {
                      document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    },
                  },
                  {
                    id: "card-signal",
                    title: "Acoustic Signal",
                    description: "Waveform + log-mel spectrogram of the analyzed recording.",
                    icon: Activity,
                    color: "#8b5cf6",
                    onClick: () => {
                      document.getElementById("signal-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    },
                  },
                  {
                    id: "card-detection",
                    title: "Detection",
                    description: "Timeline of detected sound events along the audio.",
                    icon: Crosshair,
                    color: "#fbbf24",
                    onClick: () => {
                      document.getElementById("detected-events")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    },
                  },
                  {
                    id: "card-events",
                    title: "Browse Events",
                    description: "Search, filter, sort, and inspect each event individually.",
                    icon: Eye,
                    color: "#34d399",
                    onClick: () => {
                      document.getElementById("events-list-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    },
                  },
                  {
                    id: "card-analytics",
                    title: "Analytics",
                    description: "Per-class counts, percentages, and the distribution donut.",
                    icon: BarChart3,
                    color: "#06b6d4",
                    onClick: () => {
                      document.getElementById("analysis-summary")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    },
                  },
                  {
                    id: "card-model",
                    title: "Model Info",
                    description: "Active learning, retrain, and version history.",
                    icon: Brain,
                    color: "#a78bfa",
                    onClick: () => {
                      document.getElementById("model-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    },
                  },
                ]}
              />
            </Reveal>
          </section>

          <div className="p-4 md:p-6 space-y-6">
            {backend.error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>{backend.error}</div>
              </div>
            )}

            {/* Control banner - Upload & Analysis section */}
            <section id="upload-section" className="scroll-section">
              <Reveal>
                <SectionHeading
                  eyebrow="Step 01"
                  title="Upload & Configure"
                  subtitle="Pick a synthetic sample or upload your own hydrophone recording. Tune preprocessing and segmentation parameters."
                  icon={Upload}
                />
              </Reveal>
              <Reveal delay={0.1} className="mt-4">
                <ControlBanner
                  selectedSample={selectedSample}
                  setSelectedSample={setSelectedSample}
                  samples={backend.samples}
                  uploadedFileName={uploadedFileName}
                  fileInputRef={fileInputRef}
                  onFileChange={handleFileChange}
                  onProcessSample={handleProcessSample}
                  onProcessUpload={handleProcessUpload}
                  processing={backend.processing}
                  pre={pre}
                  setPre={setPre}
                  showPrePanel={showPrePanel}
                  setShowPrePanel={setShowPrePanel}
                  seg={seg}
                  setSeg={setSeg}
                  showSegPanel={showSegPanel}
                  setShowSegPanel={setShowSegPanel}
                />
              </Reveal>
            </section>

            {!segmentResult && !backend.processing && <EmptyState />}
            {backend.processing && !segmentResult && <ProcessingState />}

            {segmentResult && (
              <div className="space-y-8">
                {/* ===================================================
                    SECTION 2: Acoustic Signal Visualization
                    =================================================== */}
                <section id="signal-section" className="scroll-section">
                  <Reveal>
                    <SectionHeading
                      eyebrow="Step 02"
                      title="Acoustic Signal"
                      subtitle="Waveform and log-mel spectrogram of the full recording with synchronized audio playback."
                      icon={Activity}
                    />
                  </Reveal>
                  <div className="mt-4 grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
                    <Reveal delay={0.1} className="min-w-0">
                      <Panel>
                        <PanelHeader
                          title="Waveform & Spectrogram"
                          icon={Activity}
                          right={
                            <Tabs value={activeTab} onValueChange={setActiveTab}>
                              <TabsList className="bg-transparent p-0 h-7">
                                <TabsTrigger
                                  value="waveform"
                                  className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 text-slate-400 px-3 py-1 text-xs h-7"
                                >
                                  Waveform
                                </TabsTrigger>
                                <TabsTrigger
                                  value="spectrogram"
                                  className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 text-slate-400 px-3 py-1 text-xs h-7"
                                >
                                  Spectrogram
                                </TabsTrigger>
                              </TabsList>
                            </Tabs>
                          }
                        />
                        <div className="px-4 pb-4">
                          {activeTab === "waveform" ? (
                            <WaveformChart
                              t={segmentResult.global_waveform.t}
                              y={segmentResult.global_waveform.y}
                              height={220}
                            />
                          ) : (
                            <SpectrogramChart
                              z={segmentResult.global_spectrogram.z}
                              x={segmentResult.global_spectrogram.x}
                              y={segmentResult.global_spectrogram.y}
                              height={260}
                            />
                          )}
                          <div className="mt-3 flex items-center gap-3">
                            <audio
                              controls
                              src={`data:audio/wav;base64,${segmentResult.global_audio_base64}`}
                              className="flex-1 h-9"
                              style={{ filter: "invert(0.9) hue-rotate(180deg)" }}
                            />
                          </div>
                          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1 text-[10px]">
                            {Object.entries(segmentResult.global_meta).map(([k, v]) => (
                              <div key={k} className="flex justify-between">
                                <span className="text-slate-500">{k}:</span>
                                <span className="font-mono text-slate-300">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </Panel>
                    </Reveal>

                    {/* Prediction banner in right column */}
                    <Reveal delay={0.2} className="min-w-0">
                      {selectedEvent ? (
                        <PredictionBanner event={selectedEvent} />
                      ) : (
                        <Panel>
                          <div className="p-6 text-center text-xs text-slate-500">
                            Select an event from the timeline below to view prediction details.
                          </div>
                        </Panel>
                      )}
                    </Reveal>
                  </div>
                </section>

                {/* ===================================================
                    SECTION 3: Detected Events Timeline
                    =================================================== */}
                <section id="detected-events" className="scroll-section">
                  <Reveal>
                    <SectionHeading
                      eyebrow="Step 03"
                      title="Detected Events Timeline"
                      subtitle="Each colored block is a discrete sound event detected by the sliding-window classifier. Click any block to inspect it."
                      icon={Clock}
                    />
                  </Reveal>
                  <Reveal delay={0.1} className="mt-4">
                    <Panel>
                      <PanelHeader title="Timeline" icon={Clock} />
                      <div className="px-4 pb-4">
                        <EventTimeline
                          events={segmentResult.events}
                          totalDuration={segmentResult.duration_sec}
                          selectedId={backend.selectedEventId}
                          onSelect={(id) => backend.selectEvent(id)}
                        />
                        <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500">
                          {(Object.keys(CLASS_COLORS) as ClassLabel[]).map((c) => (
                            <div key={c} className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[c] }} />
                              <span>{c}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Panel>
                  </Reveal>
                </section>

                {/* ===================================================
                    SECTION 4: Events List + Event Details
                    =================================================== */}
                <section id="events-list-section" className="scroll-section">
                  <Reveal>
                    <SectionHeading
                      eyebrow="Step 04"
                      title="Browse & Inspect Events"
                      subtitle="Search, filter, sort, and select individual events to play back, view spectrograms, and download clips."
                      icon={Crosshair}
                    />
                  </Reveal>
                  <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <Reveal delay={0.1} className="min-w-0">
                      <Panel>
                        <EventListPanel
                          events={segmentResult.events}
                          selectedId={backend.selectedEventId}
                          onSelect={(id) => backend.selectEvent(id)}
                        />
                      </Panel>
                    </Reveal>

                    <Reveal delay={0.2} className="min-w-0">
                      {selectedEvent ? (
                        <Panel>
                          <PanelHeader
                            title="Event Playback & Details"
                            icon={Volume2}
                            right={
                              <Button
                                onClick={handleDownloadClip}
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[11px] text-cyan-300 hover:bg-cyan-500/10"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download Clip
                              </Button>
                            }
                          />
                          <div className="px-4 pb-4 space-y-3">
                            <audio
                              controls
                              src={`data:audio/wav;base64,${selectedEvent.audio_base64}`}
                              className="w-full h-9"
                              style={{ filter: "invert(0.9) hue-rotate(180deg)" }}
                            />
                            <div className="space-y-1.5">
                              <DetailRow label="Event ID" value={selectedEvent.id} />
                              <DetailRow
                                label="Class"
                                value={selectedEvent.class}
                                color={CLASS_COLORS[selectedEvent.class as ClassLabel]}
                              />
                              <DetailRow label="Sub-class" value={selectedEvent.subclass} />
                              <DetailRow
                                label="Confidence"
                                value={`${selectedEvent.confidence_pct.toFixed(1)}%`}
                              />
                              <DetailRow
                                label="Start → End"
                                value={`${formatTime(selectedEvent.start)} → ${formatTime(selectedEvent.end)}`}
                              />
                              <DetailRow
                                label="Duration"
                                value={`${selectedEvent.duration_sec.toFixed(2)} s`}
                              />
                              <DetailRow label="Sample Rate" value={selectedEvent.meta["Sample rate (Hz)"]} />
                              <DetailRow label="Bit Depth" value={selectedEvent.meta["Bit depth"]} />
                              <DetailRow label="Samples" value={selectedEvent.meta["Samples"]} />
                            </div>
                            <Separator style={{ backgroundColor: "var(--hydro-border)" }} />
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                                Top Dominant Frequencies
                              </div>
                              <DominantFreqChart freqs={selectedEvent.dominant_freqs} />
                            </div>
                            <Separator style={{ backgroundColor: "var(--hydro-border)" }} />
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                                Mini Spectrogram
                              </div>
                              <SpectrogramChart
                                z={selectedEvent.spectrogram.z}
                                x={selectedEvent.spectrogram.x}
                                y={selectedEvent.spectrogram.y}
                                height={140}
                              />
                            </div>
                          </div>
                        </Panel>
                      ) : (
                        <Panel>
                          <div className="p-6 text-center text-xs text-slate-500">
                            Select an event to view playback, spectrogram, and metadata.
                          </div>
                        </Panel>
                      )}
                    </Reveal>
                  </div>
                </section>

                {/* ===================================================
                    SECTION 5: Analysis Summary
                    =================================================== */}
                <section id="analysis-summary" className="scroll-section">
                  <Reveal>
                    <SectionHeading
                      eyebrow="Step 05"
                      title="Analysis Summary"
                      subtitle="Aggregate counts and percentages of detected events by class, plus the overall distribution donut."
                      icon={BarChart3}
                    />
                  </Reveal>
                  <Stagger stagger={0.1} className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1.2fr] gap-3">
                    {CLASS_LABELS.map((c) => {
                      const count = segmentResult.summary.per_class[c] ?? 0;
                      const pct = segmentResult.summary.per_class_pct[c] ?? 0;
                      const sparkData = buildClassSparkline(segmentResult.events, c);
                      return (
                        <StaggerItem key={c}>
                          <MetricCard
                            icon={CLASS_ICONS[c]}
                            label={c}
                            value={count}
                            pct={pct}
                            color={CLASS_COLORS[c]}
                            sparkData={sparkData}
                            animateCount
                          />
                        </StaggerItem>
                      );
                    })}
                    <StaggerItem>
                      <div
                        className="rounded-lg border p-3 flex flex-col items-center justify-center h-full"
                        style={{
                          borderColor: "var(--hydro-border)",
                          backgroundColor: "var(--hydro-bg-2)",
                        }}
                      >
                        <DonutChart
                          data={CLASS_LABELS.map((c) => ({
                            name: c,
                            value: segmentResult.summary.per_class[c] ?? 0,
                            color: CLASS_COLORS[c],
                          }))}
                          centerValue={segmentResult.summary.total}
                          centerLabel="Total Events"
                          height={130}
                        />
                      </div>
                    </StaggerItem>
                  </Stagger>
                </section>

                {/* ===================================================
                    SECTION 6: Active Learning + Retrain
                    =================================================== */}
                <section id="active-learning-section" className="scroll-section">
                  <Reveal>
                    <SectionHeading
                      eyebrow="Step 06"
                      title="Active Learning & Model Refinement"
                      subtitle="Correct misclassified events, append them to the dataset, and trigger incremental RandomForest retraining."
                      icon={Sparkles}
                    />
                  </Reveal>
                  <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <Reveal delay={0.1} className="min-w-0">
                      <Panel>
                        <PanelHeader title="Correct the Label" icon={CheckCircle2} />
                        <div className="px-4 pb-4 space-y-3">
                          <div>
                            <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                              Correct the label of selected event
                            </Label>
                            <RadioGroup
                              value={correctionLabel}
                              onValueChange={(v) => setCorrectionLabel(v as ClassLabel)}
                              className="grid grid-cols-3 gap-2 mt-2"
                            >
                              {CLASS_LABELS.map((c) => (
                                <Label
                                  key={c}
                                  htmlFor={`r-${c}`}
                                  className="flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer text-xs"
                                  style={{
                                    borderColor: correctionLabel === c ? CLASS_COLORS[c] : "var(--hydro-border)",
                                    backgroundColor: correctionLabel === c ? `${CLASS_COLORS[c]}15` : "var(--hydro-bg-1)",
                                  }}
                                >
                                  <RadioGroupItem value={c} id={`r-${c}`} className="h-3 w-3" />
                                  <span className="text-slate-200">{c}</span>
                                </Label>
                              ))}
                            </RadioGroup>
                          </div>
                          <Button
                            onClick={handleCorrect}
                            disabled={backend.correcting || !selectedEvent}
                            size="sm"
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                          >
                            {backend.correcting ? (
                              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                            )}
                            Save correction to dataset
                          </Button>
                          {backend.correctedLabel && selectedEvent && (
                            <div
                              className={`text-[11px] rounded-md px-3 py-2 ${
                                backend.correctedLabel !== selectedEvent.class
                                  ? "bg-amber-500/10 border border-amber-500/30 text-amber-200"
                                  : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-200"
                              }`}
                            >
                              {backend.correctedLabel !== selectedEvent.class
                                ? `Correction saved: marked "${selectedEvent.subclass}" as "${backend.correctedLabel}".`
                                : `Confirmation saved: prediction was correct.`}
                            </div>
                          )}
                        </div>
                      </Panel>
                    </Reveal>

                    <Reveal delay={0.2} className="min-w-0">
                      <Panel>
                        <PanelHeader title="Retrain Model" icon={RefreshCw} />
                        <div className="px-4 pb-4 space-y-3">
                          <div className="text-xs text-slate-400">
                            Trigger an incremental RandomForest retrain on the accumulated dataset.
                            The model version will bump and a fresh CV accuracy will be recorded.
                          </div>
                          {modelInfo && (
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="rounded-md border p-2" style={{ borderColor: "var(--hydro-border)", backgroundColor: "var(--hydro-bg-1)" }}>
                                <div className="text-[10px] uppercase text-slate-500">Current Version</div>
                                <div className="font-mono text-cyan-300">v{modelInfo.version}</div>
                              </div>
                              <div className="rounded-md border p-2" style={{ borderColor: "var(--hydro-border)", backgroundColor: "var(--hydro-bg-1)" }}>
                                <div className="text-[10px] uppercase text-slate-500">Dataset Size</div>
                                <div className="font-mono text-violet-300">{modelInfo.dataset.total} samples</div>
                              </div>
                            </div>
                          )}
                          <Button
                            onClick={handleRetrain}
                            disabled={backend.retraining}
                            size="sm"
                            className="w-full bg-violet-600 hover:bg-violet-500 text-white"
                          >
                            {backend.retraining ? (
                              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5 mr-2" />
                            )}
                            Retrain RandomForest
                          </Button>
                        </div>
                      </Panel>
                    </Reveal>
                  </div>
                </section>

                {/* ===================================================
                    SECTION 7: Model Version History
                    =================================================== */}
                <section id="model-history" className="scroll-section">
                  <Reveal>
                    <SectionHeading
                      eyebrow="Step 07"
                      title="Model Version History"
                      subtitle="Audit trail of every retrain. Each entry records the model version, cross-validated accuracy, and the dataset size at training time."
                      icon={History}
                    />
                  </Reveal>
                  <Stagger stagger={0.08} className="mt-4 space-y-2">
                    {modelInfo?.history.slice().reverse().map((h, i) => (
                      <StaggerItem key={`${h.version}-${i}`}>
                        <div
                          className="rounded-lg border p-3"
                          style={{
                            borderColor: "var(--hydro-border)",
                            backgroundColor: "var(--hydro-bg-1)",
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Badge
                              className="border-0 text-[10px] font-mono"
                              style={{
                                backgroundColor: "var(--hydro-bg-3)",
                                color: "#22d3ee",
                              }}
                            >
                              v{h.version}
                            </Badge>
                            <span className="text-[10px] text-slate-500">
                              {h.accuracy != null ? `${(h.accuracy * 100).toFixed(1)}% CV` : "no CV"}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">{h.note}</div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Trained on {h.trained_on} samples
                          </div>
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </section>

                {/* Closing CTA */}
                <section className="scroll-section">
                  <Reveal>
                    <ClosingCta
                      totalEvents={segmentResult.summary.total}
                      duration={segmentResult.duration_sec}
                      modelVersion={modelInfo?.version ?? "—"}
                    />
                  </Reveal>
                </section>
              </div>
            )}
          </div>
        </main>

        {/* Footer status bar */}
        <footer
          className="border-t px-4 py-2 flex items-center justify-between text-[10px] text-slate-500"
          style={{ borderColor: "var(--hydro-border)", backgroundColor: "var(--hydro-bg-1)" }}
        >
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 hydro-pulse" />
              <span>System Operational</span>
            </span>
            <span>Model v{modelInfo?.version ?? "—"}</span>
            <span>{modelInfo?.dataset.total ?? 0} samples in dataset</span>
            {segmentResult && (
              <>
                <Separator orientation="vertical" className="h-3" />
                <span>{segmentResult.summary.total} events detected</span>
                <span>{segmentResult.duration_sec.toFixed(1)}s analyzed</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span>FastAPI: port 8000</span>
            <span>Next.js: port 3000</span>
            <span>HYDROGRAPH v1.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Build a small sparkline series (events-per-window) for a given class. */
function buildClassSparkline(events: HydroEvent[], cls: ClassLabel): number[] {
  if (events.length === 0) return [0, 0, 0, 0, 0];
  // Bucket events into 5 evenly-spaced time windows
  const maxT = Math.max(...events.map((e) => e.end), 1);
  const bins = 5;
  const counts = new Array(bins).fill(0);
  for (const e of events) {
    if (e.class !== cls) continue;
    const mid = (e.start + e.end) / 2;
    const idx = Math.min(bins - 1, Math.floor((mid / maxT) * bins));
    counts[idx]++;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Top header - hand-crafted, with animated brand mark + marine avatar
// ---------------------------------------------------------------------------

function TopHeader({
  onMenuClick,
  onArrowClick,
  onVolumeClick,
  modelVersion,
  datasetTotal,
}: {
  onMenuClick?: () => void;
  onArrowClick?: () => void;
  onVolumeClick?: () => void;
  modelVersion?: string;
  datasetTotal?: number;
}) {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        backgroundColor: "rgba(8, 14, 28, 0.82)",
        borderColor: "rgba(30, 41, 59, 0.7)",
      }}
    >
      {/* Top thin line - subtle gradient accent */}
      <div
        className="h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.3) 30%, rgba(139, 92, 246, 0.3) 70%, transparent 100%)",
        }}
      />
      <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        {/* Left: animated hydrograph brand */}
        <div className="flex items-center gap-4 min-w-0">
          <HydroLogo size="md" showTagline />
          {/* Vertical divider with a subtle system-status pill on the right */}
          <div
            className="hidden md:flex items-center gap-3 pl-4 ml-1"
            style={{ borderLeft: "1px solid rgba(51, 65, 85, 0.6)" }}
          >
            <SystemStatusPill modelVersion={modelVersion} datasetTotal={datasetTotal} />
          </div>
        </div>

        {/* Right: search + animated icon buttons + marine avatar */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="relative hidden lg:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
            <input
              placeholder="Search events, samples, classes…"
              className="w-52 xl:w-64 pl-8 pr-3 py-1.5 rounded-md text-xs text-slate-300 placeholder:text-slate-600 border focus:outline-none focus:border-cyan-500/50 transition-colors"
              style={{
                backgroundColor: "rgba(15, 23, 41, 0.7)",
                borderColor: "rgba(30, 41, 59, 0.6)",
              }}
            />
          </div>
          <AnimatedArrowButton onClick={onArrowClick} title="Jump to next section" />
          <AnimatedMenuButton onClick={onMenuClick} title="Open workspace hub" />
          <AnimatedVolumeButton onClick={onVolumeClick} title="Mute / Unmute audio" />
          <div
            className="h-5 w-px mx-0.5"
            style={{ backgroundColor: "rgba(51, 65, 85, 0.6)" }}
          />
          <MarineAvatar size={32} />
        </div>
      </div>
    </header>
  );
}

/**
 * SystemStatusPill — a small pill that shows model version + dataset size,
 * with a breathing green dot. Gives the header a "live system" feel
 * without looking like a generic AI template.
 */
function SystemStatusPill({
  modelVersion,
  datasetTotal,
}: {
  modelVersion?: string;
  datasetTotal?: number;
}) {
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1 rounded-full"
      style={{
        backgroundColor: "rgba(15, 23, 41, 0.6)",
        border: "1px solid rgba(51, 65, 85, 0.7)",
      }}
      title="System is operational"
    >
      <motion.span
        className="h-1.5 w-1.5 rounded-full bg-emerald-400"
        animate={{
          opacity: [1, 0.4, 1],
          scale: [1, 0.85, 1],
        }}
        transition={{
          duration: 2.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ boxShadow: "0 0 6px -1px rgba(52, 211, 153, 0.7)" }}
      />
      <span className="text-[10px] font-mono text-slate-400">
        v{modelVersion ?? "—"}
      </span>
      <span className="text-slate-700 text-[10px]">·</span>
      <span className="text-[10px] font-mono text-slate-500">
        {datasetTotal ?? 0} samples
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel primitives
// ---------------------------------------------------------------------------

function Panel({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="rounded-lg border overflow-hidden scroll-mt-4"
      style={{
        backgroundColor: "var(--hydro-bg-2)",
        borderColor: "var(--hydro-border)",
      }}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  icon: Icon,
  right,
}: {
  title: string;
  icon?: React.ElementType;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 border-b"
      style={{ borderColor: "var(--hydro-border)" }}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-cyan-400" />}
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control banner
// ---------------------------------------------------------------------------

function ControlBanner({
  selectedSample,
  setSelectedSample,
  samples,
  uploadedFileName,
  fileInputRef,
  onFileChange,
  onProcessSample,
  onProcessUpload,
  processing,
  pre,
  setPre,
  showPrePanel,
  setShowPrePanel,
  seg,
  setSeg,
  showSegPanel,
  setShowSegPanel,
}: {
  selectedSample: string;
  setSelectedSample: (v: string) => void;
  samples: { samples: string[]; grouped: Record<string, string[]> };
  uploadedFileName: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onProcessSample: () => void;
  onProcessUpload: () => void;
  processing: boolean;
  pre: PreprocessingParams;
  setPre: (v: PreprocessingParams) => void;
  showPrePanel: boolean;
  setShowPrePanel: (v: boolean) => void;
  seg: SegmentationParams;
  setSeg: (v: SegmentationParams) => void;
  showSegPanel: boolean;
  setShowSegPanel: (v: boolean) => void;
}) {
  return (
    <Panel id="preprocessing-panel">
      <div className="p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="h-10 w-10 rounded-md flex items-center justify-center shrink-0"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.15)",
              border: "1px dashed rgba(139, 92, 246, 0.4)",
            }}
          >
            <Upload className="h-4 w-4 text-violet-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-400 mb-1">Input Source</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedSample} onValueChange={setSelectedSample}>
                <SelectTrigger
                  className="h-8 w-56 text-xs"
                  style={{
                    backgroundColor: "var(--hydro-bg-1)",
                    borderColor: "var(--hydro-border)",
                    color: "#cbd5e1",
                  }}
                >
                  <SelectValue placeholder="— synthetic sample —" />
                </SelectTrigger>
                <SelectContent
                  className="max-h-72"
                  style={{
                    backgroundColor: "var(--hydro-bg-2)",
                    borderColor: "var(--hydro-border)",
                  }}
                >
                  {Object.entries(samples.grouped || {}).map(([cls, files]) => (
                    <div key={cls}>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">
                        {cls}
                      </div>
                      {files.map((f) => (
                        <SelectItem
                          key={f}
                          value={f}
                          className="text-xs text-slate-200 focus:bg-cyan-500/10"
                        >
                          {f}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[10px] text-slate-500">OR</span>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.flac,audio/*"
                onChange={onFileChange}
                className="h-8 w-56 text-xs file:h-6 file:px-2 file:py-0.5 file:mr-2 file:rounded file:border-0 file:bg-violet-600/20 file:text-violet-300 file:text-[10px] file:font-medium file:cursor-pointer"
                style={{
                  backgroundColor: "var(--hydro-bg-1)",
                  borderColor: "var(--hydro-border)",
                  color: "#cbd5e1",
                }}
              />
              {uploadedFileName && (
                <span className="text-[10px] text-slate-500 truncate max-w-[180px]">
                  Selected: {uploadedFileName}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowPrePanel(!showPrePanel)}
            className="text-[11px] px-3 py-2 rounded-md border text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-1"
            style={{
              borderColor: "var(--hydro-border)",
              backgroundColor: "var(--hydro-bg-1)",
            }}
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            Preprocessing
            {showPrePanel ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setShowSegPanel(!showSegPanel)}
            className="text-[11px] px-3 py-2 rounded-md border text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-1"
            style={{
              borderColor: "var(--hydro-border)",
              backgroundColor: "var(--hydro-bg-1)",
            }}
          >
            <Crosshair className="h-3.5 w-3.5" />
            Segmentation
            {showSegPanel ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <Button
            onClick={selectedSample ? onProcessSample : onProcessUpload}
            disabled={processing || (!selectedSample && !uploadedFileName)}
            size="sm"
            className="bg-violet-600 hover:bg-violet-500 text-white border border-violet-400/50"
            style={{ boxShadow: "0 0 18px -4px rgba(139, 92, 246, 0.6)" }}
          >
            {processing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            Start Analysis
          </Button>
        </div>
      </div>

      {showPrePanel && (
        <div
          className="px-4 py-3 border-t grid grid-cols-2 md:grid-cols-4 gap-3"
          style={{
            backgroundColor: "var(--hydro-bg-1)",
            borderColor: "var(--hydro-border)",
          }}
        >
          <ToggleRow
            label="Trim silence"
            checked={pre.enable_trim}
            onChange={(v) => setPre({ ...pre, enable_trim: v })}
          />
          {pre.enable_trim && (
            <SliderRow
              label="Trim dB"
              value={pre.trim_db}
              min={10}
              max={60}
              step={1}
              onChange={(v) => setPre({ ...pre, trim_db: v })}
            />
          )}
          <ToggleRow
            label="Bandpass"
            checked={pre.enable_bandpass}
            onChange={(v) => setPre({ ...pre, enable_bandpass: v })}
          />
          {pre.enable_bandpass && (
            <>
              <SliderRow
                label="Low (Hz)"
                value={pre.bp_low}
                min={10}
                max={1000}
                step={10}
                onChange={(v) => setPre({ ...pre, bp_low: v })}
              />
              <SliderRow
                label="High (Hz)"
                value={pre.bp_high}
                min={1000}
                max={11000}
                step={100}
                onChange={(v) => setPre({ ...pre, bp_high: v })}
              />
            </>
          )}
          <ToggleRow
            label="Denoise"
            checked={pre.enable_denoise}
            onChange={(v) => setPre({ ...pre, enable_denoise: v })}
          />
          {pre.enable_denoise && (
            <SliderRow
              label="Strength"
              value={pre.noise_strength}
              min={0.1}
              max={1.5}
              step={0.05}
              onChange={(v) => setPre({ ...pre, noise_strength: v })}
              format={(v) => v.toFixed(2)}
            />
          )}
          <ToggleRow
            label="Normalize"
            checked={pre.enable_normalize}
            onChange={(v) => setPre({ ...pre, enable_normalize: v })}
          />
        </div>
      )}

      {showSegPanel && (
        <div
          className="px-4 py-3 border-t grid grid-cols-2 md:grid-cols-3 gap-3"
          style={{
            backgroundColor: "var(--hydro-bg-1)",
            borderColor: "var(--hydro-border)",
          }}
        >
          <SliderRow
            label="Window size (s)"
            value={seg.window_sec}
            min={0.3}
            max={3.0}
            step={0.1}
            onChange={(v) => setSeg({ ...seg, window_sec: v })}
            format={(v) => v.toFixed(1)}
          />
          <SliderRow
            label="Hop size (s)"
            value={seg.hop_sec}
            min={0.1}
            max={1.5}
            step={0.1}
            onChange={(v) => setSeg({ ...seg, hop_sec: v })}
            format={(v) => v.toFixed(1)}
          />
          <SliderRow
            label="Min event (s)"
            value={seg.min_event_sec}
            min={0.1}
            max={2.0}
            step={0.1}
            onChange={(v) => setSeg({ ...seg, min_event_sec: v })}
            format={(v) => v.toFixed(1)}
          />
          <SliderRow
            label="Merge gap (s)"
            value={seg.merge_gap_sec}
            min={0.0}
            max={2.0}
            step={0.1}
            onChange={(v) => setSeg({ ...seg, merge_gap_sec: v })}
            format={(v) => v.toFixed(1)}
          />
          <SliderRow
            label="Confidence threshold"
            value={seg.confidence_threshold}
            min={0.1}
            max={0.9}
            step={0.05}
            onChange={(v) => setSeg({ ...seg, confidence_threshold: v })}
            format={(v) => `${(v * 100).toFixed(0)}%`}
          />
        </div>
      )}
    </Panel>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[11px] text-slate-400">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-slate-400">{label}</Label>
        <span className="text-[10px] font-mono text-cyan-300">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="py-0.5"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <Panel>
      <div className="py-16 text-center">
        <div
          className="mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center"
          style={{
            background: "radial-gradient(circle, rgba(34, 211, 238, 0.15) 0%, transparent 70%)",
            border: "1px solid rgba(34, 211, 238, 0.3)",
          }}
        >
          <Waves className="h-7 w-7 text-cyan-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-200 mb-2">
          Ready to classify underwater audio
        </h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
          Pick a synthetic sample from the dropdown or upload your own hydrophone recording,
          then click{" "}
          <span className="text-violet-300 font-medium">Start Analysis</span> to detect multiple
          biophonic, anthropogenic, and geophonic sound events along the timeline.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
          {CLASS_LABELS.map((c) => {
            const Icon = CLASS_ICONS[c];
            return (
              <div
                key={c}
                className="rounded-lg border p-3 text-left"
                style={{
                  borderColor: "var(--hydro-border)",
                  backgroundColor: "var(--hydro-bg-1)",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="h-7 w-7 rounded-md flex items-center justify-center"
                    style={{
                      backgroundColor: `${CLASS_COLORS[c]}20`,
                      color: CLASS_COLORS[c],
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-medium text-slate-200">{c}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {c === "Biophonic" && "Whale moans, dolphin clicks, fish chorus"}
                  {c === "Anthropogenic" && "Ship propellers, sonar, pile driving"}
                  {c === "Geophonic" && "Rain, earthquakes, ice cracking"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function ProcessingState() {
  const steps = [
    "Loading audio",
    "Preprocessing (trim/filter/denoise)",
    "Sliding-window segmentation",
    "Classifying each window",
    "Merging adjacent events",
    "Inferring subclasses",
  ];
  return (
    <Panel>
      <div className="py-16 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-violet-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-200 mb-1">Analyzing audio…</h2>
        <p className="text-xs text-slate-500 mb-6">
          Running multi-event detection. This typically takes 3-6 seconds.
        </p>
        <div className="max-w-sm mx-auto space-y-2 text-left">
          {steps.map((s) => (
            <div key={s} className="flex items-center gap-2 text-[11px] text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Event timeline
// ---------------------------------------------------------------------------

function EventTimeline({
  events,
  totalDuration,
  selectedId,
  onSelect,
}: {
  events: HydroEvent[];
  totalDuration: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const total = Math.max(totalDuration, 0.001);
  return (
    <div
      className="relative h-16 rounded-md border overflow-hidden"
      style={{
        backgroundColor: "var(--hydro-bg-0)",
        borderColor: "var(--hydro-border)",
      }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: `${(i * 100) / 4}%`,
            backgroundColor: "rgba(148, 163, 184, 0.1)",
          }}
        />
      ))}
      {events.map((evt) => {
        const leftPct = (evt.start / total) * 100;
        const widthPct = Math.max(1.5, ((evt.end - evt.start) / total) * 100);
        const isSelected = evt.id === selectedId;
        return (
          <button
            key={evt.id}
            onClick={() => onSelect(evt.id)}
            className="absolute top-2 bottom-5 rounded-sm flex items-center justify-center text-[9px] font-medium text-slate-900 overflow-hidden transition-all hover:brightness-110"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              backgroundColor: CLASS_COLORS[evt.class as ClassLabel],
              boxShadow: isSelected
                ? `0 0 0 2px #ffffff, 0 0 12px -2px ${CLASS_COLORS[evt.class as ClassLabel]}`
                : `0 0 8px -2px ${CLASS_COLORS[evt.class as ClassLabel]}`,
              opacity: isSelected ? 1 : 0.85,
            }}
            title={`${evt.id} · ${evt.class} / ${evt.subclass} · ${evt.confidence_pct.toFixed(1)}% · ${formatTime(evt.start)}-${formatTime(evt.end)}`}
          >
            <span className="truncate px-1">{evt.subclass}</span>
          </button>
        );
      })}
      <div className="absolute inset-x-0 bottom-0 flex justify-between px-1 text-[9px] text-slate-600">
        <span>0:00</span>
        <span>{formatTime(total / 4)}</span>
        <span>{formatTime(total / 2)}</span>
        <span>{formatTime((total * 3) / 4)}</span>
        <span>{formatTime(total)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric card with sparkline
// ---------------------------------------------------------------------------

function MetricCard({
  icon: Icon,
  label,
  value,
  pct,
  color,
  sparkData,
  animateCount = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  pct: number;
  color: string;
  sparkData: number[];
  animateCount?: boolean;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: "var(--hydro-border)",
        backgroundColor: "var(--hydro-bg-1)",
        borderLeftColor: color,
        borderLeftWidth: 2,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="h-8 w-8 rounded-md flex items-center justify-center"
          style={{
            backgroundColor: `${color}15`,
            color,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-[10px] text-slate-500">
          {animateCount ? (
            <AnimatedCounter value={pct} decimals={1} suffix="%" duration={1.0} />
          ) : (
            <>{pct.toFixed(1)}%</>
          )}
        </span>
      </div>
      <div className="text-2xl font-bold text-slate-100">
        {animateCount ? (
          <AnimatedCounter value={value} decimals={0} duration={1.2} />
        ) : (
          value
        )}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <Sparkline data={sparkData} color={color} width={100} height={20} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction banner (for selected event)
// ---------------------------------------------------------------------------

function PredictionBanner({ event }: { event: HydroEvent }) {
  const label = event.class as ClassLabel;
  const Icon = CLASS_ICONS[label] ?? Waves;
  const color = CLASS_COLORS[label] ?? "#22d3ee";
  return (
    <Panel>
      <div
        className="p-4"
        style={{
          background: `linear-gradient(135deg, ${color}08 0%, var(--hydro-bg-2) 60%)`,
          borderTop: `2px solid ${color}`,
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="h-12 w-12 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `${color}20`,
              color,
              boxShadow: `0 0 16px -4px ${color}80`,
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Selected Event · {event.id}
            </div>
            <div className="text-xl font-bold truncate" style={{ color }}>
              {event.subclass}
            </div>
            <div className="text-[11px] text-slate-500">
              {event.class} · {formatTime(event.start)} → {formatTime(event.end)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Confidence</div>
            <div className="text-2xl font-bold text-slate-100">
              {event.confidence_pct.toFixed(1)}%
            </div>
          </div>
        </div>
        <ProbabilityChart
          probabilities={event.probabilities}
          predictedLabel={event.class}
        />
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Event list with search + sort
// ---------------------------------------------------------------------------

type SortKey = "time" | "confidence" | "duration";

function EventListPanel({
  events,
  selectedId,
  onSelect,
}: {
  events: HydroEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [filterClass, setFilterClass] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = events.slice();
    if (filterClass !== "all") {
      list = list.filter((e) => e.class === filterClass);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.id.toLowerCase().includes(q) ||
          e.class.toLowerCase().includes(q) ||
          e.subclass.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      if (sortKey === "time") return a.start - b.start;
      if (sortKey === "confidence") return b.confidence_pct - a.confidence_pct;
      if (sortKey === "duration") return b.duration_sec - a.duration_sec;
      return 0;
    });
    return list;
  }, [events, search, sortKey, filterClass]);

  return (
    <>
      <PanelHeader
        title={`Detected Events (${events.length})`}
        icon={Crosshair}
        right={
          <div className="flex items-center gap-2">
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger
                className="h-7 w-24 text-[10px] border-0"
                style={{
                  backgroundColor: "var(--hydro-bg-1)",
                  color: "#94a3b8",
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                style={{
                  backgroundColor: "var(--hydro-bg-2)",
                  borderColor: "var(--hydro-border)",
                }}
              >
                <SelectItem value="all" className="text-xs">All classes</SelectItem>
                {CLASS_LABELS.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <div className="px-3 py-2 border-b" style={{ borderColor: "var(--hydro-border)" }}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              className="w-full pl-7 pr-2 py-1 rounded text-[11px] text-slate-300 placeholder:text-slate-600 border focus:outline-none focus:border-cyan-500/50"
              style={{
                backgroundColor: "var(--hydro-bg-1)",
                borderColor: "var(--hydro-border)",
              }}
            />
          </div>
          <button
            onClick={() => {
              const next: SortKey =
                sortKey === "time" ? "confidence" : sortKey === "confidence" ? "duration" : "time";
              setSortKey(next);
            }}
            className="text-[10px] px-2 py-1 rounded border text-slate-400 hover:text-slate-200 flex items-center gap-1"
            style={{
              borderColor: "var(--hydro-border)",
              backgroundColor: "var(--hydro-bg-1)",
            }}
            title={`Sort by: ${sortKey}`}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortKey}
          </button>
        </div>
        {filterClass !== "all" && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px]">
            <Filter className="h-3 w-3 text-slate-500" />
            <span className="text-slate-500">Filtered to</span>
            <Badge
              className="text-[9px] border-0"
              style={{
                backgroundColor: `${CLASS_COLORS[filterClass as ClassLabel]}20`,
                color: CLASS_COLORS[filterClass as ClassLabel],
              }}
            >
              {filterClass}
            </Badge>
            <button
              onClick={() => setFilterClass("all")}
              className="text-slate-500 hover:text-slate-300 underline"
            >
              clear
            </button>
          </div>
        )}
      </div>
      <ScrollArea className="h-[260px]">
        <div className="px-2 py-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-slate-500">
              No events match the current filters.
            </div>
          ) : (
            filtered.map((evt) => (
              <EventRow
                key={evt.id}
                evt={evt}
                selected={evt.id === selectedId}
                onClick={() => onSelect(evt.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </>
  );
}

function EventRow({
  evt,
  selected,
  onClick,
}: {
  evt: HydroEvent;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = CLASS_ICONS[evt.class as ClassLabel];
  const color = CLASS_COLORS[evt.class as ClassLabel];
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-slate-800/50 transition-colors text-left"
      style={{
        backgroundColor: selected ? `${color}10` : "transparent",
        borderBottom: "1px solid var(--hydro-border)",
        borderLeft: selected ? `2px solid ${color}` : "2px solid transparent",
      }}
    >
      <div
        className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15`, color }}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-200 truncate">{evt.subclass}</div>
        <div className="text-[10px] text-slate-500 font-mono">
          {formatTime(evt.start)} - {formatTime(evt.end)} · {evt.class}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs font-semibold" style={{ color }}>
          {evt.confidence_pct.toFixed(1)}%
        </div>
        <div className="text-[9px] text-slate-600">{evt.duration_sec.toFixed(1)}s</div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail row
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono" style={{ color: color || "#e2e8f0" }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeroSection - landing hero with animated title, stats, and CTA
// ---------------------------------------------------------------------------

function HeroSection({
  modelVersion,
  datasetTotal,
  onPickSample,
}: {
  modelVersion?: string;
  datasetTotal?: number;
  onPickSample: () => void;
}) {
  return (
    <section className="relative overflow-hidden">
      {/* Glow orbs (parallax background) */}
      <Parallax speed={0.4} className="absolute inset-0 pointer-events-none">
        <div
          className="hero-bg-orb"
          style={{
            top: "-100px",
            left: "10%",
            width: "400px",
            height: "400px",
            background: "radial-gradient(circle, #22d3ee 0%, transparent 70%)",
          }}
        />
        <div
          className="hero-bg-orb"
          style={{
            top: "200px",
            right: "5%",
            width: "350px",
            height: "350px",
            background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
            opacity: 0.3,
          }}
        />
        <div
          className="hero-bg-orb"
          style={{
            bottom: "50px",
            left: "30%",
            width: "300px",
            height: "300px",
            background: "radial-gradient(circle, #34d399 0%, transparent 70%)",
            opacity: 0.2,
          }}
        />
      </Parallax>

      <div className="relative z-10 px-6 md:px-12 py-16 md:py-24 max-w-6xl">
        {/* Brand mark — animated anchor + wordmark, fades in first */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <HydroLogo size="lg" showTagline={false} />
        </motion.div>

        {/* Status pill */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 mb-6 text-[10px] uppercase tracking-[0.2em]"
          style={{
            borderColor: "rgba(34, 211, 238, 0.4)",
            backgroundColor: "rgba(34, 211, 238, 0.08)",
            color: "#22d3ee",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 hydro-pulse" />
          <span>Underwater Acoustic Intelligence · v{modelVersion ?? "1.0.0"}</span>
        </motion.div>

        {/* Animated headline (no longer just HYDROGRAPH — give it a human tagline) */}
        <HeroTitle
          title="Listen to the ocean."
          subtitle="AI-powered classification of hydrophone recordings into biophonic, anthropogenic, and geophonic sound events — built for marine researchers, by marine researchers."
        />

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.7 }}
          className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl"
        >
          <HeroStat label="Model" value={`v${modelVersion ?? "—"}`} color="#22d3ee" />
          <HeroStat label="Dataset" value={`${datasetTotal ?? 0} samples`} color="#8b5cf6" />
          <HeroStat label="Classes" value="3" color="#34d399" />
          <HeroStat label="Subclasses" value="14" color="#fbbf24" />
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.7 }}
          className="mt-10 flex items-center gap-4 flex-wrap"
        >
          <Button
            onClick={onPickSample}
            size="lg"
            className="bg-violet-600 hover:bg-violet-500 text-white border border-violet-400/50"
            style={{ boxShadow: "0 0 24px -4px rgba(139, 92, 246, 0.7)" }}
          >
            <Play className="h-4 w-4 mr-2" />
            Start Analysis
          </Button>
          <a
            href="/download/hydrograph-source-protected.zip"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border text-cyan-300 hover:bg-cyan-500/10 transition-colors"
            style={{ borderColor: "rgba(34, 211, 238, 0.4)" }}
          >
            <Download className="h-4 w-4" />
            Download Source
          </a>
          <button
            onClick={() => {
              document.getElementById("detected-events")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
          >
            See how it works
            <ArrowRight className="h-3 w-3" />
          </button>
        </motion.div>

        {/* Scroll cue */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2, duration: 0.6 }}
          className="mt-16 flex flex-col items-center text-slate-600"
        >
          <span className="text-[10px] uppercase tracking-[0.2em] mb-2">Scroll to begin</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <ArrowDown className="h-4 w-4" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: "var(--hydro-border)",
        backgroundColor: "rgba(15, 23, 41, 0.6)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-bold font-mono" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClosingCta - end-of-page summary card
// ---------------------------------------------------------------------------

function ClosingCta({
  totalEvents,
  duration,
  modelVersion,
}: {
  totalEvents: number;
  duration: number;
  modelVersion: string;
}) {
  return (
    <div
      className="rounded-xl border p-8 text-center relative overflow-hidden"
      style={{
        borderColor: "var(--hydro-border)",
        background: "linear-gradient(135deg, rgba(34, 211, 238, 0.05) 0%, rgba(139, 92, 246, 0.05) 50%, rgba(52, 211, 153, 0.05) 100%)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 30% 50%, rgba(34, 211, 238, 0.1) 0%, transparent 60%), radial-gradient(circle at 70% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 60%)",
        }}
      />
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.6 }}
        >
          <Sparkles className="h-8 w-8 mx-auto mb-3 text-cyan-400" />
          <h3 className="text-2xl md:text-3xl font-bold text-slate-100 mb-2">
            Analysis complete.
          </h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            {totalEvents} event{totalEvents === 1 ? "" : "s"} detected in {duration.toFixed(1)}s of audio
            using model v{modelVersion}.
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-3"
        >
          <Button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            size="sm"
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            <ArrowDown className="h-3.5 w-3.5 mr-1.5 rotate-180" />
            Back to top
          </Button>
          <Button
            onClick={() => {
              document.getElementById("active-learning-section")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }}
            size="sm"
            variant="secondary"
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Refine the model
          </Button>
        </motion.div>
        <p className="mt-8 text-[10px] uppercase tracking-[0.2em] text-slate-600">
          AI for Ocean · Insights for a Better Future
        </p>
      </div>
    </div>
  );
}
