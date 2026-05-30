// 채널 최근 영상 — YouTube 공개 RSS(키 0)에서 가져와 캐시한다.
// 추천 카드 등에서 채널별 최근 영상 썸네일/제목을 보여줄 때 사용.

import { cache } from "./cache";
import { fetchChannelFeed } from "./sources/rss";

export type RecentVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
};

const TTL = 60 * 30; // 30분 — RSS 부하/레이트리밋 방지
const recentVideosKey = (channelId: string) => `recent-videos:${channelId}`;

export async function getRecentVideos(channelId: string, n = 2): Promise<RecentVideo[]> {
  const key = recentVideosKey(channelId);
  const hit = await cache.get<RecentVideo[]>(key);
  if (hit) return hit.slice(0, n);

  const feed = await fetchChannelFeed(channelId, {
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  const videos: RecentVideo[] = (feed?.videos ?? []).map((v) => ({
    videoId: v.videoId,
    title: v.title,
    thumbnail: v.thumbnail,
    publishedAt: v.publishedAt,
  }));

  // 실패(빈 결과)는 캐시하지 않아 다음 방문에 재시도.
  if (videos.length > 0) await cache.set(key, videos, TTL);
  return videos.slice(0, n);
}

// 동시성 제한 배치 — RSS 레이트리밋을 피하려고 한 번에 `concurrency` 개씩.
export async function getRecentVideosBatch(
  channelIds: string[],
  n = 2,
  concurrency = 6,
): Promise<Map<string, RecentVideo[]>> {
  const out = new Map<string, RecentVideo[]>();
  let i = 0;
  async function worker() {
    while (i < channelIds.length) {
      const idx = i++;
      const id = channelIds[idx];
      out.set(id, await getRecentVideos(id, n));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, channelIds.length) }, worker));
  return out;
}
