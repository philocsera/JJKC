// 외부 시스템과의 경계. JHS 코어는 이 인터페이스만 알고, 구체 구현은
// prototype 측 어댑터(Phase 1 이후 작성)가 채운다.

import type {
  AlgoProfile,
  CategoryId,
  ChannelId,
  ExploreQuery,
  KeywordTerm,
  PaginatedProfiles,
  Video,
} from "./types.ts";

export interface ProfileRepo {
  findById(userId: string): Promise<AlgoProfile | null>;
  findPublic(query: Required<Pick<ExploreQuery, "limit">> & ExploreQuery): Promise<PaginatedProfiles>;
}

export interface FollowRepo {
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  // follow / unfollow 는 idempotent: 이미 그 상태이면 no-op.
  follow(followerId: string, followingId: string): Promise<void>;
  unfollow(followerId: string, followingId: string): Promise<void>;
  listFollowing(followerId: string): Promise<string[]>;
}

// YouTube Data API v3 호출 추상화.
// 비용은 Phase2.md §3.2.2 참조: search 100u, 그 외 1u.
export interface YouTubeClient {
  channelUploads(channelId: ChannelId, max: number): Promise<Video[]>;
  searchByKeyword(keyword: KeywordTerm, max: number): Promise<Video[]>;
  popularByCategory(categoryId: CategoryId, max: number): Promise<Video[]>;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export interface Clock {
  now(): Date;
  // YYYY-MM-DD (UTC). shuffleForToday 시드 등에 사용.
  today(): string;
}
