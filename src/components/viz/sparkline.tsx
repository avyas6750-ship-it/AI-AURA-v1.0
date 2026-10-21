"use client";

import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

/** Tiny inline line chart used inside metric cards. */
export function Sparkline({ data, color, width = 80, height = 24 }: SparklineProps) {
  const path = useMemo(() => {
    if (data.length === 0) return "";
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = Math.max(0.001, max - min);
    const stepX = data.length > 1 ? width / (data.length - 1) : width;
    let d = "";
    data.forEach((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [data, width, height]);

  if (data.length === 0) {
    return <svg width={width} height={height} className="opacity-50" />;
  }

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 2px ${color}80)` }}
      />
    </svg>
  );
}
