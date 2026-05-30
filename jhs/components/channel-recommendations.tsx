// channel_analyze_plan §6: 사용자 알고리즘 → 추천 채널. 서버에서 추천 풀 + 최근 영상을
// 만들어 인터랙티브 그리드(RecommendationGrid)에 넘긴다. YouTube 호출 0u(RSS, 캐시).

import { recommendForUser } from "@/lib/channel-recommender";
import { getRecentVideosBatch } from "@/lib/recent-videos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecommendationGrid, type RecCard } from "@/components/recommendation-grid";

export async function ChannelRecommendations({ userId }: { userId: string }) {
  // 좋아요/싫어요로 카드를 빼고 다음 카드로 채울 수 있게 넉넉히(버퍼) 받아온다.
  const result = await recommendForUser(userId, { limit: 28, maxPerCluster: 6 });

  if (!result.ok && result.reason === "no_profile") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          먼저 <a href="/onboard" className="text-accent underline-offset-4 hover:underline">알고리즘 만들기</a>에서 프로필을 만들어 주세요.
        </CardContent>
      </Card>
    );
  }

  if (!result.ok && result.reason === "empty_catalog") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">채널 카탈로그가 비어 있습니다</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>아직 수집·클러스터링된 채널이 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  if (result.recommendations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">추천할 채널이 없습니다.</p>
    );
  }

  // 추천 채널별 최근 영상 2개 (RSS, 키 0, 캐시).
  const recentMap = await getRecentVideosBatch(
    result.recommendations.map((r) => r.channel.id),
    2,
  );

  const cards: RecCard[] = result.recommendations.map(({ channel }) => ({
    id: channel.id,
    title: channel.title,
    thumbnail: channel.thumbnail,
    subscriberCount: channel.subscriberCount,
    videos: recentMap.get(channel.id) ?? [],
  }));

  return <RecommendationGrid cards={cards} />;
}
