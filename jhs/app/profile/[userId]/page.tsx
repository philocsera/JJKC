import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProfileWithOwner } from "@/lib/profile-service";
import { CategoryRadar } from "@/components/category-radar";
import { ChannelList } from "@/components/channel-list";
import { ChannelRecommendations } from "@/components/channel-recommendations";
import { FollowButton } from "@/components/follow-button";
import { ProfileMetricsCard } from "@/components/profile-metrics";
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

  const initialFollowing = me
    ? !!(await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: me, followingId: userId } },
      }))
    : false;

  const radarRows = Object.entries(profile.categories).map(([category, pct]) => ({
    category,
    a: pct,
  }));

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
            <p className="font-mono text-[11px] text-muted-foreground">
              last synced · {new Date(profile.lastSyncedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {me && me !== owner.id ? (
            <FollowButton
              targetUserId={owner.id}
              initialFollowing={initialFollowing}
            />
          ) : null}
          {me ? (
            <Link
              href={`/compare?a=${me}&b=${owner.id}`}
              className="rounded-full border border-border px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground"
            >
              Compare
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Category fingerprint</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryRadar rows={radarRows} aLabel={owner.name} />
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
      </div>

      <ProfileMetricsCard metrics={profile.metrics} />

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
