// 어댑터 결합 지점의 모양만 보여주는 스텁.
//
// prototype Phase 1 이 끝나면 이 파일 (또는 prototype 측의 같은 역할 파일) 의
// 각 객체를 실제 구현으로 교체한다:
//   profileRepo  → Prisma `prisma.algoProfile.*`
//   followRepo   → Prisma `prisma.follow.*`
//   youtube      → googleapis 의 youtube('v3') 호출 + accessToken
//   cache        → @upstash/redis 클라이언트
//
// JHS 코어 코드는 이 파일을 import 하지 않는다. 각 route handler 가 의존성을
// 주입받는 형태로 결합한다.

import type {
  CacheStore,
  Clock,
  FollowRepo,
  ProfileRepo,
  YouTubeClient,
} from "../src/ports.ts";
import { SystemClock } from "../src/clock.ts";
import { MemoryCacheStore } from "../src/cache/memory-store.ts";

const notWired = (name: string) => () => {
  throw new Error(`[JHS] ${name} not wired — see examples/wiring.ts`);
};

export const profileRepo: ProfileRepo = {
  findById: notWired("profileRepo.findById"),
  findPublic: notWired("profileRepo.findPublic"),
};

export const followRepo: FollowRepo = {
  isFollowing: notWired("followRepo.isFollowing"),
  follow: notWired("followRepo.follow"),
  unfollow: notWired("followRepo.unfollow"),
  listFollowing: notWired("followRepo.listFollowing"),
};

export const youtube: YouTubeClient = {
  channelUploads: notWired("youtube.channelUploads"),
  searchByKeyword: notWired("youtube.searchByKeyword"),
  popularByCategory: notWired("youtube.popularByCategory"),
};

// 운영에선 Upstash 어댑터로 교체. 개발 단계에선 메모리 캐시도 가능.
export const cache: CacheStore = new MemoryCacheStore();

export const clock: Clock = new SystemClock();
