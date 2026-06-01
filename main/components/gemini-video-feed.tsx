"use client";

// 범용 Gemini 영상 추천 — 버튼 클릭 시 endpoint 로 POST 해 재랭킹 영상을 받아 그리드로 보여준다.
// (좋아요/싫어요 없음) /watch-as, /compare 에서 사용. 빈 상태엔 블러 teaser.

import { useEffect, useRef, useState } from "react";
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
  quota_exceeded: "오늘 AI 무료 사용량을 모두 사용했어요. 내일 다시 시도해 주세요.",
};

export function GeminiVideoFeed({
  endpoint,
  body,
  buttonLabel,
  hint,
  columns = "default",
  autoStart = false,
  maxHeightClass,
  fillHeight = false,
}: {
  endpoint: string;
  body: Record<string, unknown>;
  buttonLabel: string;
  hint: string;
  columns?: "default" | "large" | "duo"; // large=적은 열(큰 썸네일), duo=최대 2열
  autoStart?: boolean; // 진입 시 버튼 없이 바로 추천 호출(예: /watch-as)
  maxHeightClass?: string; // 설정 시 결과 영역을 그 높이로 제한하고 자체 스크롤(휠 분리)
  fillHeight?: boolean; // lg 이상에서 부모(카드) 높이를 채우고 결과 영역만 스크롤(높이 일치용)
}) {
  const gridCls =
    columns === "large"
      ? "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      : columns === "duo"
        ? "grid grid-cols-1 gap-6 sm:grid-cols-2"
        : "grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
  // fillHeight: lg 에서 카드 높이를 채우고 결과만 스크롤. 모바일은 max-h-[70vh] 로 제한.
  const outerCls = fillHeight ? "flex flex-col gap-5 lg:min-h-0 lg:flex-1" : "space-y-5";
  const scrollCls = fillHeight
    ? "overflow-y-auto pr-1 max-h-[70vh] lg:max-h-none lg:min-h-0 lg:flex-1"
    : maxHeightClass
      ? `${maxHeightClass} overflow-y-auto pr-1`
      : "";
  const [videos, setVideos] = useState<V[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 진입 시 자동 호출 — 버튼 두 번 누르지 않게(이중 작업 제거).
  const startedRef = useRef(false);
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

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
    <div className={outerCls}>
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 self-start rounded-full border border-accent/40 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
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

      <div className={scrollCls}>
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
    </div>
  );
}
