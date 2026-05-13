import type { FeedRatios, Video } from "../types.ts";

export const DEFAULT_RATIOS: FeedRatios = {
  channel: 0.3,
  keyword: 0.4,
  category: 0.3,
};

export function dedupeByVideoId<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export type Bucket<T> = { items: T[]; ratio: number };

// Phase2.md §8.1: 셔플 대신 라운드 로빈으로 다양성 보장.
// 한 그룹이 모자라면 다른 그룹에서 보충하여 total 에 최대한 근접하게 채운다.
export function interleaveByRatio<T>(total: number, buckets: Bucket<T>[]): T[] {
  if (total <= 0) return [];

  const sumRatio = buckets.reduce((s, b) => s + b.ratio, 0) || 1;

  const heads = buckets.map((b) => ({
    items: b.items.slice(),
    cursor: 0,
    target: Math.max(0, Math.round((total * b.ratio) / sumRatio)),
  }));

  // 라운드 로빈으로 한 사이클당 각 그룹에서 1개씩 (target 까지).
  const out: T[] = [];
  let progressed = true;
  while (out.length < total && progressed) {
    progressed = false;
    for (const h of heads) {
      if (out.length >= total) break;
      if (h.cursor >= h.items.length) continue;
      if (h.cursor >= h.target) continue;
      const item = h.items[h.cursor];
      if (item === undefined) continue;
      out.push(item);
      h.cursor++;
      progressed = true;
    }
  }

  // 부족분은 남은 항목으로 채움 (target 무시).
  if (out.length < total) {
    for (const h of heads) {
      while (out.length < total && h.cursor < h.items.length) {
        const item = h.items[h.cursor];
        if (item !== undefined) out.push(item);
        h.cursor++;
      }
    }
  }

  return out;
}

// 시드 기반 결정론적 셔플 (Mulberry32). 같은 (seed, items) 입력엔 같은 출력.
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const rng = mulberry32(hashSeed(seed));
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

// shuffleForToday: 사용자별 + 날짜별로 안정적인 순서. 다음 날 자동으로 재셔플.
export function shuffleForToday<T>(
  items: T[],
  userId: string,
  today: string,
): T[] {
  return seededShuffle(items, `${userId}|${today}`);
}

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 외부에서 Video 외 다른 타입에도 쓸 수 있게 generic 그대로 유지.
export type { Video };
