// Phase2.md §3.2.3 캐시 키 규약. 키 빌더를 한 곳에 모아두면 어댑터 교체 시
// 키 일관성을 보장할 수 있다.

export const CACHE_TTL = {
  channelUploads: 6 * 60 * 60,    // 6h
  keywordSearch: 24 * 60 * 60,    // 24h — search.list 가 비싸므로 가장 길게
  popularByCategory: 12 * 60 * 60, // 12h
  feed: 60 * 60,                   // 1h
} as const;

export const cacheKey = {
  channelUploads: (channelId: string) => `yt:channel:${channelId}:uploads`,
  keywordSearch: (keyword: string) => `yt:search:${keyword.toLowerCase()}`,
  popularByCategory: (categoryId: string) => `yt:popular:${categoryId}`,
  feed: (userId: string, profileVersion: number) =>
    `feed:${userId}:v${profileVersion}`,
};
