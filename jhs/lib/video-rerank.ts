// /discover 영상 재랭킹 오케스트레이션.
// 추천 채널 → 각 채널 RSS 최근 영상으로 후보 풀 구성 → LLM 이 사용자 취향에 맞는 순으로
// top-N 선별(이유 포함). YouTube API 호출 0 (RSS, 캐시). API 라우트에서 캐시로 감싼다.

import { prisma } from "./prisma";
import { recommendForUser } from "./channel-recommender";
import { getRecentVideosBatch } from "./recent-videos";
import { getProfile } from "./profile-service";
import { categoryLabel } from "./categories";
import { rerankVideos, type VideoCandidate } from "./llm-features";

const CHANNEL_FANOUT = 18;   // 후보 영상을 모을 추천 상위 채널 수
const PER_CHANNEL = 8;       // 채널당 가져올 최근 영상 수(RSS)
const POOL_PER_CHANNEL = 3;  // 후보 풀에 넣을 채널당 상한 — 한 채널 쏠림 방지(다양성)
const POOL_CAP = 150;        // LLM 프롬프트에 넣을 후보 영상 상한
const TOP_N = 15;            // 최종 노출 영상 수

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
  | { ok: false; reason: "no_profile" | "empty_catalog" | "no_videos" | "llm_failed" };

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

  const ranked = await rerankVideos(
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
  if (!ranked) return { ok: false, reason: "llm_failed" };

  const videos = ranked
    .map(({ videoId, reason }) => {
      const m = meta.get(videoId);
      return m ? { ...m, reason } : null;
    })
    .filter(Boolean) as RerankedVideo[];

  return videos.length ? { ok: true, videos } : { ok: false, reason: "llm_failed" };
}
