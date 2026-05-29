// channel_analyze_plan §6: /discover — 클러스터 기반 채널 추천 페이지.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChannelRecommendations } from "@/components/channel-recommendations";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  return (
    <section className="space-y-8">
      <header className="space-y-3">
        <p className="label-mono">Channel discovery</p>
        <h1 className="text-4xl font-extrabold sm:text-5xl">채널 발견</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          한국 유튜브 채널을 클러스터링해, 당신의 알고리즘에 맞는 채널을 추천합니다.
        </p>
      </header>
      <ChannelRecommendations userId={userId} />
    </section>
  );
}
