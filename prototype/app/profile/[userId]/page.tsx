import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProfile, getUser, isFollowing } from "@/lib/mock-data";
import { CategoryRadar } from "@/components/category-radar";
import { ChannelList } from "@/components/channel-list";
import { KeywordCloud } from "@/components/keyword-cloud";
import { VideoGrid } from "@/components/video-grid";
import { FollowButton } from "@/components/follow-button";
import { buildFeed } from "@/lib/feed";
import type { CategoryName } from "@/lib/types";

const ALL_CATEGORIES: CategoryName[] = [
  "Tech", "Music", "Gaming", "Entertainment", "Cooking",
  "Travel", "Beauty", "Sports", "News", "Education",
];

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const target = getUser(userId);
  const profile = getProfile(userId);
  if (!target || !profile) notFound();
  if (!target.isPublic) {
    return (
      <p className="text-sm text-[hsl(var(--foreground))]/70">
        This profile is private.
      </p>
    );
  }

  const me = await getCurrentUser();
  const initialFollowing = me ? isFollowing(me.id, target.id) : false;

  const radarRows = ALL_CATEGORIES.map((cat) => ({
    category: cat,
    a: profile.categories[cat] ?? 0,
  }));
  const feed = buildFeed(target.id, 18);

  return (
    <section className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className="h-16 w-16 rounded-full bg-cover"
            style={{ backgroundImage: `url(${target.image})` }}
            aria-hidden
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {target.name}&rsquo;s algorithm
            </h1>
            <p className="text-sm text-[hsl(var(--foreground))]/70">
              {target.bio}
            </p>
            <p className="text-xs text-[hsl(var(--foreground))]/50">
              Last synced {new Date(profile.lastSyncedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {me && me.id !== target.id ? (
            <FollowButton
              targetUserId={target.id}
              initialFollowing={initialFollowing}
            />
          ) : null}
          {me ? (
            <Link
              href={`/compare?a=${me.id}&b=${target.id}`}
              className="rounded-full border px-4 py-1.5 text-xs font-medium hover:bg-[hsl(var(--muted))]"
            >
              Compare with me
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-sm font-medium">Category fingerprint</h2>
          <CategoryRadar rows={radarRows} aLabel={target.name} />
        </div>
        <div className="rounded-2xl border bg-[hsl(var(--card))] p-5 space-y-4">
          <div>
            <h2 className="mb-2 text-sm font-medium">Top channels</h2>
            <ChannelList channels={profile.topChannels} />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-medium">Keywords</h2>
            <KeywordCloud keywords={profile.topKeywords} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">
          See through {target.name}&rsquo;s algorithm
        </h2>
        <VideoGrid videos={feed} />
      </div>
    </section>
  );
}
