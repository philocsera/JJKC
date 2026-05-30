import Link from "next/link";
import { notFound } from "next/navigation";
import { Play } from "lucide-react";
import { auth } from "@/lib/auth";
import { getProfileWithOwner } from "@/lib/profile-service";
import { CategoryRadar } from "@/components/category-radar";
import { ChannelList } from "@/components/channel-list";
import { ChannelRecommendations } from "@/components/channel-recommendations";
import { fingerprintGroups } from "@/lib/categories";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await auth();
  const me = (session?.user as { id?: string } | undefined)?.id;

  const hit = await getProfileWithOwner(userId);
  if (!hit) notFound();
  const { owner, profile } = hit;

  // 모든 사용자가 동일한 최상위 카테고리 축을 갖는 fingerprint — 두 도형으로 분할.
  const fp = fingerprintGroups(profile.categories);

  return (
    <section className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border/60 pb-8">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-1 ring-border">
            {owner.image ? (
              <AvatarImage src={owner.image} alt={owner.name} />
            ) : null}
            <AvatarFallback className="text-lg">{owner.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <p className="label-mono">Algorithm profile</p>
            <h1 className="text-3xl font-extrabold sm:text-4xl">{owner.name}</h1>
            <p className="font-mono text-xs text-muted-foreground">
              last synced · {new Date(profile.lastSyncedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/watch-as/${owner.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground shadow-[0_0_24px_-6px_hsl(var(--accent)/0.8)] transition-transform hover:scale-[1.03]"
          >
            <Play className="h-4 w-4 fill-current" />
            {owner.name}님의 알고리즘으로 유튜브 보기
          </Link>
          {me && me !== owner.id ? (
            <Link
              href={`/compare?a=${me}&b=${owner.id}`}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground"
            >
              내 알고리즘과 비교하기
            </Link>
          ) : null}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Category fingerprint</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-center text-sm font-medium text-muted-foreground">{fp.a.title}</p>
              <CategoryRadar rows={fp.a.rows} aLabel={owner.name} />
            </div>
            <div>
              <p className="mb-2 text-center text-sm font-medium text-muted-foreground">{fp.b.title}</p>
              <CategoryRadar rows={fp.b.rows} aLabel={owner.name} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Top channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <ChannelList channels={profile.topChannels} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">
          {owner.name} 의 알고리즘으로 보기
        </h2>
        <p className="text-sm text-muted-foreground">
          {owner.name} 의 취향(카테고리·세부·키워드)으로 카탈로그에서 추천한 채널입니다.
        </p>
        <ChannelRecommendations userId={userId} />
      </div>
    </section>
  );
}
