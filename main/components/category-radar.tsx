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
const BASE = 8; // 최소 반지름(베이스 N각형) — 외곽의 약 1/12
const scale = (v: number) =>
  Math.round(BASE + (100 - BASE) * Math.sqrt(Math.max(0, Math.min(100, v)) / 100));

// 축 라벨(카테고리)을 어떤 화면 비율에서도 잘리지 않게 그리는 커스텀 tick.
// recharts 가 넘겨주는 좌표(x,y)와 중심 대비 위치로 정렬 기준(text-anchor)을 정해
// 좌측 라벨은 오른쪽 정렬, 우측 라벨은 왼쪽 정렬로 안쪽을 향하게 한다.
// margin 으로 확보한 여백 안에서만 그려지므로 SVG 경계 밖으로 넘쳐 잘리지 않는다.
function AngleTick(props: any) {
  const { x, y, cx, cy, payload } = props;
  const label: string = payload?.value ?? "";
  // 중심 대비 가로/세로 위치로 정렬 결정 (작은 임계값으로 상·하단은 가운데 정렬).
  const dx = x - cx;
  const horizThreshold = 12;
  const anchor =
    dx > horizThreshold ? "start" : dx < -horizThreshold ? "end" : "middle";

  // 긴 라벨("·" 포함, 5자 초과)은 "·" 기준으로 두 줄로 나눠 가로폭을 절반으로 줄인다.
  // → 어떤 화면 비율에서도 양 끝 라벨이 SVG 경계 밖으로 넘쳐 잘리지 않는다.
  const dot = label.indexOf("·");
  const lines =
    dot > 0 && label.length > 5
      ? [label.slice(0, dot + 1), label.slice(dot + 1)] // "·" 는 윗줄에 둔다
      : [label];

  // 세로 위치 보정: 윗줄/아랫줄 라벨이 도형과 겹치지 않게 띄우고, 2줄은 위로 올려 중앙 맞춤.
  const lift = lines.length > 1 ? -6 : 0;
  const oy = (anchor === "middle" ? (y < cy ? -4 : 10) : 4) + lift;

  return (
    <text
      x={x}
      y={y + oy}
      textAnchor={anchor}
      fill="hsl(var(--muted-foreground))"
      fontSize={13}
    >
      {lines.map((ln, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 14}>
          {ln}
        </tspan>
      ))}
    </text>
  );
}

// 값 0 인 꼭짓점(중심에 겹치는 점)은 숨기고, 나머지만 점으로 표시.
function dotRenderer(color: string) {
  return (props: any) => {
    const { cx, cy, value, index } = props;
    // 값 0(중심) 은 투명 점으로 — recharts dot 타입은 항상 element 를 요구.
    return (
      <circle
        key={`dot-${index}-${cx}-${cy}`}
        cx={cx}
        cy={cy}
        r={value ? 3.5 : 0}
        fill={color}
        stroke="hsl(var(--background))"
        strokeWidth={value ? 1 : 0}
      />
    );
  };
}

export function CategoryRadar({
  rows,
  aLabel,
  bLabel,
  heightClass = "h-72",
}: {
  rows: RadarRow[];
  aLabel: string;
  bLabel?: string;
  heightClass?: string; // 컨테이너 높이(Tailwind) — 그래픽 크기. 기본 h-72.
}) {
  const data = rows.map((r) => ({
    category: r.category,
    a: r.a,
    b: r.b,
    aS: scale(r.a),
    bS: r.b !== undefined ? scale(r.b) : undefined,
  }));

  return (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        {/* 좌우 여백을 넉넉히 줘서 양 끝 라벨(예: "영화·애니메이션")이 잘리지 않게.
            outerRadius 를 낮춰 도형이 라벨 영역을 침범하지 않도록 한다. */}
        <RadarChart
          data={data}
          outerRadius="78%"
          margin={{ top: 20, right: 44, bottom: 24, left: 44 }}
        >
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
          <PolarAngleAxis dataKey="category" tick={<AngleTick />} />
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
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
            }}
            // 차트엔 제곱근 스케일이 그려지지만 툴팁은 원래 % 로 표시.
            formatter={(_v: number, name: string, item: any) =>
              [`${item?.dataKey === "bS" ? item?.payload?.b ?? 0 : item?.payload?.a ?? 0}%`, name]
            }
          />
          {bLabel ? <Legend wrapperStyle={{ fontSize: 13 }} /> : null}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
