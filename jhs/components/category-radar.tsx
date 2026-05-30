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

// 뾰족함 완화용 제곱근 스케일 — 작은 값도 면적에 잡히되 순서·최대(100)는 보존.
// (100→100, 50→71, 25→50, 9→30) 한 분야 집중형이 가는 선으로 무너지지 않게.
const scale = (v: number) => Math.round(Math.sqrt(Math.max(0, v)) * 10);

// 값 0 인 꼭짓점(중심에 겹치는 점)은 숨기고, 나머지만 점으로 표시.
function dotRenderer(color: string) {
  return (props: any) => {
    const { cx, cy, value, index } = props;
    if (!value) return null;
    return (
      <circle
        key={`dot-${index}-${cx}-${cy}`}
        cx={cx}
        cy={cy}
        r={3.5}
        fill={color}
        stroke="hsl(var(--background))"
        strokeWidth={1}
      />
    );
  };
}

export function CategoryRadar({
  rows,
  aLabel,
  bLabel,
}: {
  rows: RadarRow[];
  aLabel: string;
  bLabel?: string;
}) {
  const data = rows.map((r) => ({
    category: r.category,
    a: r.a,
    b: r.b,
    aS: scale(r.a),
    bS: r.b !== undefined ? scale(r.b) : undefined,
  }));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="78%">
          <defs>
            <filter id="fpGlowA" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="hsl(var(--accent))" floodOpacity="0.6" />
            </filter>
            <filter id="fpGlowB" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="hsl(var(--primary))" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* 옅은 기준 다각형(외곽 틀) */}
          <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.45} gridType="polygon" />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />

          <Radar
            name={aLabel}
            dataKey="aS"
            stroke="hsl(var(--accent))"
            strokeWidth={2}
            fill="hsl(var(--accent))"
            fillOpacity={0.45}
            dot={dotRenderer("hsl(var(--accent))")}
            isAnimationActive={false}
            style={{ filter: "url(#fpGlowA)" }}
          />
          {bLabel ? (
            <Radar
              name={bLabel}
              dataKey="bS"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="hsl(var(--primary))"
              fillOpacity={0.22}
              dot={dotRenderer("hsl(var(--primary))")}
              isAnimationActive={false}
              style={{ filter: "url(#fpGlowB)" }}
            />
          ) : null}

          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
            }}
            // 차트엔 제곱근 스케일이 그려지지만 툴팁은 원래 % 로 표시.
            formatter={(_v: number, name: string, item: any) =>
              [`${item?.dataKey === "bS" ? item?.payload?.b ?? 0 : item?.payload?.a ?? 0}%`, name]
            }
          />
          {bLabel ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
