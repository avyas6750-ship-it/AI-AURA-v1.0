"use client";

import { useMemo } from "react";

interface SpectrogramChartProps {
  z: number[][]; // shape [n_mels, T] in dB
  x: number[];   // time axis (seconds)
  y: number[];   // frequency axis (Hz)
  height?: number;
}

/**
 * SVG-based log-mel spectrogram heatmap.
 * z is a 2D array of dB values; we map them to colors using a "viridis"-like gradient.
 */
export function SpectrogramChart({ z, x, y, height = 280 }: SpectrogramChartProps) {
  const width = 800;
  const padding = { top: 14, right: 60, bottom: 32, left: 50 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const { cells, dbMin, dbMax, timeMax, freqMax } = useMemo(() => {
    if (z.length === 0 || z[0].length === 0) {
      return { cells: [] as Array<{ x: number; y: number; w: number; h: number; fill: string }>[], dbMin: 0, dbMax: 0, timeMax: 0, freqMax: 0 };
    }
    const nMels = z.length;
    const nT = z[0].length;
    const flat = z.flat();
    const dbMin = Math.min(...flat);
    const dbMax = Math.max(...flat);
    const dbRange = Math.max(0.001, dbMax - dbMin);
    const timeMax = x[x.length - 1] || 1;
    const freqMax = y[y.length - 1] || 1;
    const cellW = innerW / nT;
    const cellH = innerH / nMels;

    // Convert mel-row index -> frequency for color label (already in y array)
    const cells = [];
    for (let i = 0; i < nMels; i++) {
      for (let j = 0; j < nT; j++) {
        const v = z[i][j];
        const norm = (v - dbMin) / dbRange;
        const fill = infernoLike(norm);
        // y axis: row 0 = lowest freq -> bottom of chart
        const yPx = padding.top + (nMels - 1 - i) * cellH;
        const xPx = padding.left + j * cellW;
        cells.push({ x: xPx, y: yPx, w: cellW + 0.5, h: cellH + 0.5, fill });
      }
    }
    return { cells, dbMin, dbMax, timeMax, freqMax };
  }, [z, x, y, innerW, innerH, padding.left, padding.top]);

  if (z.length === 0) {
    return <div className="text-muted-foreground text-sm">No spectrogram data</div>;
  }

  // x-axis ticks (5)
  const xTicks = Array.from({ length: 5 }, (_, i) => (timeMax * i) / 4);
  // y-axis ticks: 5 evenly spaced in log freq
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    const norm = i / (yTickCount - 1);
    // log scale
    const logMin = Math.log10(Math.max(20, y[0]));
    const logMax = Math.log10(Math.max(20, freqMax));
    return Math.pow(10, logMin + (logMax - logMin) * norm);
  });

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="rounded-lg border"
      style={{
        backgroundColor: "var(--hydro-bg-0, #050811)",
        borderColor: "var(--hydro-border, #1e293b)",
      }}
      role="img"
      aria-label="Log-mel spectrogram"
    >
      {/* Heatmap cells */}
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
          fill={c.fill}
        />
      ))}
      {/* x-axis labels */}
      {xTicks.map((tt, i) => {
        const x = padding.left + (innerW * i) / 4;
        return (
          <text
            key={`xt-${i}`}
            x={x}
            y={height - 12}
            textAnchor="middle"
            fontSize={9}
            fill="rgba(148, 163, 184, 0.7)"
          >
            {tt.toFixed(2)}s
          </text>
        );
      })}
      {/* y-axis labels (log frequency) */}
      {yTicks.map((ff, i) => {
        const logMin = Math.log10(Math.max(20, y[0]));
        const logMax = Math.log10(Math.max(20, freqMax));
        const norm = (Math.log10(Math.max(20, ff)) - logMin) / (logMax - logMin || 1);
        const yPx = padding.top + innerH - norm * innerH;
        const label = ff >= 1000 ? `${(ff / 1000).toFixed(1)}k` : `${Math.round(ff)}`;
        return (
          <text
            key={`yt-${i}`}
            x={padding.left - 6}
            y={yPx + 3}
            textAnchor="end"
            fontSize={9}
            fill="rgba(148, 163, 184, 0.7)"
          >
            {label} Hz
          </text>
        );
      })}
      {/* axis titles */}
      <text x={padding.left} y={padding.top - 3} fontSize={9} fill="rgba(203, 213, 225, 0.7)">
        Frequency (log)
      </text>
      <text
        x={padding.left + innerW}
        y={height - 12}
        textAnchor="end"
        fontSize={9}
        fill="rgba(203, 213, 225, 0.7)"
      >
        Time (s)
      </text>
      {/* Color bar */}
      <defs>
        <linearGradient id="specGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={infernoLike(0)} />
          <stop offset="25%" stopColor={infernoLike(0.25)} />
          <stop offset="50%" stopColor={infernoLike(0.5)} />
          <stop offset="75%" stopColor={infernoLike(0.75)} />
          <stop offset="100%" stopColor={infernoLike(1)} />
        </linearGradient>
      </defs>
      <rect
        x={width - padding.right + 12}
        y={padding.top}
        width={12}
        height={innerH}
        fill="url(#specGrad)"
        stroke="rgba(148, 163, 184, 0.2)"
        strokeWidth={0.5}
      />
      <text
        x={width - padding.right + 18}
        y={padding.top + 4}
        fontSize={9}
        fill="rgba(203, 213, 225, 0.7)"
        textAnchor="middle"
        transform={`rotate(90 ${width - padding.right + 18} ${padding.top + 4})`}
      >
        dB
      </text>
      <text
        x={width - padding.right + 18}
        y={padding.top}
        fontSize={8}
        fill="rgba(148, 163, 184, 0.7)"
        textAnchor="start"
      >
        {dbMax.toFixed(0)}
      </text>
      <text
        x={width - padding.right + 18}
        y={padding.top + innerH}
        fontSize={8}
        fill="rgba(148, 163, 184, 0.7)"
        textAnchor="start"
      >
        {dbMin.toFixed(0)}
      </text>
    </svg>
  );
}

/** Inferno-style colormap: dark -> purple -> magenta -> orange -> yellow.
 *  Matches the spectrogram aesthetic from the reference dashboard. */
function infernoLike(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const stops = [
    [3, 0, 26],       // near-black purple
    [60, 4, 100],     // deep purple
    [122, 16, 132],   // magenta-purple
    [188, 38, 102],   // pink-magenta
    [232, 78, 56],    // red-orange
    [252, 138, 24],   // orange
    [252, 211, 60],   // yellow
    [255, 247, 188],  // pale yellow
  ];
  const seg = t * (stops.length - 1);
  const i = Math.floor(seg);
  const f = seg - i;
  const a = stops[Math.min(i, stops.length - 1)];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const rgb = a.map((av, j) => Math.round(av + (b[j] - av) * f));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
