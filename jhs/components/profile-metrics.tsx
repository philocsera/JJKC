// rslt.md §1 + §4 의 새 신호 배지. profiler 가 계산한 ProfileMetrics 를
// 시각화한다. dashboard / profile 페이지 양쪽에서 재사용.

import type { ProfileMetrics } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub ? (
        <div className="text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

export function ProfileMetricsCard({ metrics }: { metrics: ProfileMetrics }) {
  const shortsLabel =
    metrics.shortsRatio >= 60
      ? "Shorts 위주"
      : metrics.shortsRatio >= 30
        ? "Shorts 섞어보는"
        : "Long-form 중심";
  const diversityLabel =
    metrics.diversity >= 75
      ? "잡식 (Diverse)"
      : metrics.diversity >= 45
        ? "균형 (Balanced)"
        : "한 우물 (Focused)";
  const nicheLabel =
    metrics.nicheChannelScore >= 70
      ? "Niche 취향러"
      : metrics.nicheChannelScore >= 40
        ? "중간"
        : "Mega 채널 중심";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Algorithm signals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Diversity"
            value={`${metrics.diversity}`}
            sub={diversityLabel}
          />
          <Stat
            label="Top-1 share"
            value={`${metrics.concentration}%`}
            sub="가장 큰 카테고리 비중"
          />
          <Stat
            label="Shorts ratio"
            value={`${metrics.shortsRatio}%`}
            sub={shortsLabel}
          />
          <Stat
            label="Niche score"
            value={`${metrics.nicheChannelScore}`}
            sub={nicheLabel}
          />
        </div>

        <div className="flex flex-wrap gap-1 pt-1">
          <Badge variant="outline">
            Mainstream {metrics.mainstreamScore}/100
          </Badge>
          <Badge variant="outline">
            Long-form {metrics.longFormRatio}%
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
