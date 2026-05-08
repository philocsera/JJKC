// Build a per-profile feed by combining channel / keyword / category
// sources at the ratios specified in plan.md §Step 7.

import { getVideoPool } from "./mock-data";
import type { Video } from "./types";

export type FeedRatios = {
  channel: number;
  keyword: number;
  category: number;
};

export const DEFAULT_RATIOS: FeedRatios = {
  channel: 0.3,
  keyword: 0.4,
  category: 0.3,
};

// Deterministic pseudo-shuffle keyed off the user id, so a given visitor
// sees a stable ordering across reloads (real product would seed by
// session + day).
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 9301 + 49297) % 233280;
    const j = Math.abs(h) % (i + 1);
    [out[i]!, out[j]!] = [out[j]!, out[i]!];
  }
  return out;
}

export function buildFeed(
  userId: string,
  total = 18,
  ratios: FeedRatios = DEFAULT_RATIOS,
): Video[] {
  const pool = getVideoPool(userId);

  const targets = {
    channel: Math.round(total * ratios.channel),
    keyword: Math.round(total * ratios.keyword),
    category: Math.round(total * ratios.category),
  };

  const pick = (src: Video["source"], n: number): Video[] =>
    seededShuffle(
      pool.filter((v) => v.source === src),
      `${userId}|${src}`,
    ).slice(0, n);

  const merged = [
    ...pick("channel", targets.channel),
    ...pick("keyword", targets.keyword),
    ...pick("category", targets.category),
  ];

  // Dedupe (paranoid — pool already keys ids per source).
  const seen = new Set<string>();
  const deduped = merged.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });

  return seededShuffle(deduped, `${userId}|interleave`);
}
