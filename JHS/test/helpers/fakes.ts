import type {
  Clock,
  FollowRepo,
  ProfileRepo,
  YouTubeClient,
} from "../../src/ports.ts";
import type {
  AlgoProfile,
  CategoryId,
  ChannelId,
  ExploreQuery,
  KeywordTerm,
  PaginatedProfiles,
  ProfileCardOwner,
  Video,
} from "../../src/types.ts";

export class FixedClock implements Clock {
  constructor(private fixed: Date) {}
  setNow(d: Date): void {
    this.fixed = d;
  }
  now(): Date {
    return new Date(this.fixed);
  }
  today(): string {
    return this.fixed.toISOString().slice(0, 10);
  }
}

export type ProfileFixture = {
  profile: AlgoProfile;
  owner: ProfileCardOwner;
  followerCount?: number;
};

export class InMemoryProfileRepo implements ProfileRepo {
  private byId = new Map<string, ProfileFixture>();

  constructor(fixtures: ProfileFixture[] = []) {
    for (const f of fixtures) this.byId.set(f.profile.userId, f);
  }

  add(fixture: ProfileFixture): void {
    this.byId.set(fixture.profile.userId, fixture);
  }

  async findById(userId: string): Promise<AlgoProfile | null> {
    return this.byId.get(userId)?.profile ?? null;
  }

  async findPublic(
    query: Required<Pick<ExploreQuery, "limit">> & ExploreQuery,
  ): Promise<PaginatedProfiles> {
    const all = [...this.byId.values()].filter((f) => f.profile.isPublic);

    // recent: lastSyncedAt 내림차순 / popular: followerCount 내림차순.
    const sorted = all.slice().sort((a, b) => {
      if ((query.sort ?? "recent") === "popular") {
        return (b.followerCount ?? 0) - (a.followerCount ?? 0);
      }
      return b.profile.lastSyncedAt.localeCompare(a.profile.lastSyncedAt);
    });

    const startIdx = query.cursor
      ? sorted.findIndex((f) => f.profile.userId === query.cursor) + 1
      : 0;
    const window = sorted.slice(startIdx, startIdx + query.limit);
    const last = window[window.length - 1];
    const nextCursor =
      startIdx + window.length < sorted.length && last
        ? last.profile.userId
        : null;

    return {
      items: window.map((f) => ({
        profile: f.profile,
        owner: f.owner,
        followerCount: f.followerCount ?? 0,
      })),
      nextCursor,
    };
  }
}

export class InMemoryFollowRepo implements FollowRepo {
  private graph = new Map<string, Set<string>>();
  public followCalls = 0;
  public unfollowCalls = 0;

  async isFollowing(a: string, b: string): Promise<boolean> {
    return this.graph.get(a)?.has(b) ?? false;
  }
  async follow(a: string, b: string): Promise<void> {
    this.followCalls++;
    let set = this.graph.get(a);
    if (!set) {
      set = new Set();
      this.graph.set(a, set);
    }
    set.add(b);
  }
  async unfollow(a: string, b: string): Promise<void> {
    this.unfollowCalls++;
    this.graph.get(a)?.delete(b);
  }
  async listFollowing(a: string): Promise<string[]> {
    return Array.from(this.graph.get(a) ?? []);
  }
}

// 호출 횟수를 기록해 캐시 hit 검증에 사용.
export class FakeYouTubeClient implements YouTubeClient {
  public channelCalls = 0;
  public searchCalls = 0;
  public popularCalls = 0;

  async channelUploads(id: ChannelId, max: number): Promise<Video[]> {
    this.channelCalls++;
    return Array.from({ length: max }, (_, i) =>
      makeVideo(`ch_${id}_${i}`, id, "channel"),
    );
  }
  async searchByKeyword(kw: KeywordTerm, max: number): Promise<Video[]> {
    this.searchCalls++;
    return Array.from({ length: max }, (_, i) =>
      makeVideo(`kw_${kw}_${i}`, `chan_${kw}`, "keyword"),
    );
  }
  async popularByCategory(cat: CategoryId, max: number): Promise<Video[]> {
    this.popularCalls++;
    return Array.from({ length: max }, (_, i) =>
      makeVideo(`cat_${cat}_${i}`, `chan_${cat}`, "category"),
    );
  }
}

function makeVideo(
  id: string,
  channelId: string,
  source: Video["source"],
): Video {
  return {
    id,
    title: `Video ${id}`,
    channelId,
    channelName: `Channel ${channelId}`,
    thumbnailUrl: `https://example.test/${id}.jpg`,
    publishedAt: "2026-05-01T00:00:00.000Z",
    source,
  };
}

export function makeProfileFixture(
  userId: string,
  overrides: Partial<AlgoProfile> & { isPublic?: boolean } = {},
  meta: { name?: string; followerCount?: number } = {},
): ProfileFixture {
  return {
    profile: {
      userId,
      isPublic: overrides.isPublic ?? true,
      version: overrides.version ?? 1,
      topChannels: overrides.topChannels ?? ["ch_a", "ch_b", "ch_c"],
      topKeywords: overrides.topKeywords ?? ["kw1", "kw2"],
      categories: overrides.categories ?? ["cat_tech", "cat_music"],
      lastSyncedAt: overrides.lastSyncedAt ?? "2026-05-01T00:00:00.000Z",
      ...(overrides.categoryDistribution
        ? { categoryDistribution: overrides.categoryDistribution }
        : {}),
    },
    owner: {
      id: userId,
      name: meta.name ?? userId,
      image: null,
    },
    ...(meta.followerCount !== undefined
      ? { followerCount: meta.followerCount }
      : {}),
  };
}
