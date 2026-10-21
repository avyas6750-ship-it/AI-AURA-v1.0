"use client";

import { useMemo } from "react";

interface WaveformChartProps {
  t: number[];
  y: number[];
  height?: number;
}

/**
 * Lightweight SVG waveform renderer. Avoids the heavy plotly.js dependency.
 * Renders a polyline of amplitude vs time, with grid + axes labels.
 */
export function WaveformChart({ t, y, height = 200 }: WaveformChartProps) {
  const width = 800;
  const padding = { top: 12, right: 16, bottom: 28, left: 50 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const { pathD, tMax, yMax, yMin } = useMemo(() => {
    if (y.length === 0) return { pathD: "", tMax: 0, yMax: 1, yMin: -1 };
    const tMax = t[t.length - 1] || 1;
    const yMax = Math.max(...y, 0.001);
    const yMin = Math.min(...y, -0.001);
    const yRange = Math.max(Math.abs(yMax), Math.abs(yMin)) || 1;
    const scaleX = (tt: number) => (tt / tMax) * innerW;
    const scaleY = (yy: number) => innerH / 2 - (yy / yRange) * (innerH / 2 - 4);
    let d = "";
    for (let i = 0; i < y.length; i++) {
      const x = padding.left + scaleX(t[i]);
      const yy = padding.top + scaleY(y[i]);
      d += i === 0 ? `M ${x.toFixed(2)} ${yy.toFixed(2)}` : ` L ${x.toFixed(2)} ${yy.toFixed(2)}`;
    }
    return { pathD: d, tMax, yMax: yRange, yMin: -yRange };
  }, [t, y, innerW, innerH, padding.left, padding.top]);

  if (y.length === 0) {
    return <div className="text-muted-foreground text-sm">No waveform data</div>;
  }

  // x-axis ticks (5 evenly spaced)
  const xTicks = Array.from({ length: 5 }, (_, i) => (tMax * i) / 4);
  // y-axis ticks (-1, 0, 1 normalized)
  const yTicks = [yMin, 0, yMax];

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
      aria-label="Waveform chart"
    >
      {/* Grid */}
      {xTicks.map((_, i) => {
        const x = padding.left + (innerW * i) / 4;
        return (
          <line
            key={`xg-${i}`}
            x1={x}
            y1={padding.top}
            x2={x}
            y2={padding.top + innerH}
            stroke="rgba(34, 211, 238, 0.06)"
            strokeWidth={0.5}
          />
        );
      })}
      {yTicks.map((yy, i) => {
        const yPx = padding.top + innerH / 2 - (yy / Math.max(Math.abs(yMax), 0.001)) * (innerH / 2 - 4);
        return (
          <g key={`yg-${i}`}>
            <line
              x1={padding.left}
              y1={yPx}
              x2={padding.left + innerW}
              y2={yPx}
              stroke="rgba(148, 163, 184, 0.12)"
              strokeWidth={0.5}
              strokeDasharray={yy === 0 ? undefined : "2 2"}
            />
            <text
              x={padding.left - 6}
              y={yPx + 3}
              textAnchor="end"
              fontSize={9}
              fill="rgba(148, 163, 184, 0.7)"
            >
              {yy.toFixed(2)}
            </text>
          </g>
        );
      })}
      {/* x-axis labels */}
      {xTicks.map((tt, i) => {
        const x = padding.left + (innerW * i) / 4;
        return (
          <text
            key={`xt-${i}`}
            x={x}
            y={height - 8}
            textAnchor="middle"
            fontSize={9}
            fill="rgba(148, 163, 184, 0.7)"
          >
            {tt.toFixed(2)}s
          </text>
        );
      })}
      {/* axis labels */}
      <text x={padding.left} y={padding.top - 2} fontSize={9} fill="rgba(203, 213, 225, 0.7)">
        Amplitude
      </text>
      <text
        x={padding.left + innerW}
        y={height - 8}
        textAnchor="end"
        fontSize={9}
        fill="rgba(203, 213, 225, 0.7)"
      >
        Time (s)
      </text>
      {/* Waveform polyline with cyan glow */}
      <path
        d={pathD}
        fill="none"
        stroke="#22d3ee"
        strokeWidth={1.2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: "drop-shadow(0 0 4px rgba(34, 211, 238, 0.4))" }}
      />
    </svg>
  );
}
