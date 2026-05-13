import type { FollowRepo, ProfileRepo } from "../ports.ts";
import type { FollowOutcome } from "../types.ts";

export type FollowDeps = {
  profileRepo: ProfileRepo;
  followRepo: FollowRepo;
};

export async function follow(
  deps: FollowDeps,
  followerId: string,
  targetId: string,
): Promise<FollowOutcome> {
  if (followerId === targetId) return { ok: false, code: "self" };

  const target = await deps.profileRepo.findById(targetId);
  // Phase2.md §3.4: 비공개·존재하지 않음을 같은 응답으로 처리해 enumeration 차단.
  if (!target) return { ok: false, code: "not_found" };
  if (!target.isPublic) return { ok: false, code: "private" };

  await deps.followRepo.follow(followerId, targetId);
  return { ok: true, following: true };
}

export async function unfollow(
  deps: FollowDeps,
  followerId: string,
  targetId: string,
): Promise<FollowOutcome> {
  if (followerId === targetId) return { ok: false, code: "self" };

  // 언팔로우는 비공개 여부와 무관하게 항상 허용 — 이미 팔로우한 사용자가 추후
  // 프로필을 비공개로 돌렸을 때도 관계를 정리할 수 있어야 한다.
  await deps.followRepo.unfollow(followerId, targetId);
  return { ok: true, following: false };
}

export async function listFollowing(
  deps: FollowDeps,
  followerId: string,
): Promise<string[]> {
  return deps.followRepo.listFollowing(followerId);
}
