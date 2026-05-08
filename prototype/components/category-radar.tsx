"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

export type RadarRow = { category: string; a: number; b?: number };

export function CategoryRadar({
  rows,
  aLabel = "You",
  bLabel,
}: {
  rows: RadarRow[];
  aLabel?: string;
  bLabel?: string;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={rows} outerRadius="78%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 60]}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 9 }}
            stroke="hsl(var(--border))"
          />
          <Radar
            name={aLabel}
            dataKey="a"
            stroke="hsl(var(--accent))"
            fill="hsl(var(--accent))"
            fillOpacity={0.35}
          />
          {bLabel ? (
            <Radar
              name={bLabel}
              dataKey="b"
              stroke="#0ea5e9"
              fill="#0ea5e9"
              fillOpacity={0.25}
            />
          ) : null}
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
