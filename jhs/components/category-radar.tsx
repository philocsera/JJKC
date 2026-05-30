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

// 베이스 N각형 + 꼭짓점 이동 방식: 최소 반지름을 외곽의 1/3 로 두고(값 0 도 중심으로
// 무너지지 않음), 값이 클수록 꼭짓점을 바깥으로 민다. 그래서 항상 N각형 도형이 보이고
// 선으로 붕괴하지 않는다. 0→33, 100→100 (제곱근으로 작은 값도 또렷).
const BASE = 33; // 외곽 대비 약 1/3 지점이 최소 반지름
const scale = (v: number) =>
  Math.round(BASE + (100 - BASE) * Math.sqrt(Math.max(0, Math.min(100, v)) / 100));

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
