// /discover 영상 재랭킹 오케스트레이션.
// 추천 채널 → 각 채널 RSS 최근 영상으로 후보 풀 구성 → LLM 이 사용자 취향에 맞는 순으로
// top-N 선별(이유 포함). YouTube API 호출 0 (RSS, 캐시). API 라우트에서 캐시로 감싼다.

import { prisma } from "./prisma";
import { recommendForUser } from "./channel-recommender";
import { getRecentVideosBatch } from "./recent-videos";
import { getProfile, getProfileWithOwner } from "./profile-service";
import { categoryLabel } from "./categories";
import { rerankVideos, rerankSharedVideos, type VideoCandidate } from "./llm-features";
import { LlmQuotaError } from "./llm";

const CHANNEL_FANOUT = 18;     // 후보 영상을 모을 추천 상위 채널 수
const PER_CHANNEL = 8;         // 채널당 가져올 최근 영상 수(RSS)
const POOL_PER_CHANNEL = 1;    // 후보 풀 채널당 상한 — 추천/비교 모두 채널당 영상 1개만 노출
const POOL_CAP = 150;          // LLM 프롬프트에 넣을 후보 영상 상한
const TOP_N = 15;              // 최종 노출 영상 수

export type RerankedVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelId: string;
  channelName: string;
  reason: string;
};

export type RerankResult =
  | { ok: true; videos: RerankedVideo[] }
  | { ok: false; reason: "no_profile" | "empty_catalog" | "no_videos" | "llm_failed" | "quota_exceeded" };

function dominantLabel(categories: Record<string, number>): string {
  const e = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  return e ? categoryLabel(e[0]) : "";
}

export async function rerankedVideosForUser(userId: string): Promise<RerankResult> {
  const [profile, rec] = await Promise.all([
    getProfile(userId),
    recommendForUser(userId, { limit: 24, maxPerCluster: 5 }),
  ]);

  if (!profile) return { ok: false, reason: "no_profile" };
  if (!rec.ok) return { ok: false, reason: rec.reason === "empty_catalog" ? "empty_catalog" : "no_profile" };

  const topChannels = rec.recommendations.slice(0, CHANNEL_FANOUT);
  const recentMap = await getRecentVideosBatch(topChannels.map((r) => r.channel.id), PER_CHANNEL);

  // 싫어요한 영상은 후보에서 제외(다시 추천되지 않게).
  const disliked = new Set(profile.dislikedVideoIds);

  // 후보 풀 — 채널별 메타와 함께. videoId 중복 제거.
  const meta = new Map<string, RerankedVideo>();
  const candidates: VideoCandidate[] = [];
  for (const r of topChannels) {
    const label = dominantLabel(r.channel.categories);
    let perCh = 0;
    for (const v of recentMap.get(r.channel.id) ?? []) {
      if (perCh >= POOL_PER_CHANNEL) break;
      if (disliked.has(v.videoId) || meta.has(v.videoId)) continue;
      perCh++;
      meta.set(v.videoId, {
        videoId: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail,
        channelId: r.channel.id,
        channelName: r.channel.title,
        reason: "",
      });
      candidates.push({ videoId: v.videoId, title: v.title, channelName: r.channel.title, category: label });
      if (candidates.length >= POOL_CAP) break;
    }
    if (candidates.length >= POOL_CAP) break;
  }
  if (candidates.length === 0) return { ok: false, reason: "no_videos" };

  // 좋아요/싫어요 채널 이름 해석 (취향 신호) — 소수 id 만 조회.
  const fbIds = [...profile.likedChannelIds, ...profile.dislikedChannelIds];
  const nameById = new Map<string, string>();
  if (fbIds.length) {
    const rows = await prisma.channel.findMany({ where: { id: { in: fbIds } }, select: { id: true, title: true } });
    for (const c of rows) nameById.set(c.id, c.title);
  }
  const likedNames = profile.likedChannelIds.map((id) => nameById.get(id)).filter(Boolean) as string[];
  const dislikedNames = profile.dislikedChannelIds.map((id) => nameById.get(id)).filter(Boolean) as string[];

  let ranked;
  try {
    ranked = await rerankVideos(
      {
        categories: profile.categories,
        topKeywords: profile.topKeywords,
        summary: profile.summaryText,
        likedNames,
        dislikedNames,
      },
      candidates,
      TOP_N,
    );
  } catch (e) {
    if (e instanceof LlmQuotaError) return { ok: false, reason: "quota_exceeded" };
    throw e;
  }
  if (!ranked) return { ok: false, reason: "llm_failed" };

  const videos = ranked
    .map(({ videoId, reason }) => {
      const m = meta.get(videoId);
      return m ? { ...m, reason } : null;
    })
    .filter(Boolean) as RerankedVideo[];

  return videos.length ? { ok: true, videos } : { ok: false, reason: "llm_failed" };
}

// /compare — 두 사람이 "둘 다 좋아할" 영상 재랭킹.
// 후보 풀: 양쪽 추천 교집합 채널 + 공통 관심 채널의 최근 영상.
export async function rerankedSharedVideosForPair(aId: string, bId: string): Promise<RerankResult> {
  const [a, b] = await Promise.all([getProfileWithOwner(aId), getProfileWithOwner(bId)]);
  if (!a || !b) return { ok: false, reason: "no_profile" };

  const [recA, recB] = await Promise.all([
    recommendForUser(aId, { limit: 50, maxPerCluster: 8 }),
    recommendForUser(bId, { limit: 50, maxPerCluster: 8 }),
  ]);

  // 풀 채널: 양쪽 추천 교집합(전체 메타 보유) + 공통 top 채널.
  const poolCh = new Map<string, { id: string; title: string; categories: Record<string, number> }>();
  if (recA.ok && recB.ok) {
    const recBIds = new Set(recB.recommendations.map((r) => r.channel.id));
    for (const r of recA.recommendations) {
      if (recBIds.has(r.channel.id)) {
        poolCh.set(r.channel.id, { id: r.channel.id, title: r.channel.title, categories: r.channel.categories });
      }
    }
  }
  const bIds = new Set<string>([...b.profile.topChannels.map((c) => c.id), ...b.profile.subscribedChannelIds]);
  for (const c of a.profile.topChannels) {
    if (bIds.has(c.id) && !poolCh.has(c.id)) poolCh.set(c.id, { id: c.id, title: c.name, categories: {} });
  }
  const channels = [...poolCh.values()].slice(0, CHANNEL_FANOUT);
  if (channels.length === 0) return { ok: false, reason: "no_videos" };

  const recentMap = await getRecentVideosBatch(channels.map((c) => c.id), PER_CHANNEL);
  const meta = new Map<string, RerankedVideo>();
  const candidates: VideoCandidate[] = [];
  for (const ch of channels) {
    const label = dominantLabel(ch.categories);
    let perCh = 0;
    for (const v of recentMap.get(ch.id) ?? []) {
      if (perCh >= POOL_PER_CHANNEL) break;
      if (meta.has(v.videoId)) continue;
      perCh++;
      meta.set(v.videoId, {
        videoId: v.videoId, title: v.title, thumbnail: v.thumbnail,
        channelId: ch.id, channelName: ch.title, reason: "",
      });
      candidates.push({ videoId: v.videoId, title: v.title, channelName: ch.title, category: label });
      if (candidates.length >= POOL_CAP) break;
    }
    if (candidates.length >= POOL_CAP) break;
  }
  if (candidates.length === 0) return { ok: false, reason: "no_videos" };

  let ranked;
  try {
    ranked = await rerankSharedVideos(
      { name: a.owner.name, categories: a.profile.categories, topKeywords: a.profile.topKeywords },
      { name: b.owner.name, categories: b.profile.categories, topKeywords: b.profile.topKeywords },
      candidates,
      12,
    );
  } catch (e) {
    if (e instanceof LlmQuotaError) return { ok: false, reason: "quota_exceeded" };
    throw e;
  }
  if (!ranked) return { ok: false, reason: "llm_failed" };

  const videos = ranked
    .map(({ videoId, reason }) => {
      const m = meta.get(videoId);
      return m ? { ...m, reason } : null;
    })
    .filter(Boolean) as RerankedVideo[];

  return videos.length ? { ok: true, videos } : { ok: false, reason: "llm_failed" };
}
