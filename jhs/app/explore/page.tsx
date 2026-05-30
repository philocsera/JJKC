import Link from "next/link";
import { auth } from "@/lib/auth";
import { getProfile, listPublic } from "@/lib/profile-service";
import { profileSimilarity } from "@/lib/profiler";
import { categoryLabel } from "@/lib/categories";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// 나의 카테고리 분포와 가장 강하게 겹치는 카테고리(공유 카테고리) 1개.
function bestShared(
  mine: Record<string, number>,
  theirs: Record<string, number>,
): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const [cat, w] of Object.entries(mine)) {
    const score = Math.min(w, theirs[cat] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

export default async function ExplorePage() {
  const session = await auth();
  const meId = (session?.user as { id?: string } | undefined)?.id;
  const me = meId ? await getProfile(meId) : null;
  const { items } = await listPublic({ limit: 60 });
  const others = items.filter((it) => it.owner.id !== meId);

  // ── 로그인 + 프로필 있음 → 나와 비슷한 사람을 "공유 카테고리"별로 그룹화 ──
  if (me && Object.keys(me.categories).length > 0) {
    const scored = others
      .map((it) => ({
        owner: it.owner,
        profile: it.profile,
        sim: profileSimilarity(
          { categories: me.categories, topKeywords: me.topKeywords, subCategories: me.subCategories },
          {
            categories: it.profile.categories,
            topKeywords: it.profile.topKeywords,
            subCategories: it.profile.subCategories,
          },
        ),
        shared: bestShared(me.categories, it.profile.categories),
      }))
      .filter((it) => it.sim > 0 && it.shared);

    const byCat = new Map<string, typeof scored>();
    for (const s of scored) {
      const arr = byCat.get(s.shared!) ?? [];
      arr.push(s);
      byCat.set(s.shared!, arr);
    }

    // 섹션 순서 = 내 카테고리 비중 높은 순. 유저는 유사도 높은 순.
    const sections = Object.entries(me.categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => ({
        cat,
        users: (byCat.get(cat) ?? []).sort((a, b) => b.sim - a.sim),
      }))
      .filter((s) => s.users.length > 0);

    return (
      <section className="space-y-12">
        <header className="space-y-3">
          <p className="label-mono">Algorithm explorer</p>
          <h1 className="text-4xl font-extrabold sm:text-5xl">알고리즘 탐색</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            나와 취향이 비슷한 사람들을, 함께 공유하는 카테고리별로 모았습니다.
          </p>
        </header>

        {sections.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            아직 나와 취향을 공유하는 공개 프로필이 충분하지 않습니다.
          </Card>
        ) : (
          sections.map(({ cat, users }) => (
            <div key={cat} className="space-y-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <span className="text-accent">{categoryLabel(cat)}</span>
                <span className="text-foreground">취향을 공유하는 사람</span>
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {users.length}
                </span>
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {users.map(({ owner, profile, sim }) => {
                  const theirTop = Object.entries(profile.categories).sort(
                    (a, b) => b[1] - a[1],
                  )[0];
                  return (
                    <li key={owner.id}>
                      <Link
                        href={`/compare?a=${meId}&b=${owner.id}`}
                        className="lift flex items-center gap-3 rounded-xl border p-3 hover:bg-muted"
                      >
                        <Avatar className="h-10 w-10 ring-1 ring-border">
                          {owner.image ? <AvatarImage src={owner.image} alt={owner.name} /> : null}
                          <AvatarFallback>{owner.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{owner.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {theirTop ? `${categoryLabel(theirTop[0])} 중심` : "—"}
                          </div>
                        </div>
                        <Badge variant="accent">{sim}%</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    );
  }

  // ── 비로그인 / 프로필 없음 → 전체 공개 프로필 목록 ──
  return (
    <section className="space-y-10">
      <header className="space-y-3">
        <p className="label-mono">Public algorithms</p>
        <h1 className="text-4xl font-extrabold sm:text-5xl">알고리즘 탐색</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          {meId
            ? "다른 사람들의 알고리즘 프로필. 온보딩을 마치면 나와 비슷한 사람을 카테고리별로 보여드립니다."
            : "다른 사람들의 알고리즘 프로필. 로그인하면 나와 비슷한 사람을 카테고리별로 모아 보여드립니다."}
        </p>
      </header>

      {others.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          아직 알고리즘 프로필이 없습니다. 로그인 후 온보딩을 마치면 여기에 표시됩니다.
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {others.map(({ owner, profile }) => {
            const cats = Object.entries(profile.categories).sort((a, b) => b[1] - a[1]).slice(0, 3);
            const top = cats[0];
            return (
              <li key={owner.id}>
                <Link href={`/profile/${owner.id}`} className="block">
                  <Card className="lift flex h-full flex-col gap-5 p-5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-11 w-11 ring-1 ring-border">
                        {owner.image ? <AvatarImage src={owner.image} alt={owner.name} /> : null}
                        <AvatarFallback>{owner.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{owner.name}</div>
                        <div className="label-mono mt-0.5">
                          {top ? categoryLabel(top[0]) : "no data"}
                        </div>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">→</span>
                    </div>

                    <div className="space-y-2">
                      {cats.map(([name, pct]) => (
                        <div key={name} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="truncate text-muted-foreground">{categoryLabel(name)}</span>
                            <span className="font-mono tabular-nums text-foreground">{pct}%</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
