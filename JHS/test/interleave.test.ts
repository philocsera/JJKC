import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RATIOS,
  dedupeByVideoId,
  interleaveByRatio,
  seededShuffle,
  shuffleForToday,
} from "../src/feed/interleave.ts";

const v = (id: string, source: "channel" | "keyword" | "category" = "channel") => ({
  id,
  title: id,
  channelId: "c",
  channelName: "c",
  thumbnailUrl: "",
  publishedAt: "",
  source,
});

test("interleaveByRatio respects 30/40/30 when supply is sufficient", () => {
  const channel = Array.from({ length: 20 }, (_, i) => v(`ch_${i}`, "channel"));
  const keyword = Array.from({ length: 20 }, (_, i) => v(`kw_${i}`, "keyword"));
  const category = Array.from({ length: 20 }, (_, i) => v(`ca_${i}`, "category"));

  const out = interleaveByRatio(20, [
    { items: channel, ratio: DEFAULT_RATIOS.channel },
    { items: keyword, ratio: DEFAULT_RATIOS.keyword },
    { items: category, ratio: DEFAULT_RATIOS.category },
  ]);

  assert.equal(out.length, 20);

  const count = (s: string) => out.filter((x) => x.source === s).length;
  // round(20 * 0.3) = 6, round(20 * 0.4) = 8, round(20 * 0.3) = 6 → 20.
  assert.equal(count("channel"), 6);
  assert.equal(count("keyword"), 8);
  assert.equal(count("category"), 6);
});

test("interleaveByRatio backfills from other buckets when one is short", () => {
  const channel = [v("only_one", "channel")];
  const keyword = Array.from({ length: 30 }, (_, i) => v(`kw_${i}`, "keyword"));
  const category = Array.from({ length: 30 }, (_, i) => v(`ca_${i}`, "category"));

  const out = interleaveByRatio(18, [
    { items: channel, ratio: 0.3 },
    { items: keyword, ratio: 0.4 },
    { items: category, ratio: 0.3 },
  ]);

  assert.equal(out.length, 18);
  assert.equal(out.filter((x) => x.source === "channel").length, 1);
});

test("dedupeByVideoId preserves first occurrence", () => {
  const arr = [v("a"), v("b"), v("a"), v("c"), v("b")];
  const out = dedupeByVideoId(arr);
  assert.deepEqual(out.map((x) => x.id), ["a", "b", "c"]);
});

test("seededShuffle is deterministic for the same seed", () => {
  const arr = Array.from({ length: 10 }, (_, i) => v(`v${i}`));
  const a = seededShuffle(arr, "seed-1");
  const b = seededShuffle(arr, "seed-1");
  const c = seededShuffle(arr, "seed-2");
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  // length 보존, 원소 보존.
  assert.equal(a.length, arr.length);
  const ids = new Set(a.map((x) => x.id));
  for (const x of arr) assert.ok(ids.has(x.id));
});

test("shuffleForToday changes when day changes", () => {
  const arr = Array.from({ length: 10 }, (_, i) => v(`v${i}`));
  const today = shuffleForToday(arr, "user_a", "2026-05-13");
  const tomorrow = shuffleForToday(arr, "user_a", "2026-05-14");
  assert.notDeepEqual(today, tomorrow);
});
