import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile-service";
import { performAutoSync } from "@/lib/sync-service"; // Import the auto-sync engine
import { CategoryRadar } from "@/components/category-radar";
import { CategoryBar } from "@/components/category-bar";
import { ChannelList } from "@/components/channel-list";
import { KeywordCloud } from "@/components/keyword-cloud";
import { VideoGrid } from "@/components/video-grid";
import { SyncButton } from "@/components/sync-button";
import { buildFeed } from "@/lib/feed";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  
  if (!user || !user.id) {
    redirect("/");
  }
  
  let profile = await getProfile(user.id);
  
  // [자동 분석 로직] 프로필이 없다면 즉시 분석 시작
  if (!profile) {
    console.log(`First login for user ${user.id}, starting auto-sync...`);
    try {
      await performAutoSync(user.id);
      profile = await getProfile(user.id); // Re-fetch the newly created profile
    } catch (error) {
      return (
        <div className="p-8 text-center space-y-4">
          <h1 className="text-xl font-bold">유튜브 데이터를 가져오지 못했습니다.</h1>
          <p className="text-gray-600">유튜브 계정이 비공개로 되어 있거나 인증이 만료되었을 수 있습니다.</p>
          <a href="/" className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg">다시 로그인하기</a>
        </div>
      );
    }
  }

  // 만약 동기화 후에도 profile이 없다면 (이론상 위에서 처리되지만 안전을 위해)
  if (!profile) return null;

  // Get all unique categories from the profile
  const categories = Object.keys(profile.categories);

  const radarRows = categories.map((cat) => ({
    category: cat,
    a: profile.categories[cat] ?? 0,
  }));
  
  const barRows = Object.entries(profile.categories)
    .map(([category, pct]) => ({ category, pct: pct as number ?? 0 }))
    .sort((a, b) => b.pct - a.pct);

  // Still using mock feed for now as buildFeed uses mock-data.ts internally
  const feed = buildFeed(user.id, 12);

  return (
    <section className="space-y-10 p-8">
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
          <KeywordCloud keywords={profile.keywords} />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Your feed (mock)</h2>
        <VideoGrid videos={feed} />
      </div>
    </section>
  );
}
