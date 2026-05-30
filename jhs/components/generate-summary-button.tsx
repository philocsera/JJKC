"use client";

// 프로필 페르소나 요약 — 버튼 클릭 시에만 LLM 생성(API 호출 절약).
// summary 가 이미 있으면 텍스트 + '재생성', 없으면 '생성' 버튼.

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

export function GenerateSummaryButton({
  userId,
  initial,
}: {
  userId: string;
  initial: string;
}) {
  const [summary, setSummary] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/profile/${userId}/summary`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "생성 실패");
        return;
      }
      setSummary(data.summary);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  if (summary) {
    return (
      <p className="max-w-xl text-sm text-muted-foreground">
        {summary}{" "}
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="ml-1 align-middle text-xs text-accent hover:underline disabled:opacity-50"
        >
          {loading ? "생성 중…" : "재생성"}
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        AI로 취향 한 줄 요약
      </button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
