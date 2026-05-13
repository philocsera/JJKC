// Phase 2 도메인 타입. prototype/lib/types.ts 와 의도적으로 분리되어 있다.
// 두 곳에서 모양이 유사하더라도 결합점은 어댑터 레이어에만 두고, JHS 코어는
// 자체 타입만 사용한다.

export type CategoryId = string;
export type ChannelId = string;
export type KeywordTerm = string;

export type AlgoProfile = {
  userId: string;
  isPublic: boolean;

  // 캐시 키 무효화에 사용. Prisma updatedAt 의 epoch ms 등 단조 증가 값을 권장.
  version: number;

  topChannels: ChannelId[];
  topKeywords: KeywordTerm[];
  categories: CategoryId[];

  categoryDistribution?: Record<CategoryId, number>;
  lastSyncedAt: string;
};

export type ProfileCardMetrics = {
  followerCount: number;
};

export type ProfileCardOwner = {
  id: string;
  name: string;
  image: string | null;
};

export type ProfileCard = {
  user: ProfileCardOwner;
  topCategories: CategoryId[];
  topKeywords: KeywordTerm[];
  topChannelIds: ChannelId[];
  lastSyncedAt: string;
  metrics: ProfileCardMetrics;
};

export type VideoSource = "channel" | "keyword" | "category";

export type Video = {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
  source: VideoSource;
};

export type SortMode = "recent" | "popular";

export type PaginatedProfiles = {
  items: Array<{
    profile: AlgoProfile;
    owner: ProfileCardOwner;
    followerCount: number;
  }>;
  nextCursor: string | null;
};

export type FollowOutcome =
  | { ok: true; following: boolean }
  | { ok: false; code: "self" | "private" | "not_found" };

export type ExploreQuery = {
  cursor?: string;
  limit?: number;
  sort?: SortMode;
};

export type FeedRatios = {
  channel: number;
  keyword: number;
  category: number;
};
