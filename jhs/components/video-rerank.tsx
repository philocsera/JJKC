"use client";

// AI 영상 추천 — 버튼 클릭 시에만 LLM 이 추천 채널들의 최근 영상을 내 취향순으로 재랭킹.
// (최신순 → 관련성순). 결과는 서버에서 프로필 버전 기준 3h 캐시 → 재요청은 호출 없이 반환.
// 버튼 누르기 전엔 블러 처리된 카드(숨겨진 카드) 위에 안내문구. 각 영상엔 좋아요/싫어요.

import { useState } from "react";
import Image from "next/image";
import { Sparkles, Loader2, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { TeaserGrid } from "@/components/teaser-grid";

type RerankedVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelId: string;
  channelName: string;
  reason: string;
};

const ERROR_MSG: Record<string, string> = {
  llm_disabled: "AI 기능이 비활성화되어 있습니다 (GEMINI_API_KEY 미설정).",
  no_profile: "먼저 알고리즘을 만들어 주세요.",
  no_videos: "추천 채널의 최근 영상을 불러오지 못했습니다.",
  llm_failed: "AI 추천 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export function VideoRerank() {
  const [videos, setVideos] = useState<RerankedVideo[] | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/discover/rerank", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERROR_MSG[data?.error] ?? data?.message ?? "생성 실패");
        return;
      }
      setLiked(new Set());
      setVideos(data.videos ?? []);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  function sendFeedback(videoId: string, action: "like" | "dislike") {
    fetch("/api/discover/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, action }),
    }).catch(() => {});
  }

  function onLike(videoId: string) {
    setLiked((prev) => {
      const next = new Set(prev);
      next.has(videoId) ? next.delete(videoId) : next.add(videoId);
      return next;
    });
    sendFeedback(videoId, "like");
  }

  function onDislike(videoId: string) {
    setVideos((prev) => (prev ? prev.filter((v) => v.videoId !== videoId) : prev));
    sendFeedback(videoId, "dislike");
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <p className="label-mono">Channel discovery</p>
          <h1 className="text-4xl font-extrabold sm:text-5xl">추천</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            당신의 알고리즘에 맞는 영상을 추천합니다.
          </p>
        </div>
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
          {loading ? "분석 중…" : videos ? "다시 추천" : "Gemini에게 영상 추천받기"}
        </button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {videos && videos.length > 0 ? (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onLike(v.videoId)}
                  aria-pressed={liked.has(v.videoId)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    liked.has(v.videoId)
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-border/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> 좋아요
                </button>
                <button
                  type="button"
                  onClick={() => onDislike(v.videoId)}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  <ThumbsDown className="h-3.5 w-3.5" /> 싫어요
                </button>
              </div>
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
          <p className="text-sm leading-relaxed text-muted-foreground">
            위의 <span className="font-medium text-accent">Gemini에게 영상 추천받기</span> 버튼을 눌러 내 알고리즘에 맞는 영상을 받아보세요.
          </p>
        </TeaserGrid>
      ) : null}
    </section>
  );
}
