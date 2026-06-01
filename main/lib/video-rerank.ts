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

// 채널당 1개 규칙을 엄격히 지키려면 "신선한 영상이 있는 서로 다른 채널"이 TOP_N 개 이상
// 필요하다. RSS 수율(특히 프로덕션)이 낮으므로 채널 풀을 넉넉히(FANOUT) 잡아 확보한다.
const CHANNEL_FANOUT = 60;     // 후보를 모을 추천 상위 채널 수 — RSS 실패분 감안해 크게
const PER_CHANNEL = 12;        // 채널당 가져올 최근 영상 수 — 안 본 영상 1개 확보용 버퍼(fetch 비용 동일)
const RSS_CONCURRENCY = 15;    // RSS 동시 요청 수 — 너무 적으면 영상 있는 채널이 적게 잡힘
const POOL_PER_CHANNEL = 1;    // (compare 전용) 후보 풀 채널당 상한
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

export async function rerankedVideosForUser(
  userId: string,
  opts: { excludeVideoIds?: ReadonlySet<string> } = {},
): Promise<RerankResult> {
  const [profile, rec] = await Promise.all([
    getProfile(userId),
    recommendForUser(userId, { limit: CHANNEL_FANOUT, maxPerCluster: 8 }),
  ]);

  if (!profile) return { ok: false, reason: "no_profile" };
  if (!rec.ok) return { ok: false, reason: rec.reason === "empty_catalog" ? "empty_catalog" : "no_profile" };

  const topChannels = rec.recommendations.slice(0, CHANNEL_FANOUT);
  const recentMap = await getRecentVideosBatch(
    topChannels.map((r) => r.channel.id),
    PER_CHANNEL,
    RSS_CONCURRENCY,
  );

  // 후보에서 뺄 영상 = 싫어요 영상 + 이미 보여준 영상(shown, 호출부가 전달).
  // → 반응(좋아요/싫어요) 없던 영상을 그대로 재노출하지 않고 다른 영상으로 교체한다.
  // (싫어요한 영상의 "채널"은 dislikedChannelIds 로 recommendForUser 단계에서 이미 제외됨.)
  const exclude = new Set<string>(profile.dislikedVideoIds);
  if (opts.excludeVideoIds) for (const id of opts.excludeVideoIds) exclude.add(id);

  // 채널별 "안 본" 최근 영상 큐(최신순 유지).
  const queues = topChannels.map((r) => ({
    channel: r.channel,
    label: dominantLabel(r.channel.categories),
    vids: (recentMap.get(r.channel.id) ?? []).filter((v) => !exclude.has(v.videoId)),
  }));

  // 채널당 1개(엄격) — 각 채널의 '안 본' 가장 최근 영상 하나만 후보로 넣는다.
  // 후보가 곧 "서로 다른 채널" 목록이므로, LLM 이 무엇을 고르든 채널 중복이 생기지 않는다.
  // 채널 풀(FANOUT)을 크게 잡았으므로 보통 TOP_N(15)개 이상의 서로 다른 채널이 모인다.
  const meta = new Map<string, RerankedVideo>();
  const candidates: VideoCandidate[] = [];
  for (const q of queues) {
    if (candidates.length >= POOL_CAP) break;
    const v = q.vids.find((x) => !meta.has(x.videoId)); // 다른 채널과 겹치지 않는 첫(최신) 영상
    if (!v) continue;
    meta.set(v.videoId, {
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail,
      channelId: q.channel.id,
      channelName: q.channel.title,
      reason: "",
    });
    candidates.push({ videoId: v.videoId, title: v.title, channelName: q.channel.title, category: q.label });
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

  // LLM 관련성 순으로 복원. 후보가 이미 채널당 1개라 중복은 없지만, 안전망으로
  // 채널 중복을 한 번 더 제거한다(엄격: 한 채널당 최대 1개).
  const seenCh = new Set<string>();
  const videos: RerankedVideo[] = [];
  for (const { videoId, reason } of ranked) {
    const m = meta.get(videoId);
    if (!m || seenCh.has(m.channelId)) continue;
    seenCh.add(m.channelId);
    videos.push({ ...m, reason });
    if (videos.length >= TOP_N) break;
  }

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
