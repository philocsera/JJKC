import { test } from "node:test";
import assert from "node:assert/strict";

import {
  follow,
  unfollow,
  listFollowing,
} from "../src/follow/service.ts";
import {
  InMemoryFollowRepo,
  InMemoryProfileRepo,
  makeProfileFixture,
} from "./helpers/fakes.ts";

function deps() {
  return {
    profileRepo: new InMemoryProfileRepo([
      makeProfileFixture("u_public", { isPublic: true }),
      makeProfileFixture("u_private", { isPublic: false }),
    ]),
    followRepo: new InMemoryFollowRepo(),
  };
}

test("follow rejects self-follow with code='self'", async () => {
  const d = deps();
  const r = await follow(d, "u_public", "u_public");
  assert.deepEqual(r, { ok: false, code: "self" });
  assert.equal(d.followRepo.followCalls, 0);
});

test("follow rejects unknown target with code='not_found'", async () => {
  const d = deps();
  const r = await follow(d, "u_public", "u_nope");
  assert.deepEqual(r, { ok: false, code: "not_found" });
});

test("follow rejects private target with code='private'", async () => {
  const d = deps();
  const r = await follow(d, "u_public", "u_private");
  assert.deepEqual(r, { ok: false, code: "private" });
  assert.equal(d.followRepo.followCalls, 0);
});

test("follow succeeds and is idempotent", async () => {
  const d = deps();
  const r1 = await follow(d, "u_a", "u_public");
  const r2 = await follow(d, "u_a", "u_public");
  assert.deepEqual(r1, { ok: true, following: true });
  assert.deepEqual(r2, { ok: true, following: true });
  assert.equal((await listFollowing(d, "u_a")).length, 1);
});

test("unfollow allowed even when target is private (relationship cleanup)", async () => {
  const d = deps();
  // 일단 공개 상태에서 팔로우.
  await follow(d, "u_a", "u_public");
  // 대상이 비공개로 전환되어도 언팔로우는 허용되어야 한다.
  d.profileRepo.add(makeProfileFixture("u_public", { isPublic: false }));
  const r = await unfollow(d, "u_a", "u_public");
  assert.deepEqual(r, { ok: true, following: false });
  assert.equal((await listFollowing(d, "u_a")).length, 0);
});

test("unfollow rejects self-unfollow", async () => {
  const d = deps();
  const r = await unfollow(d, "u_a", "u_a");
  assert.deepEqual(r, { ok: false, code: "self" });
});

test("listFollowing returns ids the user follows", async () => {
  const d = deps();
  d.profileRepo.add(makeProfileFixture("u_b", { isPublic: true }));
  await follow(d, "u_me", "u_public");
  await follow(d, "u_me", "u_b");
  const ids = await listFollowing(d, "u_me");
  assert.deepEqual(ids.sort(), ["u_b", "u_public"]);
});
