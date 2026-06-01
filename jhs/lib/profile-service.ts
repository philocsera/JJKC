// AlgoProfile DB I/O. SQLite 에서는 JSON 필드를 String 으로 저장하므로
// 여기서 parse/stringify 를 책임진다.

import { prisma } from "./prisma";
import type {
  AlgoProfileShape,
  CategoryDist,
  ProfileMetrics,
  PublicUser,
  TopChannel,
} from "./types";
import type { ProfileResult } from "./profiler";

const safeParse = <T,>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const DEFAULT_METRICS: ProfileMetrics = {
  diversity: 0,
  concentration: 0,
  shortsRatio: 0,
  longFormRatio: 0,
  languageDistribution: {},
  primaryLanguage: null,
  mainstreamScore: 0,
  nicheChannelScore: 0,
};

type DbProfile = {
  userId: string;
  categories: string;
  subCategories?: string | null;
  topChannels: string;
  topKeywords: string;
  sampleVideoIds: string;
  metrics: string | null;
  subscribedChannelIds?: string | null;
  likedChannelIds?: string | null;
  dislikedChannelIds?: string | null;
  likedVideoIds?: string | null;
  dislikedVideoIds?: string | null;
  shownVideoIds?: string | null;
  summaryText?: string | null;
  lastSyncedAt: Date;
};

function unpack(p: DbProfile): AlgoProfileShape {
  return {
    userId: p.userId,
    categories: safeParse<CategoryDist>(p.categories, {}),
    subCategories: safeParse<CategoryDist>(p.subCategories, {}),
    topChannels: safeParse<TopChannel[]>(p.topChannels, []),
    topKeywords: safeParse<string[]>(p.topKeywords, []),
    sampleVideoIds: safeParse<string[]>(p.sampleVideoIds, []),
    metrics: safeParse<ProfileMetrics>(p.metrics, DEFAULT_METRICS),
    subscribedChannelIds: safeParse<string[]>(p.subscribedChannelIds, []),
    likedChannelIds: safeParse<string[]>(p.likedChannelIds, []),
    dislikedChannelIds: safeParse<string[]>(p.dislikedChannelIds, []),
    likedVideoIds: safeParse<string[]>(p.likedVideoIds, []),
    dislikedVideoIds: safeParse<string[]>(p.dislikedVideoIds, []),
    shownVideoIds: safeParse<string[]>(p.shownVideoIds, []),
    summaryText: p.summaryText ?? "",
    lastSyncedAt: p.lastSyncedAt.toISOString(),
  };
}

// 프로필 페르소나 요약(LLM) 생성 후 저장. 생성 텍스트 반환(키 없거나 실패 시 null).
export async function generateAndStoreProfileSummary(userId: string): Promise<string | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;
  const { generateProfileSummary } = await import("./llm-features");
  const text = await generateProfileSummary(profile);
  if (!text) return null;
  await prisma.algoProfile.update({
    where: { userId },
    data: { summaryText: text },
  });
  return text;
}

// 추천 화면 좋아요/싫어요 — 채널 id 를 liked/disliked 목록에 추가(멱등).
export async function addLikedChannel(userId: string, channelId: string) {
  const row = await prisma.algoProfile.findUnique({
    where: { userId },
    select: { likedChannelIds: true },
  });
  if (!row) return;
  const liked = safeParse<string[]>(row.likedChannelIds, []);
  if (liked.includes(channelId)) return;
  await prisma.algoProfile.update({
    where: { userId },
    data: { likedChannelIds: JSON.stringify([...liked, channelId]) },
  });
}

export async function addDislikedChannel(userId: string, channelId: string) {
  const row = await prisma.algoProfile.findUnique({
    where: { userId },
    select: { dislikedChannelIds: true },
  });
  if (!row) return;
  const disliked = safeParse<string[]>(row.dislikedChannelIds, []);
  if (disliked.includes(channelId)) return;
  await prisma.algoProfile.update({
    where: { userId },
    data: { dislikedChannelIds: JSON.stringify([...disliked, channelId]) },
  });
}

// /discover 영상 좋아요/싫어요(영상 단위). like↔dislike 는 상호배타 — 한쪽에 넣으면 다른쪽서 제거.
// 좋아요 시 channelId → likedChannelIds(추천에서 제외, 이미 아는 채널).
// 싫어요 시 channelId → dislikedChannelIds(채널째 추천에서 제외 + 관련 채널까지 제외).
// 반환: 채널 목록(liked/disliked)이 바뀌었는지 — true 면 호출부가 카테고리 벡터를 재계산.
export async function setVideoFeedback(
  userId: string,
  videoId: string,
  action: "like" | "dislike",
  channelId?: string,
): Promise<boolean> {
  const row = await prisma.algoProfile.findUnique({
    where: { userId },
    select: { likedVideoIds: true, dislikedVideoIds: true, likedChannelIds: true, dislikedChannelIds: true },
  });
  if (!row) return false;
  const liked = new Set(safeParse<string[]>(row.likedVideoIds, []));
  const disliked = new Set(safeParse<string[]>(row.dislikedVideoIds, []));
  liked.delete(videoId);
  disliked.delete(videoId);
  if (action === "like") liked.add(videoId);
  else disliked.add(videoId);

  const data: {
    likedVideoIds: string;
    dislikedVideoIds: string;
    likedChannelIds?: string;
    dislikedChannelIds?: string;
  } = {
    likedVideoIds: JSON.stringify([...liked]),
    dislikedVideoIds: JSON.stringify([...disliked]),
  };
  // 채널 신호는 liked/disliked 상호배타 — 한쪽에 넣으면 반대쪽에서 제거(한 채널이 양쪽에
  // 동시에 들어가는 정합성 문제 방지).
  let channelsChanged = false;
  if (channelId) {
    const likedCh = safeParse<string[]>(row.likedChannelIds, []);
    const dislikedCh = safeParse<string[]>(row.dislikedChannelIds, []);
    const inLiked = likedCh.includes(channelId);
    const inDisliked = dislikedCh.includes(channelId);
    if (action === "like" && (!inLiked || inDisliked)) {
      // 좋아요한 영상의 채널을 "좋아하는 채널"로 등록(이미 아는 채널 → 추천에서 제외).
      if (!inLiked) data.likedChannelIds = JSON.stringify([...likedCh, channelId]);
      if (inDisliked) data.dislikedChannelIds = JSON.stringify(dislikedCh.filter((id) => id !== channelId));
      channelsChanged = true;
    } else if (action === "dislike" && (!inDisliked || inLiked)) {
      // 싫어요한 영상의 채널을 통째로 dislikedChannelIds 에 등록 → 추천에서 강하게 배제.
      if (!inDisliked) data.dislikedChannelIds = JSON.stringify([...dislikedCh, channelId]);
      if (inLiked) data.likedChannelIds = JSON.stringify(likedCh.filter((id) => id !== channelId));
      channelsChanged = true;
    }
  }
  await prisma.algoProfile.update({ where: { userId }, data });
  return channelsChanged;
}

// /discover 에서 방금 보여준 영상 id 들을 기록(최근 MAX 개만 유지, FIFO).
// 다음 재랭킹 때 후보에서 제외돼 반응 없던 영상이 그대로 다시 나오지 않게 한다.
const SHOWN_MAX = 300;
export async function recordShownVideos(userId: string, videoIds: string[]): Promise<void> {
  if (videoIds.length === 0) return;
  const row = await prisma.algoProfile.findUnique({
    where: { userId },
    select: { shownVideoIds: true },
  });
  if (!row) return;
  const prev = safeParse<string[]>(row.shownVideoIds, []);
  // 새 id 를 뒤에 붙이고 중복 제거 — 같은 id 는 "마지막(최신) 위치"를 남긴다(뒤에서부터 스캔).
  // 그래야 마지막 원소가 항상 가장 최근 보여준 영상이 되고(캐시 시그니처용), 상한 슬라이스도 정확.
  const merged = [...prev, ...videoIds];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (let i = merged.length - 1; i >= 0; i--) {
    if (seen.has(merged[i])) continue;
    seen.add(merged[i]);
    deduped.push(merged[i]);
  }
  deduped.reverse();
  const kept = deduped.slice(Math.max(0, deduped.length - SHOWN_MAX));
  await prisma.algoProfile.update({
    where: { userId },
    data: { shownVideoIds: JSON.stringify(kept) },
  });
}

export async function getProfile(userId: string): Promise<AlgoProfileShape | null> {
  const row = await prisma.algoProfile.findUnique({ where: { userId } });
  return row ? unpack(row) : null;
}

export async function getProfileWithOwner(userId: string) {
  const row = await prisma.algoProfile.findUnique({
    where: { userId },
    include: { user: true },
  });
  if (!row) return null;
  const owner: PublicUser = {
    id: row.user.id,
    name: row.user.name ?? row.user.email ?? "Anonymous",
    image: row.user.image,
    email: row.user.email,
    isPublic: row.user.isPublic,
  };
  return { owner, profile: unpack(row) };
}

export async function saveProfile(
  userId: string,
  result: ProfileResult,
  subscribedChannelIds?: string[],
) {
  const data = {
    categories: JSON.stringify(result.categories),
    subCategories: JSON.stringify(result.subCategories ?? {}),
    topChannels: JSON.stringify(result.topChannels),
    topKeywords: JSON.stringify(result.topKeywords),
    sampleVideoIds: JSON.stringify(result.sampleVideoIds),
    metrics: JSON.stringify(result.metrics),
    // channel_analyze_plan §1: 추천에서 이미 구독한 채널 제외용.
    ...(subscribedChannelIds
      ? { subscribedChannelIds: JSON.stringify(subscribedChannelIds) }
      : {}),
  };
  return prisma.algoProfile.upsert({
    where: { userId },
    update: { ...data, lastSyncedAt: new Date() },
    create: { userId, ...data },
  });
}

export async function listPublic({
  cursor,
  limit,
}: {
  cursor?: string;
  limit: number;
}): Promise<{
  items: { owner: PublicUser; profile: AlgoProfileShape }[];
  nextCursor: string | null;
}> {
  const rows = await prisma.algoProfile.findMany({
    include: { user: true },
    orderBy: { lastSyncedAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
  const sliced = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? sliced[sliced.length - 1].id : null;
  return {
    items: sliced.map((row) => ({
      owner: {
        id: row.user.id,
        name: row.user.name ?? row.user.email ?? "Anonymous",
        image: row.user.image,
        email: row.user.email,
        isPublic: row.user.isPublic,
      },
      profile: unpack(row),
    })),
    nextCursor,
  };
}
