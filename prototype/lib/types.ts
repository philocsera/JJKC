// Shared types. Mirrors prisma/schema.prisma JSON shapes so the seam
// between mock data and a real Prisma client is a one-line swap.

export type CategoryName =
  | "Tech"
  | "Music"
  | "Gaming"
  | "Entertainment"
  | "Cooking"
  | "Travel"
  | "Beauty"
  | "Sports"
  | "News"
  | "Education";

export type CategoryDist = Partial<Record<CategoryName, number>>;

export type Channel = {
  id: string;
  name: string;
  thumbnail: string;
  videoCount: number;
};

export type Video = {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  thumbnail: string;
  publishedAt: string; // ISO
  category: CategoryName;
  source: "channel" | "keyword" | "category";
};

export type AlgoProfile = {
  userId: string;
  categories: CategoryDist;
  topChannels: Channel[];
  topKeywords: string[];
  sampleVideoIds: string[];
  lastSyncedAt: string;
};

export type User = {
  id: string;
  name: string;
  image: string;
  isPublic: boolean;
  bio: string;
};
