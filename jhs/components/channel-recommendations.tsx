// channel_analyze_plan §6: 사용자 알고리즘 → 클러스터 배정 + 추천 채널 그리드.
// 서버 컴포넌트 — similar-users.tsx 의 패턴을 따른다. YouTube 호출 0u.

import Image from "next/image";
import { getProfile } from "@/lib/profile-service";
import { recommendForUser } from "@/lib/channel-recommender";
import { getRecentVideosBatch } from "@/lib/recent-videos";
import { categoryLabel, clusterLabel } from "@/lib/categories";
import { CategoryRadar, type RadarRow } from "@/components/category-radar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function fmtSubs(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}천만`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(n);
}

export async function ChannelRecommendations({ userId }: { userId: string }) {
  const me = await getProfile(userId);
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

  const top = result.assignments[0];

  // 추천 채널별 최근 영상 2개 (RSS, 키 0, 캐시).
  const recentMap = await getRecentVideosBatch(
    result.recommendations.map((r) => r.channel.id),
    2,
  );

  // 사용자 vs 배정 클러스터 centroid radar.
  let radar: RadarRow[] = [];
  if (me && top) {
    const names = Array.from(
      new Set([
        ...Object.keys(me.categories),
        ...Object.keys(top.cluster.centroid),
      ]),
    ).slice(0, 8);
    radar = names.map((category) => ({
      category: categoryLabel(category),
      a: me.categories[category] ?? 0,
      b: top.cluster.centroid[category] ?? 0,
    }));
  }

  return (
    <div className="space-y-8">
      {/* 클러스터 배정 */}
      {top ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">당신의 알고리즘 부족</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                {top.cluster.color ? (
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: top.cluster.color }}
                  />
                ) : null}
                <span className="text-lg font-semibold">{clusterLabel(top.cluster.label)}</span>
                <Badge variant="accent">{top.score}% 일치</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                전체 {result.catalogSize.toLocaleString()}개 한국 채널을{" "}
                {result.clusterCount}개 클러스터로 묶은 결과 중 당신과 가장 가까운 묶음입니다.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {top.cluster.topKeywords.slice(0, 8).map((kw) => (
                  <Badge key={kw} variant="muted">
                    {kw}
                  </Badge>
                ))}
              </div>
              {result.assignments[1] ? (
                <p className="text-xs text-muted-foreground">
                  다음으로 가까운 묶음: {clusterLabel(result.assignments[1].cluster.label)} (
                  {result.assignments[1].score}%)
                </p>
              ) : null}
              {result.coldStart ? (
                <p className="text-xs text-amber-600">
                  프로필이 아직 빈약합니다 — 동기화를 한 번 더 하면 추천이 정확해집니다.
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">나 vs 클러스터 중심</CardTitle>
            </CardHeader>
            <CardContent>
              {radar.length > 0 ? (
                <CategoryRadar rows={radar} aLabel="나" bLabel={clusterLabel(top.cluster.label)} />
              ) : (
                <p className="text-sm text-muted-foreground">비교할 카테고리가 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

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
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                        {channel.title.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{channel.title}</div>
                      <div className="text-xs text-muted-foreground">
                        구독자 {fmtSubs(channel.subscriberCount)}
                      </div>
                    </div>
                  </a>

                  {/* 최근 영상 2개 — 썸네일 + 제목 */}
                  {videos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
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
                          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground group-hover:text-foreground">
                            {v.title}
                          </p>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">최근 영상을 불러오지 못했습니다.</p>
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
