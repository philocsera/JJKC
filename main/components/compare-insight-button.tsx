"use client";

// 두 알고리즘 AI 비교 코멘트 — 버튼 클릭 시에만 생성(24h 캐시 → 재요청은 무료).

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CompareInsightButton({ aId, bId }: { aId: string; bId: string }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/compare/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId, bId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "생성 실패");
        return;
      }
      setInsight(data.insight);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  if (insight) {
    return (
      <Card className="border-accent/30 bg-accent/5">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-accent">AI 비교 분석</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-sm leading-relaxed">{insight}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        AI 비교 분석 보기
      </button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
