// channel_analyze_plan §6: 사용자 알고리즘 → 클러스터 배정 + 추천 채널 그리드.
// 서버 컴포넌트 — similar-users.tsx 의 패턴을 따른다. YouTube 호출 0u.

import Image from "next/image";
import { recommendForUser } from "@/lib/channel-recommender";
import { getRecentVideosBatch } from "@/lib/recent-videos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function fmtSubs(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}천만`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(n);
}

export async function ChannelRecommendations({ userId }: { userId: string }) {
  const result = await recommendForUser(userId, { limit: 24, maxPerCluster: 6 });

  if (!result.ok && result.reason === "no_profile") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          먼저 <a href="/onboard" className="text-accent underline-offset-4 hover:underline">알고리즘 만들기</a>에서 프로필을 만들어 주세요.
        </CardContent>
      </Card>
    );
  }

  if (!result.ok && result.reason === "empty_catalog") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">채널 카탈로그가 비어 있습니다</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>아직 수집·클러스터링된 채널이 없습니다. 다음을 실행하세요:</p>
          <pre className="rounded-lg bg-muted p-3 text-xs">
{`# 합성 데이터로 빠르게 체험
npm run channels:collect -- --mock 300
npm run channels:cluster

# 실제 수집 (API key 또는 Google 로그인 필요)
npm run channels:collect
npm run channels:cluster`}
          </pre>
        </CardContent>
      </Card>
    );
  }

  // 추천 채널별 최근 영상 2개 (RSS, 키 0, 캐시).
  const recentMap = await getRecentVideosBatch(
    result.recommendations.map((r) => r.channel.id),
    2,
  );

  return (
    <div className="space-y-8">
      {/* 추천 채널 그리드 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">
          추천 채널 — 내 알고리즘에 맞고 아직 구독하지 않은 채널
        </h2>
        {result.recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            추천할 채널이 없습니다. 카탈로그를 더 모으거나 클러스터링을 다시 실행해 보세요.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {result.recommendations.map(({ channel }) => {
              const videos = recentMap.get(channel.id) ?? [];
              return (
                <li
                  key={channel.id}
                  className="flex h-full flex-col gap-3 rounded-xl border p-4"
                >
                  {/* 채널 헤더 — 프로필/이름/구독자수만 */}
                  <a
                    href={`https://www.youtube.com/channel/${channel.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 transition-opacity hover:opacity-80"
                  >
                    {channel.thumbnail ? (
                      <Image
                        src={channel.thumbnail}
                        alt={channel.title}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-base font-semibold">
                        {channel.title.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold">{channel.title}</div>
                      <div className="text-sm text-muted-foreground">
                        구독자 {fmtSubs(channel.subscriberCount)}
                      </div>
                    </div>
                  </a>

                  {/* 최근 영상 2개 — 위아래로 배치(제목 잘림 방지) */}
                  {videos.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {videos.map((v) => (
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
                                sizes="(max-width: 640px) 50vw, 200px"
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
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
