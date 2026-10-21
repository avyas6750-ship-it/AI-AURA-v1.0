"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";

interface DominantFreqChartProps {
  freqs: { freq: number; magnitude: number }[];
}

export function DominantFreqChart({ freqs }: DominantFreqChartProps) {
  if (!freqs.length) {
    return <div className="text-slate-500 text-sm">No dominant frequencies detected</div>;
  }
  const maxMag = Math.max(...freqs.map((f) => f.magnitude), 1);
  const data = freqs.map((f) => ({
    name: `${f.freq.toFixed(0)} Hz`,
    value: Number(((f.magnitude / maxMag) * 100).toFixed(1)),
  }));

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, bottom: 8, left: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            axisLine={{ stroke: "#1e293b" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "#64748b", fontSize: 9 }}
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
            }}
            formatter={(v: number) => [`${v}%`, "Relative magnitude"]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28}>
            {data.map((_, i) => (
              <Cell key={i} fill="#22d3ee" />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v: number) => `${v}%`}
              style={{ fill: "#94a3b8", fontSize: "10px", fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
