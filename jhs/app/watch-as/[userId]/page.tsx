// /watch-as/[userId] — "OO님의 알고리즘으로 유튜브 보기".
// 대상 사용자의 알고리즘(AlgoProfile) 기반으로 buildFeed 가 합성한 영상들을
// 실제 YouTube 홈과 비슷한 그리드 UI 로 배치한다. YouTube Data API 0u (RSS).

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Play, ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getProfileWithOwner } from "@/lib/profile-service";
import { buildFeed } from "@/lib/feed-builder";
import { getChannelsByIds } from "@/lib/channel-service";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = Date.now() - t;
  const day = 86_400_000;
  if (diff < day) {
    const h = Math.floor(diff / 3_600_000);
    return h <= 0 ? "방금 전" : `${h}시간 전`;
  }
  if (diff < 30 * day) return `${Math.floor(diff / day)}일 전`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}개월 전`;
  return `${Math.floor(diff / (365 * day))}년 전`;
}

export default async function WatchAsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await auth();
  const me = (session?.user as { id?: string } | undefined)?.id;

  const hit = await getProfileWithOwner(userId);
  if (!hit) notFound();
  const { owner } = hit;

  // viewerId 는 캐시 키 용도일 뿐 — 로그인 안 했으면 대상 본인 id 로 대체.
  const feed = await buildFeed(me ?? userId, userId, 32);

  // 채널 썸네일(아바타)을 카탈로그에서 보강.
  const thumbById = new Map<string, string>();
  if (feed.ok) {
    const ids = Array.from(new Set(feed.videos.map((v) => v.channelId))).filter(Boolean);
    for (const c of await getChannelsByIds(ids)) thumbById.set(c.id, c.thumbnail);
  }

  return (
    <div className="space-y-6">
      {/* 컨텍스트 헤더 — 누구의 알고리즘인지 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground shadow-[0_0_24px_-6px_hsl(var(--accent)/0.8)]">
            <Play className="h-5 w-5 fill-current" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold sm:text-2xl">
              {owner.name}님의 알고리즘
            </h1>
            <p className="text-xs text-muted-foreground">
              이 사람의 시청 취향으로 재구성한 추천 피드입니다.
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

      {!feed.ok ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {feed.reason === "no_profile"
            ? "이 사용자는 아직 알고리즘 프로필이 없습니다."
            : "지금은 피드를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요."}
        </p>
      ) : feed.videos.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          표시할 영상이 없습니다.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {feed.videos.map((v) => {
            const avatar = thumbById.get(v.channelId);
            return (
              <li key={v.id}>
                <a
                  href={`https://www.youtube.com/watch?v=${v.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  {/* 썸네일 16:9 */}
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                    {v.thumbnail ? (
                      <Image
                        src={v.thumbnail}
                        alt={v.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  {/* 메타 — 아바타 + 제목/채널/시간 */}
                  <div className="mt-3 flex gap-3">
                    {avatar ? (
                      <Image
                        src={avatar}
                        alt={v.channelName}
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                        {v.channelName.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-accent">
                        {v.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {v.channelName}
                      </p>
                      <p className="text-xs text-muted-foreground">{timeAgo(v.publishedAt)}</p>
                    </div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
