import Link from "next/link";
import { listPublic } from "@/lib/profile-service";
import { categoryLabel } from "@/lib/categories";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const { items } = await listPublic({ limit: 24 });

  return (
    <section className="space-y-10">
      <header className="space-y-3">
        <p className="label-mono">Public algorithms</p>
        <h1 className="text-4xl font-extrabold sm:text-5xl">알고리즘 탐색</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          다른 사람들의 알고리즘 프로필. 누구의 취향으로 채널을 받아 보고 싶나요?
        </p>
      </header>

      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          아직 알고리즘 프로필이 없습니다. 로그인 후 온보딩을 마치면 여기에 표시됩니다.
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ owner, profile }) => {
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

                    {/* 카테고리 분포 미니 바 */}
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

                    <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                      <span className="truncate text-muted-foreground">
                        {profile.topChannels.slice(0, 2).map((c) => c.name).join(", ") || "—"}
                      </span>
                      <span className="shrink-0 font-mono uppercase tracking-wider text-accent">
                        Open
                      </span>
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
