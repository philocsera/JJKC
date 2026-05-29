// channel_analyze_plan §1: Channel / ChannelCluster DB I/O.
// AlgoProfile 와 동일하게 JSON 필드를 String 으로 저장 — 여기서 pack/unpack.
// viewCount 는 BigInt 컬럼이라 read 시 Number 로, write 시 BigInt 로 변환한다.

import { prisma } from "./prisma";
import type {
  CategoryDist,
  ChannelMetrics,
  ChannelRecord,
  ClusterRecord,
} from "./types";
import type { ChannelFeatures } from "./channel-features";

const safeParse = <T,>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const DEFAULT_METRICS: ChannelMetrics = {
  mainstreamScore: 0,
  nicheScore: 0,
  uploadsPerMonth: 0,
};

type DbChannel = {
  id: string;
  title: string;
  handle: string | null;
  thumbnail: string;
  description: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: bigint;
  country: string | null;
  isKorean: boolean;
  categories: string;
  subCategories: string;
  keywords: string;
  metrics: string | null;
  clusterId: number | null;
  source: string;
  similarChannelIds?: string;
};

export function unpackChannel(c: DbChannel): ChannelRecord {
  return {
    id: c.id,
    title: c.title,
    handle: c.handle,
    thumbnail: c.thumbnail,
    description: c.description,
    subscriberCount: c.subscriberCount,
    videoCount: c.videoCount,
    viewCount: Number(c.viewCount),
    country: c.country,
    isKorean: c.isKorean,
    categories: safeParse<CategoryDist>(c.categories, {}),
    subCategories: safeParse<CategoryDist>(c.subCategories, {}),
    keywords: safeParse<string[]>(c.keywords, []),
    metrics: safeParse<ChannelMetrics>(c.metrics, DEFAULT_METRICS),
    clusterId: c.clusterId,
    source: c.source,
    similarChannelIds: safeParse<{ id: string; score: number }[]>(c.similarChannelIds ?? "[]", []),
  };
}

type DbCluster = {
  id: number;
  label: string;
  centroid: string;
  topCategories: string;
  topKeywords: string;
  size: number;
  color: string | null;
};

export function unpackCluster(c: DbCluster): ClusterRecord {
  return {
    id: c.id,
    label: c.label,
    centroid: safeParse<CategoryDist>(c.centroid, {}),
    topCategories: safeParse<{ name: string; weight: number }[]>(c.topCategories, []),
    topKeywords: safeParse<string[]>(c.topKeywords, []),
    size: c.size,
    color: c.color,
  };
}

// ── 수집 단계 write ────────────────────────────────────────────
export async function upsertChannel(f: ChannelFeatures, source: string) {
  const data = {
    title: f.title,
    handle: f.handle,
    thumbnail: f.thumbnail,
    description: f.description,
    subscriberCount: f.subscriberCount,
    videoCount: f.videoCount,
    viewCount: BigInt(Math.max(0, Math.round(f.viewCount))),
    country: f.country,
    isKorean: f.isKorean,
    categories: JSON.stringify(f.categories),
    subCategories: JSON.stringify(f.subCategories ?? {}),
    keywords: JSON.stringify(f.keywords),
    metrics: JSON.stringify(f.metrics),
    source,
  };
  return prisma.channel.upsert({
    where: { id: f.id },
    update: data,
    create: { id: f.id, ...data },
  });
}

export async function countChannels(onlyKorean = true): Promise<number> {
  return prisma.channel.count({
    where: onlyKorean ? { isKorean: true } : {},
  });
}

// ── 읽기 (clustering / recommend / API) ────────────────────────
export async function listAllChannels(
  opts: { onlyKorean?: boolean; minSubs?: number } = {},
): Promise<ChannelRecord[]> {
  const rows = await prisma.channel.findMany({
    where: {
      ...(opts.onlyKorean !== false ? { isKorean: true } : {}),
      ...(opts.minSubs ? { subscriberCount: { gte: opts.minSubs } } : {}),
    },
  });
  return rows.map((r) => unpackChannel(r as DbChannel));
}

// onboard 폼이 고른 채널들을 한 번에 로드. 입력 순서(사용자 선택 순서)를 보존한다.
export async function getChannelsByIds(ids: string[]): Promise<ChannelRecord[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.channel.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, unpackChannel(r as DbChannel)]));
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is ChannelRecord => Boolean(c));
}

// 사전계산된 유사 채널을 레코드로 — 한 채널의 "비슷한 채널" 목록(점수 순).
export async function getSimilarChannels(channelId: string, limit = 8): Promise<ChannelRecord[]> {
  const row = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!row) return [];
  const sims = safeParse<{ id: string; score: number }[]>(
    (row as DbChannel).similarChannelIds ?? "[]",
    [],
  ).slice(0, limit);
  if (sims.length === 0) return [];
  const byId = await getChannelsByIds(sims.map((s) => s.id));
  const map = new Map(byId.map((c) => [c.id, c]));
  return sims.map((s) => map.get(s.id)).filter((c): c is ChannelRecord => Boolean(c));
}

export async function listClusters(): Promise<ClusterRecord[]> {
  const rows = await prisma.channelCluster.findMany({ orderBy: { size: "desc" } });
  return rows.map((r) => unpackCluster(r as DbCluster));
}

export async function getClusterWithChannels(
  id: number,
  limit = 60,
): Promise<{ cluster: ClusterRecord; channels: ChannelRecord[] } | null> {
  const row = await prisma.channelCluster.findUnique({ where: { id } });
  if (!row) return null;
  const channels = await prisma.channel.findMany({
    where: { clusterId: id },
    orderBy: { subscriberCount: "desc" },
    take: limit,
  });
  return {
    cluster: unpackCluster(row as DbCluster),
    channels: channels.map((c) => unpackChannel(c as DbChannel)),
  };
}

// ── 클러스터링 단계 write ──────────────────────────────────────
export type ClusterWrite = {
  label: string;
  centroid: CategoryDist;
  topCategories: { name: string; weight: number }[];
  topKeywords: string[];
  size: number;
  color?: string;
  memberIds: string[];
};

// 전체 재클러스터: 기존 클러스터/배정을 비우고 새로 만든다 (멱등).
export async function replaceClusters(clusters: ClusterWrite[]) {
  await prisma.$transaction(async (tx) => {
    await tx.channel.updateMany({ data: { clusterId: null } });
    await tx.channelCluster.deleteMany({});
    for (const c of clusters) {
      const created = await tx.channelCluster.create({
        data: {
          label: c.label,
          centroid: JSON.stringify(c.centroid),
          topCategories: JSON.stringify(c.topCategories),
          topKeywords: JSON.stringify(c.topKeywords),
          size: c.size,
          color: c.color ?? null,
        },
      });
      // SQLite 는 updateMany IN 절 길이에 민감하지 않지만 안전하게 청크.
      const ids = c.memberIds;
      for (let i = 0; i < ids.length; i += 200) {
        await tx.channel.updateMany({
          where: { id: { in: ids.slice(i, i + 200) } },
          data: { clusterId: created.id },
        });
      }
    }
  });
}
