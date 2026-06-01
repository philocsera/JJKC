// 좋아요한 채널을 카테고리 프로필에 반영(드리프트). 좋아요 변동 시 호출한다.
//
// 누적(compounding) 방지를 위해 항상 "온보딩 원본 입력(OnboardInput)" 을 base 로 다시 계산한다:
//   채널 = base 온보딩 채널 + 좋아요 채널(중복 제거, 싫어요 채널 제외)
//   선언 카테고리/세부 = base 그대로
// → buildOnboardProfile 이 categories/subCategories/topKeywords/metrics 를 새로 만든다.
// 결과적으로 대시보드의 fingerprint·top categories·"비슷한 사람 찾기" 가 좋아요를 반영한다.
//
// saveProfile 은 likedChannelIds 등 피드백 필드를 건드리지 않으므로 좋아요는 보존된다.

import { prisma } from "./prisma";
import { cache } from "./cache";
import { profileCacheKey } from "./keys";
import { getProfile, saveProfile } from "./profile-service";
import { buildOnboardProfile } from "./onboard-profile";

const safeParse = <T,>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export async function recomputeProfileWithFeedback(userId: string): Promise<void> {
  const [input, profile] = await Promise.all([
    prisma.onboardInput.findUnique({ where: { userId } }),
    getProfile(userId),
  ]);
  if (!profile) return;

  // base: 온보딩 원본 입력(없으면 프로필의 subscribedChannelIds 로 폴백).
  const baseChannelIds = safeParse<string[]>(input?.channelIds, profile.subscribedChannelIds ?? []);
  const categories = safeParse<string[]>(input?.categories, []);
  const subCategories = safeParse<string[]>(input?.subCategories, []);

  // base(온보딩) 우선 → 좋아요 채널 추가 → 싫어요 채널 제외 → 중복 제거.
  // base 를 앞에 둬서 topChannels(상위 10) 는 가급적 온보딩 채널을 유지한다.
  const disliked = new Set(profile.dislikedChannelIds);
  const channelIds = [...new Set([...baseChannelIds, ...profile.likedChannelIds])].filter(
    (id) => !disliked.has(id),
  );
  if (channelIds.length === 0 && categories.length === 0) return;

  const { result } = await buildOnboardProfile({ channelIds, categories, subCategories });
  // subscribedChannelIds(이미 보는 채널 제외용)는 기존 값을 유지한다.
  await saveProfile(userId, result, profile.subscribedChannelIds);
  await cache.del(profileCacheKey(userId));
}
