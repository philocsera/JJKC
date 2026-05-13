import { CACHE_TTL, cacheKey } from "../cache/keys.ts";
import type {
  CacheStore,
  Clock,
  ProfileRepo,
  YouTubeClient,
} from "../ports.ts";
import type { FeedRatios, Video } from "../types.ts";
import {
  DEFAULT_RATIOS,
  dedupeByVideoId,
  interleaveByRatio,
  shuffleForToday,
} from "./interleave.ts";
import {
  fetchFromCategories,
  fetchFromKeywords,
  fetchFromTopChannels,
} from "./sources.ts";

export type BuildFeedDeps = {
  profileRepo: ProfileRepo;
  youtube: YouTubeClient;
  cache: CacheStore;
  clock: Clock;
};

export type BuildFeedOptions = {
  total?: number;
  ratios?: FeedRatios;
  // 데이터 소스가 어디까지 후보를 가져올지. 너무 작으면 dedupe 후 total 미달.
  candidateMultiplier?: number;
};

export type BuildFeedResult =
  | { ok: true; videos: Video[]; cacheHit: boolean }
  | { ok: false; reason: "not_found" | "private" };

export async function buildFeed(
  deps: BuildFeedDeps,
  targetUserId: string,
  opts: BuildFeedOptions = {},
): Promise<BuildFeedResult> {
  const total = clamp(opts.total ?? 18, 6, 60);
  const ratios = opts.ratios ?? DEFAULT_RATIOS;
  const mult = opts.candidateMultiplier ?? 3;

  const profile = await deps.profileRepo.findById(targetUserId);
  if (!profile) return { ok: false, reason: "not_found" };
  // Phase2.md §3.2.5: 비공개와 부재를 구분하지 않음. 호출자가 404 로 매핑한다.
  if (!profile.isPublic) return { ok: false, reason: "private" };

  const today = deps.clock.today();
  const key = cacheKey.feed(targetUserId, profile.version);

  const cached = await deps.cache.get<Video[]>(key);
  if (cached) {
    return {
      ok: true,
      videos: shuffleForToday(cached, targetUserId, today).slice(0, total),
      cacheHit: true,
    };
  }

  // Phase2.md §3.2.2: 상위 N 만 조회해 쿼터 절약.
  const topChannels = profile.topChannels.slice(0, 3);
  const topKeywords = profile.topKeywords.slice(0, 2);
  const topCategories = profile.categories.slice(0, 2);

  const [byChannel, byKeyword, byCategory] = await Promise.all([
    topChannels.length
      ? fetchFromTopChannels(deps.youtube, deps.cache, topChannels, mult * 3)
      : Promise.resolve([]),
    topKeywords.length
      ? fetchFromKeywords(deps.youtube, deps.cache, topKeywords, mult * 4)
      : Promise.resolve([]),
    topCategories.length
      ? fetchFromCategories(deps.youtube, deps.cache, topCategories, mult * 3)
      : Promise.resolve([]),
  ]);

  const merged = interleaveByRatio(total * 2, [
    { items: byChannel, ratio: ratios.channel },
    { items: byKeyword, ratio: ratios.keyword },
    { items: byCategory, ratio: ratios.category },
  ]);
  const deduped = dedupeByVideoId(merged);

  await deps.cache.set(key, deduped, CACHE_TTL.feed);

  return {
    ok: true,
    videos: shuffleForToday(deduped, targetUserId, today).slice(0, total),
    cacheHit: false,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}
