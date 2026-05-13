import type { ProfileRepo } from "../ports.ts";
import type {
  ExploreQuery,
  PaginatedProfiles,
  ProfileCard,
  SortMode,
} from "../types.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_LIMIT = 1;

export type ExploreResult = {
  items: ProfileCard[];
  nextCursor: string | null;
};

export async function listExplore(
  repo: ProfileRepo,
  query: ExploreQuery = {},
): Promise<ExploreResult> {
  const limit = clampLimit(query.limit);
  const sort: SortMode = query.sort ?? "recent";

  const page: PaginatedProfiles = await repo.findPublic({
    limit,
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    sort,
  });

  return {
    items: page.items.map(toCard),
    nextCursor: page.nextCursor,
  };
}

function toCard(entry: PaginatedProfiles["items"][number]): ProfileCard {
  const { profile, owner, followerCount } = entry;
  return {
    user: owner,
    topCategories: profile.categories.slice(0, 3),
    topKeywords: profile.topKeywords.slice(0, 5),
    topChannelIds: profile.topChannels.slice(0, 3),
    lastSyncedAt: profile.lastSyncedAt,
    metrics: { followerCount },
  };
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.trunc(raw)));
}
