// channel_analyze_plan §6: /discover — 클러스터 기반 채널 추천 페이지.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChannelRecommendations } from "@/components/channel-recommendations";
import { VideoRerank } from "@/components/video-rerank";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  return (
    // 추천 페이지를 창 전체 폭(최대 1800px)으로 — 카드가 넓어져 채널명 잘림 방지.
    <div className="mx-[calc(50%-50vw)] w-screen px-5 sm:px-8">
    <section className="mx-auto max-w-[1800px] space-y-8">
      <VideoRerank />
      <ChannelRecommendations userId={userId} />
    </section>
    </div>
  );
}
