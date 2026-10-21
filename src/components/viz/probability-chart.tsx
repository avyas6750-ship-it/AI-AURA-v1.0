"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";

interface ProbabilityChartProps {
  probabilities: Record<string, number>;
  predictedLabel: string;
}

const COLORS: Record<string, string> = {
  Biophonic: "#22d3ee",
  Anthropogenic: "#fbbf24",
  Geophonic: "#34d399",
};

export function ProbabilityChart({ probabilities, predictedLabel }: ProbabilityChartProps) {
  const data = Object.entries(probabilities).map(([label, prob]) => ({
    name: label,
    value: Number((prob * 100).toFixed(1)),
    color: COLORS[label] || "#94a3b8",
  }));

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 60, bottom: 8, left: 8 }}>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#cbd5e1", fontSize: 12 }}
            width={110}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              backgroundColor: "rgba(15, 23, 41, 0.95)",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#f1f5f9",
              backdropFilter: "blur(8px)",
            }}
            formatter={(v: number) => [`${v}%`, "Probability"]}
          />
          <Bar dataKey="value" radius={[4, 4, 4, 4]} barSize={22}>
            {data.map((d) => (
              <Cell
                key={d.name}
                fill={d.color}
                opacity={d.name === predictedLabel ? 1 : 0.5}
                stroke={d.name === predictedLabel ? "#ffffff" : "transparent"}
                strokeWidth={d.name === predictedLabel ? 1.5 : 0}
              />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: number) => `${v}%`}
              style={{ fill: "#cbd5e1", fontSize: "11px", fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
