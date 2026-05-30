"use client";

// 범용 Gemini 영상 추천 — 버튼 클릭 시 endpoint 로 POST 해 재랭킹 영상을 받아 그리드로 보여준다.
// (좋아요/싫어요 없음) /watch-as, /compare 에서 사용. 빈 상태엔 블러 teaser.

import { useState } from "react";
import Image from "next/image";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { TeaserGrid } from "@/components/teaser-grid";

type V = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelId: string;
  channelName: string;
  reason: string;
};

const ERROR_MSG: Record<string, string> = {
  llm_disabled: "AI 기능이 비활성화되어 있습니다 (GEMINI_API_KEY 미설정).",
  no_profile: "알고리즘 프로필이 없습니다.",
  no_videos: "최근 영상을 불러오지 못했습니다.",
  llm_failed: "AI 추천 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export function GeminiVideoFeed({
  endpoint,
  body,
  buttonLabel,
  hint,
  columns = "default",
}: {
  endpoint: string;
  body: Record<string, unknown>;
  buttonLabel: string;
  hint: string;
  columns?: "default" | "large"; // large = 적은 열 = 큰 썸네일
}) {
  const gridCls =
    columns === "large"
      ? "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      : "grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
  const [videos, setVideos] = useState<V[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERROR_MSG[data?.error] ?? data?.message ?? "생성 실패");
        return;
      }
      setVideos(data.videos ?? []);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : videos ? (
          <RefreshCw className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {loading ? "분석 중…" : videos ? "다시 추천" : buttonLabel}
      </button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {videos && videos.length > 0 ? (
        <ul className={gridCls}>
          {videos.map((v) => (
            <li key={v.videoId}>
              <a
                href={`https://www.youtube.com/watch?v=${v.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                  {v.thumbnail ? (
                    <Image
                      src={v.thumbnail}
                      alt={v.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-cover transition-transform group-hover:scale-105"
                      unoptimized
                    />
                  ) : null}
                </div>
                <p className="mt-3 line-clamp-2 text-base font-semibold leading-snug transition-colors group-hover:text-accent">
                  {v.title}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">{v.channelName}</p>
                {v.reason ? (
                  <p className="mt-1.5 line-clamp-1 text-xs font-medium text-accent">★ {v.reason}</p>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      ) : loading ? (
        <TeaserGrid>
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 취향에 맞는 영상을 고르는 중…
          </span>
        </TeaserGrid>
      ) : !error ? (
        <TeaserGrid>
          <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p>
        </TeaserGrid>
      ) : null}
    </div>
  );
}
