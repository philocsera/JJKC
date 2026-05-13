import { test } from "node:test";
import assert from "node:assert/strict";

import { buildFeed } from "../src/feed/builder.ts";
import { MemoryCacheStore } from "../src/cache/memory-store.ts";
import {
  FakeYouTubeClient,
  FixedClock,
  InMemoryProfileRepo,
  makeProfileFixture,
} from "./helpers/fakes.ts";

const clock = new FixedClock(new Date("2026-05-13T12:00:00.000Z"));

function setup() {
  return {
    profileRepo: new InMemoryProfileRepo([
      makeProfileFixture("u_public", { isPublic: true }),
      makeProfileFixture("u_private", { isPublic: false }),
    ]),
    youtube: new FakeYouTubeClient(),
    cache: new MemoryCacheStore(),
    clock,
  };
}

test("buildFeed returns 18 videos for a public profile", async () => {
  const deps = setup();
  const r = await buildFeed(deps, "u_public");
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.videos.length, 18);
  assert.equal(r.cacheHit, false);
});

test("buildFeed refuses private profiles with reason='private'", async () => {
  const deps = setup();
  const r = await buildFeed(deps, "u_private");
  assert.deepEqual(r, { ok: false, reason: "private" });
});

test("buildFeed returns not_found for unknown user", async () => {
  const deps = setup();
  const r = await buildFeed(deps, "u_nope");
  assert.deepEqual(r, { ok: false, reason: "not_found" });
});

test("buildFeed second call hits cache and skips YouTube", async () => {
  const deps = setup();

  const first = await buildFeed(deps, "u_public");
  assert.ok(first.ok && !first.cacheHit);

  const channelBefore = deps.youtube.channelCalls;
  const searchBefore = deps.youtube.searchCalls;
  const popularBefore = deps.youtube.popularCalls;

  const second = await buildFeed(deps, "u_public");
  assert.ok(second.ok && second.cacheHit);

  // 2회차에는 YouTube 호출이 일어나지 않아야 한다 (search 100u 비용 방지).
  assert.equal(deps.youtube.channelCalls, channelBefore);
  assert.equal(deps.youtube.searchCalls, searchBefore);
  assert.equal(deps.youtube.popularCalls, popularBefore);
});

test("buildFeed invalidates feed cache when profile.version changes", async () => {
  const profileRepo = new InMemoryProfileRepo([
    makeProfileFixture("u_v", { isPublic: true, version: 1 }),
  ]);
  const youtube = new FakeYouTubeClient();
  const cache = new MemoryCacheStore();
  const deps = { profileRepo, youtube, cache, clock };

  const r1 = await buildFeed(deps, "u_v");
  assert.ok(r1.ok && !r1.cacheHit);

  // 같은 version → 캐시 히트.
  const r2 = await buildFeed(deps, "u_v");
  assert.ok(r2.ok && r2.cacheHit);

  // 프로필 재동기화 → version 증가 → feed 키가 달라져 새로 빌드 (cacheHit=false).
  // 단, 소스 캐시(yt:search:* 등) 는 version 과 무관하게 유효하므로 YouTube 추가
  // 호출은 발생하지 않을 수 있다 — 이게 Phase2.md §3.2.3 의 의도된 쿼터 절약 설계.
  profileRepo.add(makeProfileFixture("u_v", { isPublic: true, version: 2 }));

  const r3 = await buildFeed(deps, "u_v");
  assert.ok(r3.ok && !r3.cacheHit);
});

test("shuffle order is stable for the same day, different across days", async () => {
  const deps = setup();
  const a = await buildFeed(deps, "u_public");
  const b = await buildFeed(deps, "u_public");
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.deepEqual(a.videos.map((v) => v.id), b.videos.map((v) => v.id));

  const clock2 = new FixedClock(new Date("2026-05-14T12:00:00.000Z"));
  const deps2 = { ...deps, clock: clock2 };
  const c = await buildFeed(deps2, "u_public");
  assert.ok(c.ok);
  if (!c.ok) return;
  // 캐시는 동일 (1h TTL 내 + 같은 version) 이지만 셔플 시드는 날짜 기반이므로 순서가 다름.
  assert.notDeepEqual(c.videos.map((v) => v.id), a.videos.map((v) => v.id));
});

test("buildFeed handles profile with empty channel list (uses keyword + category only)", async () => {
  const profileRepo = new InMemoryProfileRepo([
    makeProfileFixture("u_kw_only", {
      isPublic: true,
      topChannels: [],
      topKeywords: ["a", "b"],
      categories: ["c1", "c2"],
    }),
  ]);
  const deps = {
    profileRepo,
    youtube: new FakeYouTubeClient(),
    cache: new MemoryCacheStore(),
    clock,
  };
  const r = await buildFeed(deps, "u_kw_only");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.videos.length > 0);
  assert.equal(deps.youtube.channelCalls, 0);
});
