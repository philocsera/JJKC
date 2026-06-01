import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { getProfileWithOwner, listPublic } from "@/lib/profile-service";
import { CompareInsightButton } from "@/components/compare-insight-button";
import { GeminiVideoFeed } from "@/components/gemini-video-feed";
import { CategoryRadar } from "@/components/category-radar";
import { categoryLabel } from "@/lib/categories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const me = (session?.user as { id?: string } | undefined)?.id;
  const aId = sp.a ?? me;
  const bId = sp.b;

  const { items } = await listPublic({ limit: 24 });
  const others = items.filter((it) => it.owner.id !== aId);

  return (
    // 비교 페이지 전체를 창 전체 폭(최대 1800px)으로 — 영상 섹션과 가로 폭 통일.
    <div className="mx-[calc(50%-50vw)] w-screen px-5 sm:px-8">
    <section className="mx-auto max-w-[1800px] space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Compare</h1>
        <p className="text-sm text-muted-foreground">
          두 알고리즘의 카테고리 분포, 공통 관심 채널, 둘 다 좋아할 영상을 비교합니다.
        </p>
      </header>

      {!aId ? (
        <Card className="p-6 text-sm text-muted-foreground">
          비교를 시작하려면 먼저 로그인하거나 URL 에 <code>?a=&amp;b=</code> 를 직접 지정해 주세요.
        </Card>
      ) : null}

      {aId && !bId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">비교할 상대를 선택하세요</CardTitle>
          </CardHeader>
          <CardContent>
            {others.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                아직 비교 가능한 공개 프로필이 없습니다.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {others.map(({ owner }) => (
                  <li key={owner.id}>
                    <Link
                      href={`/compare?a=${aId}&b=${owner.id}`}
                      className="flex items-center gap-2 rounded-xl border p-3 hover:bg-muted"
                    >
                      <Avatar className="h-8 w-8">
                        {owner.image ? (
                          <AvatarImage src={owner.image} alt={owner.name} />
                        ) : null}
                        <AvatarFallback>
                          {owner.name.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm font-medium">
                        {owner.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {aId && bId ? <CompareView aId={aId} bId={bId} /> : null}
    </section>
    </div>
  );
}

async function CompareView({ aId, bId }: { aId: string; bId: string }) {
  if (aId === bId) {
    return (
      <p className="text-sm text-muted-foreground">
        같은 사용자끼리는 비교할 수 없습니다. 다른 프로필을 선택해 주세요.
      </p>
    );
  }
  const [a, b] = await Promise.all([
    getProfileWithOwner(aId),
    getProfileWithOwner(bId),
  ]);
  if (!a || !b) {
    return (
      <p className="text-sm text-muted-foreground">
        한쪽 프로필을 찾을 수 없습니다.
      </p>
    );
  }
  const keys = Array.from(
    new Set([
      ...Object.keys(a.profile.categories),
      ...Object.keys(b.profile.categories),
    ]),
  );
  const rows = keys
    .map((cat) => ({
      category: categoryLabel(cat),
      a: a.profile.categories[cat] ?? 0,
      b: b.profile.categories[cat] ?? 0,
    }))
    .sort((x, y) => y.a + y.b - (x.a + x.b))
    .slice(0, 10);

  // 공통 관심 채널 — 둘 다 top/구독 채널에 있는 채널.
  const bChannelIds = new Set<string>([
    ...b.profile.topChannels.map((c) => c.id),
    ...b.profile.subscribedChannelIds,
  ]);
  const sharedChannels = a.profile.topChannels.filter((c) => bChannelIds.has(c.id));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {[a, b].map(({ owner }) => (
          <Card key={owner.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <Avatar>
                {owner.image ? (
                  <AvatarImage src={owner.image} alt={owner.name} />
                ) : null}
                <AvatarFallback>
                  {owner.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{owner.name}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CompareInsightButton aId={aId} bId={bId} />

      {/* 넓으면(≥lg) 좌: 분석(Category overlay 크게 + 공통 채널) / 우: 둘 다 좋아할 영상.
          좁으면 단일 열로 떨어진다. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* 좌 — 카테고리 오버레이(크게) + 공통 관심 채널 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Category overlay</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryRadar
                rows={rows}
                aLabel={a.owner.name}
                bLabel={b.owner.name}
                heightClass="h-[26rem] sm:h-[32rem]"
              />
            </CardContent>
          </Card>

          {sharedChannels.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  공통 관심 채널 ({sharedChannels.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-2">
                  {sharedChannels.map((c) => (
                    <li key={c.id}>
                      <a
                        href={`https://www.youtube.com/channel/${c.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs hover:bg-muted"
                      >
                        {c.thumbnail ? (
                          <Image
                            src={c.thumbnail}
                            alt={c.name}
                            width={24}
                            height={24}
                            className="h-6 w-6 rounded-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="h-6 w-6 rounded-full bg-muted" />
                        )}
                        <span className="max-w-[10rem] truncate">{c.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* 우 — 둘 다 좋아할 영상: 한 줄 최대 2개 + 자체 스크롤(페이지가 밑으로 늘지 않음) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              A · B 가 둘 다 좋아할 영상
            </CardTitle>
          </CardHeader>
          <CardContent>
            <GeminiVideoFeed
              endpoint="/api/compare/videos"
              body={{ aId, bId }}
              buttonLabel="AI로 둘 다 좋아할 영상 보기"
              hint={`위의 버튼을 눌러 A · B 가 둘 다 좋아할 영상을 받아보세요.`}
              columns="duo"
              maxHeightClass="max-h-[70vh]"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
