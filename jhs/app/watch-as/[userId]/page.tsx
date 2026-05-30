// /watch-as/[userId] — "OO님의 알고리즘으로 유튜브 보기".
// 대상 사용자의 알고리즘(AlgoProfile)으로 Gemini 가 재랭킹한 추천 영상을 보여준다.
// 버튼 클릭 시에만 호출(온디맨드) + 대상 기준 캐시. YouTube Data API 0u (RSS).

import Link from "next/link";
import { notFound } from "next/navigation";
import { Play, ArrowLeft } from "lucide-react";
import { getProfileWithOwner } from "@/lib/profile-service";
import { GeminiVideoFeed } from "@/components/gemini-video-feed";

export const dynamic = "force-dynamic";

export default async function WatchAsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const hit = await getProfileWithOwner(userId);
  if (!hit) notFound();
  const { owner } = hit;

  return (
    <div className="space-y-6">
      {/* 컨텍스트 헤더 — 누구의 알고리즘인지 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground shadow-[0_0_24px_-6px_hsl(var(--accent)/0.8)]">
            <Play className="h-5 w-5 fill-current" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold sm:text-2xl">{owner.name}님의 알고리즘</h1>
            <p className="text-xs text-muted-foreground">
              이 사람의 시청 취향으로 Gemini가 골라준 추천 영상입니다.
            </p>
          </div>
        </div>
        <Link
          href={`/profile/${owner.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          프로필로
        </Link>
      </div>

      <GeminiVideoFeed
        endpoint="/api/watch-as/rerank"
        body={{ userId }}
        buttonLabel={`Gemini로 ${owner.name}님의 추천 영상 보기`}
        hint={`위의 버튼을 눌러 ${owner.name}님의 알고리즘으로 추천 영상을 받아보세요.`}
      />
    </div>
  );
}
