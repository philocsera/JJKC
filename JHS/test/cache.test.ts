import { test } from "node:test";
import assert from "node:assert/strict";

import { MemoryCacheStore } from "../src/cache/memory-store.ts";
import { CACHE_TTL, cacheKey } from "../src/cache/keys.ts";

test("MemoryCacheStore round-trips a value", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("k", { a: 1 }, 60);
  assert.deepEqual(await cache.get<{ a: number }>("k"), { a: 1 });
});

test("MemoryCacheStore expires entries past TTL", async () => {
  let nowMs = 1_000_000;
  const cache = new MemoryCacheStore(() => nowMs);
  await cache.set("k", "v", 1);
  assert.equal(await cache.get<string>("k"), "v");
  nowMs += 2_000;
  assert.equal(await cache.get<string>("k"), null);
});

test("cache key builders are stable and namespaced", () => {
  assert.equal(cacheKey.channelUploads("UC123"), "yt:channel:UC123:uploads");
  assert.equal(cacheKey.keywordSearch("LoFi"), "yt:search:lofi");
  assert.equal(cacheKey.popularByCategory("28"), "yt:popular:28");
  assert.equal(cacheKey.feed("u1", 7), "feed:u1:v7");
});

test("CACHE_TTL search > popular > channel > feed (priority of cost saving)", () => {
  assert.ok(CACHE_TTL.keywordSearch > CACHE_TTL.popularByCategory);
  assert.ok(CACHE_TTL.popularByCategory > CACHE_TTL.channelUploads);
  assert.ok(CACHE_TTL.channelUploads > CACHE_TTL.feed);
});
