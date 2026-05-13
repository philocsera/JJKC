import { test } from "node:test";
import assert from "node:assert/strict";

import { listExplore } from "../src/explore/list.ts";
import {
  InMemoryProfileRepo,
  makeProfileFixture,
} from "./helpers/fakes.ts";

function buildRepo() {
  const fixtures = [
    makeProfileFixture("u_a", { isPublic: true, lastSyncedAt: "2026-05-10T00:00:00.000Z" }, { followerCount: 3 }),
    makeProfileFixture("u_b", { isPublic: true, lastSyncedAt: "2026-05-12T00:00:00.000Z" }, { followerCount: 10 }),
    makeProfileFixture("u_c", { isPublic: true, lastSyncedAt: "2026-05-11T00:00:00.000Z" }, { followerCount: 1 }),
    makeProfileFixture("u_d", { isPublic: true, lastSyncedAt: "2026-05-09T00:00:00.000Z" }, { followerCount: 7 }),
    makeProfileFixture("u_private", { isPublic: false }, { followerCount: 100 }),
  ];
  return new InMemoryProfileRepo(fixtures);
}

test("listExplore returns only public profiles", async () => {
  const r = await listExplore(buildRepo(), { limit: 10 });
  assert.equal(r.items.length, 4);
  assert.ok(!r.items.some((c) => c.user.id === "u_private"));
});

test("listExplore default sort is recent (lastSyncedAt desc)", async () => {
  const r = await listExplore(buildRepo());
  assert.deepEqual(r.items.map((c) => c.user.id), ["u_b", "u_c", "u_a", "u_d"]);
});

test("listExplore sort=popular orders by followerCount desc", async () => {
  const r = await listExplore(buildRepo(), { sort: "popular" });
  assert.deepEqual(r.items.map((c) => c.user.id), ["u_b", "u_d", "u_a", "u_c"]);
});

test("listExplore paginates with cursor", async () => {
  const repo = buildRepo();
  const first = await listExplore(repo, { limit: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);

  const second = await listExplore(repo, { limit: 2, cursor: first.nextCursor ?? undefined });
  assert.equal(second.items.length, 2);
  assert.equal(second.nextCursor, null);

  // 첫/둘째 페이지가 안 겹쳐야 함.
  const allIds = [...first.items, ...second.items].map((c) => c.user.id);
  assert.equal(new Set(allIds).size, allIds.length);
});

test("listExplore clamps limit to [1, 50]", async () => {
  const repo = buildRepo();
  const tooSmall = await listExplore(repo, { limit: -3 });
  assert.equal(tooSmall.items.length, 1);

  const tooBig = await listExplore(repo, { limit: 999 });
  assert.equal(tooBig.items.length, 4); // 전체 4개
});

test("listExplore card surfaces top categories / keywords / channels (capped)", async () => {
  const repo = new InMemoryProfileRepo([
    makeProfileFixture("u_x", {
      isPublic: true,
      categories: ["a", "b", "c", "d", "e"],
      topKeywords: ["k1", "k2", "k3", "k4", "k5", "k6", "k7"],
      topChannels: ["c1", "c2", "c3", "c4"],
    }),
  ]);
  const r = await listExplore(repo);
  const card = r.items[0];
  assert.ok(card);
  if (!card) return;
  assert.deepEqual(card.topCategories, ["a", "b", "c"]);
  assert.deepEqual(card.topKeywords, ["k1", "k2", "k3", "k4", "k5"]);
  assert.deepEqual(card.topChannelIds, ["c1", "c2", "c3"]);
});
