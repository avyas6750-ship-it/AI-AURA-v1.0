"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface DonutChartProps {
  data: { name: string; value: number; color: string }[];
  centerLabel?: string;
  centerValue?: string | number;
  height?: number;
}

export function DonutChart({ data, centerLabel, centerValue, height = 160 }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  // Recharts doesn't render a Pie with all-zero values. Inject a placeholder
  // gray "empty" slice when total = 0 so we still see a ring outline.
  const renderData =
    total === 0
      ? [{ name: "No events", value: 1, color: "#1e293b" }]
      : data;

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={renderData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={total > 0 ? 2 : 0}
            stroke="none"
          >
            {renderData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(15, 23, 41, 0.95)",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#f1f5f9",
            }}
            formatter={(v: number, n: string) =>
              total === 0 ? ["No events detected", n] : [`${v} events`, n]
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-2xl font-bold text-slate-100">
          {centerValue ?? total}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          {centerLabel ?? "Total Events"}
        </div>
      </div>
    </div>
  );
}
