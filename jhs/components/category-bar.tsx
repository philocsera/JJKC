"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function CategoryBar({
  data,
}: {
  data: { category: string; pct: number }[];
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 16, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis
            type="category"
            dataKey="category"
            width={170}
            tick={{ fontSize: 22, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip
            contentStyle={{
              fontSize: 18,
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
            }}
            formatter={(v: number) => [`${v}%`, "share"]}
          />
          <Bar dataKey="pct" fill="hsl(var(--accent))" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
