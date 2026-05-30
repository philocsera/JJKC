import Link from "next/link";
import { auth } from "@/lib/auth";
import { getProfile, listPublic } from "@/lib/profile-service";
import { profileSimilarity } from "@/lib/profiler";
import { categoryLabel } from "@/lib/categories";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Item = Awaited<ReturnType<typeof listPublic>>["items"][number];

// 나의 카테고리 분포와 가장 강하게 겹치는 카테고리(공유 카테고리) 1개.
function bestShared(mine: Record<string, number>, theirs: Record<string, number>): string | null {
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

// 한 사람 카드 (→ 그 사람의 알고리즘 프로필). 비슷한 사람이면 유사도 배지.
function PersonCard({ owner, profile, sim }: { owner: Item["owner"]; profile: Item["profile"]; sim?: number }) {
  const theirTop = Object.entries(profile.categories).sort((a, b) => b[1] - a[1])[0];
  return (
    <li>
      <Link
        href={`/profile/${owner.id}`}
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
        {sim !== undefined ? <Badge variant="accent">{sim}%</Badge> : (
          <span className="font-mono text-xs text-muted-foreground">→</span>
        )}
      </Link>
    </li>
  );
}

export default async function ExplorePage() {
  const session = await auth();
  const meId = (session?.user as { id?: string } | undefined)?.id;
  const me = meId ? await getProfile(meId) : null;
  const { items } = await listPublic({ limit: 60 });
  const others = items.filter((it) => it.owner.id !== meId);

  // ── 로그인 + 프로필 있음 → 공유 카테고리별 그룹 + "그 밖의 사람들" ──
  if (me && Object.keys(me.categories).length > 0) {
    const scored = others.map((it) => ({
      ...it,
      sim: profileSimilarity(
        { categories: me.categories, topKeywords: me.topKeywords, subCategories: me.subCategories },
        { categories: it.profile.categories, topKeywords: it.profile.topKeywords, subCategories: it.profile.subCategories },
      ),
      shared: bestShared(me.categories, it.profile.categories),
    }));

    const byCat = new Map<string, typeof scored>();
    const groupedIds = new Set<string>();
    for (const s of scored) {
      if (s.sim > 0 && s.shared) {
        if (!byCat.has(s.shared)) byCat.set(s.shared, []);
        byCat.get(s.shared)!.push(s);
        groupedIds.add(s.owner.id);
      }
    }

    const sections = Object.entries(me.categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => ({ cat, users: (byCat.get(cat) ?? []).sort((a, b) => b.sim - a.sim) }))
      .filter((s) => s.users.length > 0);

    // 그 밖의 사람들 — 어떤 공유 그룹에도 안 들어간 나머지.
    const rest = others.filter((o) => !groupedIds.has(o.owner.id));

    return (
      <section className="space-y-12">
        <header className="space-y-3">
          <p className="label-mono">Algorithm explorer</p>
          <h1 className="text-4xl font-extrabold sm:text-5xl">알고리즘 탐색</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            나와 취향이 비슷한 사람들을 함께 공유하는 카테고리별로 모았습니다. 아래에서 그 밖의 사람들도 둘러보세요.
          </p>
        </header>

        {sections.map(({ cat, users }) => (
          <div key={cat} className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="text-accent">{categoryLabel(cat)}</span>
              <span className="text-foreground">취향을 공유하는 사람</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {users.length}
              </span>
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {users.map((u) => (
                <PersonCard key={u.owner.id} owner={u.owner} profile={u.profile} sim={u.sim} />
              ))}
            </ul>
          </div>
        ))}

        {rest.length > 0 ? (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="text-foreground">그 밖의 사람들</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {rest.length}
              </span>
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map(({ owner, profile }) => (
                <PersonCard key={owner.id} owner={owner} profile={profile} />
              ))}
            </ul>
          </div>
        ) : null}

        {sections.length === 0 && rest.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            아직 둘러볼 공개 프로필이 없습니다.
          </Card>
        ) : null}
      </section>
    );
  }

  // ── 비로그인 / 프로필 없음 → 전체 공개 프로필 목록 ──
  return (
    <section className="space-y-8">
      <header className="space-y-3">
        <p className="label-mono">Public algorithms</p>
        <h1 className="text-4xl font-extrabold sm:text-5xl">알고리즘 탐색</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          {meId
            ? "다른 사람들의 알고리즘 프로필. 온보딩을 마치면 나와 비슷한 사람을 카테고리별로 모아 보여드립니다."
            : "다른 사람들의 알고리즘 프로필. 로그인하면 나와 비슷한 사람을 카테고리별로 모아 보여드립니다."}
        </p>
      </header>

      {others.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          아직 알고리즘 프로필이 없습니다. 로그인 후 온보딩을 마치면 여기에 표시됩니다.
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map(({ owner, profile }) => (
            <PersonCard key={owner.id} owner={owner} profile={profile} />
          ))}
        </ul>
      )}
    </section>
  );
}
