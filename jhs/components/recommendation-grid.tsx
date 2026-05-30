"use client";

// 추천 채널 그리드(인터랙티브). 좋아요/싫어요 시 해당 카드를 빼고 다음 추천 카드로 채운다.
// - 좋아요 → /api/channels/feedback(like) → 서버가 '좋아하는 채널' 목록에 추가, 이후 추천 제외
// - 싫어요 → feedback(dislike) → 이후 그 채널 + 관련 채널 추천 제외
// 서버에서 받은 카드 풀에서 앞 VISIBLE개만 보여주고, 카드가 빠지면 풀의 다음 카드가 자동 노출.

import { useState } from "react";
import Image from "next/image";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export type RecVideo = { videoId: string; title: string; thumbnail: string };
export type RecCard = {
  id: string;
  title: string;
  thumbnail: string;
  subscriberCount: number;
  videos: RecVideo[];
};

const VISIBLE = 12;

function fmtSubs(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}천만`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(n);
}

export function RecommendationGrid({ cards: initial }: { cards: RecCard[] }) {
  const [cards, setCards] = useState(initial);
  const visible = cards.slice(0, VISIBLE);

  function feedback(channelId: string, action: "like" | "dislike") {
    // 낙관적: 카드 즉시 제거(→ 풀의 다음 카드가 슬롯을 채움). 실패해도 UX 유지.
    setCards((prev) => prev.filter((c) => c.id !== channelId));
    fetch("/api/channels/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, action }),
    }).catch(() => {});
  }

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        추천할 채널을 다 봤습니다. 잠시 후 다시 확인해 주세요.
      </p>
    );
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {visible.map((c) => (
        <li key={c.id} className="flex h-full flex-col gap-3 rounded-xl border p-4">
          {/* 채널 헤더 */}
          <a
            href={`https://www.youtube.com/channel/${c.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
          >
            {c.thumbnail ? (
              <Image
                src={c.thumbnail}
                alt={c.title}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-base font-semibold">
                {c.title.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{c.title}</div>
              <div className="text-sm text-muted-foreground">구독자 {fmtSubs(c.subscriberCount)}</div>
            </div>
          </a>

          {/* 최근 영상 2개 — 가로 배치 */}
          {c.videos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {c.videos.map((v) => (
                <a
                  key={v.videoId}
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block space-y-1"
                >
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                    {v.thumbnail ? (
                      <Image
                        src={v.thumbnail}
                        alt={v.title}
                        fill
                        sizes="(max-width: 640px) 50vw, 220px"
                        className="object-cover transition-transform group-hover:scale-105"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground group-hover:text-foreground">
                    {v.title}
                  </p>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">최근 영상을 불러오지 못했습니다.</p>
          )}

          {/* 좋아요 / 싫어요 */}
          <div className="mt-auto flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => feedback(c.id, "like")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/40 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              <ThumbsUp className="h-4 w-4" /> 좋아요
            </button>
            <button
              type="button"
              onClick={() => feedback(c.id, "dislike")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              <ThumbsDown className="h-4 w-4" /> 싫어요
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
