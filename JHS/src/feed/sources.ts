import { CACHE_TTL, cacheKey } from "../cache/keys.ts";
import type { CacheStore, YouTubeClient } from "../ports.ts";
import type {
  CategoryId,
  ChannelId,
  KeywordTerm,
  Video,
} from "../types.ts";

async function cachedFetch<T>(
  cache: CacheStore,
  key: string,
  ttl: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;
  const value = await loader();
  await cache.set(key, value, ttl);
  return value;
}

export async function fetchFromTopChannels(
  youtube: YouTubeClient,
  cache: CacheStore,
  channelIds: ChannelId[],
  perChannel: number,
): Promise<Video[]> {
  const results = await Promise.all(
    channelIds.map((id) =>
      cachedFetch(
        cache,
        cacheKey.channelUploads(id),
        CACHE_TTL.channelUploads,
        () => youtube.channelUploads(id, perChannel),
      ),
    ),
  );
  return results.flat();
}

export async function fetchFromKeywords(
  youtube: YouTubeClient,
  cache: CacheStore,
  keywords: KeywordTerm[],
  perKeyword: number,
): Promise<Video[]> {
  // 키워드 검색은 100 units/호출 — 절대 직접 호출 금지, 반드시 캐시 경유.
  const results = await Promise.all(
    keywords.map((kw) =>
      cachedFetch(
        cache,
        cacheKey.keywordSearch(kw),
        CACHE_TTL.keywordSearch,
        () => youtube.searchByKeyword(kw, perKeyword),
      ),
    ),
  );
  return results.flat();
}

export async function fetchFromCategories(
  youtube: YouTubeClient,
  cache: CacheStore,
  categoryIds: CategoryId[],
  perCategory: number,
): Promise<Video[]> {
  const results = await Promise.all(
    categoryIds.map((id) =>
      cachedFetch(
        cache,
        cacheKey.popularByCategory(id),
        CACHE_TTL.popularByCategory,
        () => youtube.popularByCategory(id, perCategory),
      ),
    ),
  );
  return results.flat();
}
