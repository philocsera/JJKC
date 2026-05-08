import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProfile } from "@/lib/mock-data";
import { CategoryRadar } from "@/components/category-radar";
import { CategoryBar } from "@/components/category-bar";
import { ChannelList } from "@/components/channel-list";
import { KeywordCloud } from "@/components/keyword-cloud";
import { VideoGrid } from "@/components/video-grid";
import { SyncButton } from "@/components/sync-button";
import { buildFeed } from "@/lib/feed";
import type { CategoryName } from "@/lib/types";

const ALL_CATEGORIES: CategoryName[] = [
  "Tech", "Music", "Gaming", "Entertainment", "Cooking",
  "Travel", "Beauty", "Sports", "News", "Education",
];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const profile = getProfile(user.id);
  if (!profile) {
    return (
      <p className="text-sm text-[hsl(var(--foreground))]/70">
        No AlgoProfile yet — try clicking <strong>Sync now</strong>.
      </p>
    );
  }

  const radarRows = ALL_CATEGORIES.map((cat) => ({
    category: cat,
    a: profile.categories[cat] ?? 0,
  }));
  const barRows = Object.entries(profile.categories)
    .map(([category, pct]) => ({ category, pct: pct ?? 0 }))
    .sort((a, b) => b.pct - a.pct);

  const feed = buildFeed(user.id, 12);

  return (
    <section className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {user.name}&rsquo;s algorithm
          </h1>
          <p className="text-sm text-[hsl(var(--foreground))]/70">
            {user.bio}
          </p>
        </div>
        <SyncButton initialSyncedAt={profile.lastSyncedAt} />
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-sm font-medium">Category fingerprint</h2>
          <CategoryRadar rows={radarRows} aLabel={user.name} />
        </div>
        <div className="rounded-2xl border bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-sm font-medium">Top categories</h2>
          <CategoryBar data={barRows} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-[hsl(var(--card))] p-5">
          <h2 className="mb-3 text-sm font-medium">Top channels</h2>
          <ChannelList channels={profile.topChannels} />
        </div>
        <div className="rounded-2xl border bg-[hsl(var(--card))] p-5">
          <h2 className="mb-3 text-sm font-medium">Keywords</h2>
          <KeywordCloud keywords={profile.topKeywords} />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Your feed (mock)</h2>
        <VideoGrid videos={feed} />
      </div>
    </section>
  );
}
