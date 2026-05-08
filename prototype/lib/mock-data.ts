// Mock dataset standing in for Postgres + YouTube Data API.
//
// The shape of every export here matches prisma/schema.prisma + the JSON
// blobs the plan calls for. To go live, replace each function below with
// a Prisma query (and, for channels / videos, with a YouTube API call).

import type {
  AlgoProfile,
  CategoryName,
  Channel,
  User,
  Video,
} from "./types";

const avatar = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=160`;

// Stable thumbnail seeded by the video id, so refreshes don't reshuffle.
const thumb = (seed: string, w = 480, h = 270) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;

const USERS: User[] = [
  { id: "u_alex", name: "Alex", image: avatar("Alex"), isPublic: true,
    bio: "AI / dev tooling — mostly Python and infra deep-dives." },
  { id: "u_bora", name: "Bora", image: avatar("Bora"), isPublic: true,
    bio: "Indie music, lo-fi sets, occasional movie essay." },
  { id: "u_chris", name: "Chris", image: avatar("Chris"), isPublic: true,
    bio: "Gaming — souls-likes, speedruns, retro retrospectives." },
  { id: "u_dana", name: "Dana", image: avatar("Dana"), isPublic: true,
    bio: "Cooking and travel — small kitchens, big trips." },
  { id: "u_eun", name: "Eun", image: avatar("Eun"), isPublic: true,
    bio: "K-pop choreography breakdowns and beauty reviews." },
  { id: "u_frank", name: "Frank", image: avatar("Frank"), isPublic: false,
    bio: "Sports highlights and morning news catchups." },
];

// Channels are deliberately invented so we never accidentally imply a
// real creator's algorithm. Names are evocative of the category.
const CHANNELS: Record<string, Channel> = {
  c_tech_loop:    { id: "c_tech_loop",    name: "TechLoop Daily",    thumbnail: thumb("ch-tech-loop", 96, 96),  videoCount: 412 },
  c_byte_school:  { id: "c_byte_school",  name: "Byte School",       thumbnail: thumb("ch-byte-school", 96, 96), videoCount: 188 },
  c_infra_corner: { id: "c_infra_corner", name: "Infra Corner",      thumbnail: thumb("ch-infra-corner", 96, 96),videoCount: 96  },
  c_lofi_house:   { id: "c_lofi_house",   name: "Lofi House",        thumbnail: thumb("ch-lofi-house", 96, 96),  videoCount: 1320},
  c_indie_radar:  { id: "c_indie_radar",  name: "Indie Radar",       thumbnail: thumb("ch-indie-radar", 96, 96), videoCount: 240 },
  c_film_essay:   { id: "c_film_essay",   name: "Film Essay Weekly", thumbnail: thumb("ch-film-essay", 96, 96),  videoCount: 64  },
  c_souls_codex:  { id: "c_souls_codex",  name: "Souls Codex",       thumbnail: thumb("ch-souls-codex", 96, 96), videoCount: 311 },
  c_speed_lab:    { id: "c_speed_lab",    name: "Speedrun Lab",      thumbnail: thumb("ch-speed-lab", 96, 96),   videoCount: 156 },
  c_retro_room:   { id: "c_retro_room",   name: "Retro Room",        thumbnail: thumb("ch-retro-room", 96, 96),  videoCount: 78  },
  c_small_kitchen:{ id: "c_small_kitchen",name: "Small Kitchen",     thumbnail: thumb("ch-small-kitchen", 96, 96),videoCount: 220 },
  c_pack_light:   { id: "c_pack_light",   name: "Pack Light",        thumbnail: thumb("ch-pack-light", 96, 96),  videoCount: 132 },
  c_kpop_mirror:  { id: "c_kpop_mirror",  name: "K-Pop Mirror",      thumbnail: thumb("ch-kpop-mirror", 96, 96), videoCount: 480 },
  c_beauty_bench: { id: "c_beauty_bench", name: "Beauty Bench",      thumbnail: thumb("ch-beauty-bench", 96, 96),videoCount: 290 },
  c_court_view:   { id: "c_court_view",   name: "Courtside View",    thumbnail: thumb("ch-court-view", 96, 96),  videoCount: 612 },
  c_morning_brief:{ id: "c_morning_brief",name: "Morning Brief",     thumbnail: thumb("ch-morning-brief", 96, 96),videoCount: 1880},
};

// Each user gets categories that sum to 100, so we can use them directly
// as percentages in charts without renormalizing in the UI.
const PROFILES: Record<string, AlgoProfile> = {
  u_alex: {
    userId: "u_alex",
    categories: { Tech: 55, Education: 20, News: 10, Entertainment: 10, Music: 5 },
    topChannels: [CHANNELS.c_tech_loop, CHANNELS.c_byte_school, CHANNELS.c_infra_corner],
    topKeywords: ["LLM", "kubernetes", "rust", "observability", "vector db", "rag"],
    sampleVideoIds: makeVideoIds("alex", 12),
    lastSyncedAt: "2026-05-07T09:00:00.000Z",
  },
  u_bora: {
    userId: "u_bora",
    categories: { Music: 50, Entertainment: 30, Education: 8, News: 7, Travel: 5 },
    topChannels: [CHANNELS.c_lofi_house, CHANNELS.c_indie_radar, CHANNELS.c_film_essay],
    topKeywords: ["lofi", "indie folk", "live session", "soundtrack", "film essay"],
    sampleVideoIds: makeVideoIds("bora", 12),
    lastSyncedAt: "2026-05-07T10:30:00.000Z",
  },
  u_chris: {
    userId: "u_chris",
    categories: { Gaming: 65, Entertainment: 15, Tech: 10, Music: 5, News: 5 },
    topChannels: [CHANNELS.c_souls_codex, CHANNELS.c_speed_lab, CHANNELS.c_retro_room],
    topKeywords: ["elden ring", "speedrun", "any%", "boss rush", "retro"],
    sampleVideoIds: makeVideoIds("chris", 12),
    lastSyncedAt: "2026-05-07T11:00:00.000Z",
  },
  u_dana: {
    userId: "u_dana",
    categories: { Cooking: 45, Travel: 30, Entertainment: 10, Education: 10, News: 5 },
    topChannels: [CHANNELS.c_small_kitchen, CHANNELS.c_pack_light],
    topKeywords: ["one pan", "ramen", "carry-on", "night market", "kyoto"],
    sampleVideoIds: makeVideoIds("dana", 12),
    lastSyncedAt: "2026-05-07T12:00:00.000Z",
  },
  u_eun: {
    userId: "u_eun",
    categories: { Music: 35, Beauty: 35, Entertainment: 20, Education: 5, News: 5 },
    topChannels: [CHANNELS.c_kpop_mirror, CHANNELS.c_beauty_bench],
    topKeywords: ["dance practice", "choreo", "skincare routine", "k-beauty", "color analysis"],
    sampleVideoIds: makeVideoIds("eun", 12),
    lastSyncedAt: "2026-05-07T13:00:00.000Z",
  },
  u_frank: {
    userId: "u_frank",
    categories: { Sports: 55, News: 30, Entertainment: 8, Education: 5, Music: 2 },
    topChannels: [CHANNELS.c_court_view, CHANNELS.c_morning_brief],
    topKeywords: ["nba", "playoffs", "game recap", "morning headlines", "transfer rumors"],
    sampleVideoIds: makeVideoIds("frank", 12),
    lastSyncedAt: "2026-05-07T14:00:00.000Z",
  },
};

function makeVideoIds(seed: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `vid_${seed}_${i + 1}`);
}

// Per-user video pool. Real product would call playlistItems / search.
function buildVideoPool(profile: AlgoProfile): Video[] {
  const out: Video[] = [];
  const cats = (Object.keys(profile.categories) as CategoryName[]);
  const channels = profile.topChannels;
  const keywords = profile.topKeywords;

  // Channel-sourced
  channels.forEach((ch, ci) => {
    for (let i = 0; i < 3; i++) {
      const id = `vid_${ch.id}_${i + 1}`;
      out.push({
        id,
        title: `${ch.name} — episode #${ch.videoCount - i}`,
        channelId: ch.id,
        channelName: ch.name,
        thumbnail: thumb(id),
        publishedAt: new Date(Date.UTC(2026, 4, 1 + ci, 12, i * 5)).toISOString(),
        category: cats[ci % cats.length] ?? "Entertainment",
        source: "channel",
      });
    }
  });

  // Keyword-sourced
  keywords.forEach((kw, ki) => {
    const id = `vid_kw_${profile.userId}_${ki}`;
    out.push({
      id,
      title: `Search: "${kw}" — top result`,
      channelId: `c_search_${ki}`,
      channelName: `Search · ${kw}`,
      thumbnail: thumb(id),
      publishedAt: new Date(Date.UTC(2026, 4, 2, 8 + ki, 0)).toISOString(),
      category: cats[ki % cats.length] ?? "Entertainment",
      source: "keyword",
    });
  });

  // Category-sourced (top trending in each category)
  cats.forEach((cat, i) => {
    const id = `vid_cat_${profile.userId}_${cat}`;
    out.push({
      id,
      title: `Trending in ${cat}`,
      channelId: `c_trend_${cat}`,
      channelName: `Trending · ${cat}`,
      thumbnail: thumb(id),
      publishedAt: new Date(Date.UTC(2026, 4, 3, 9 + i, 0)).toISOString(),
      category: cat,
      source: "category",
    });
  });

  return out;
}

// In-memory follow store. Resets on server restart (intentional for the
// prototype). Key = followerId, Value = Set<followingId>.
const FOLLOWS = new Map<string, Set<string>>();

// ---------- public API for the rest of the app ----------

export function listUsers(): User[] {
  return USERS.slice();
}

export function getUser(userId: string): User | undefined {
  return USERS.find((u) => u.id === userId);
}

export function listPublicProfiles(): { user: User; profile: AlgoProfile }[] {
  return USERS.filter((u) => u.isPublic).map((user) => ({
    user,
    profile: PROFILES[user.id]!,
  }));
}

export function getProfile(userId: string): AlgoProfile | undefined {
  return PROFILES[userId];
}

export function touchProfileSync(userId: string): AlgoProfile | undefined {
  const p = PROFILES[userId];
  if (!p) return undefined;
  p.lastSyncedAt = new Date().toISOString();
  return p;
}

export function getVideoPool(userId: string): Video[] {
  const profile = PROFILES[userId];
  if (!profile) return [];
  return buildVideoPool(profile);
}

export function isFollowing(followerId: string, followingId: string): boolean {
  return FOLLOWS.get(followerId)?.has(followingId) ?? false;
}

export function setFollow(
  followerId: string,
  followingId: string,
  follow: boolean,
): boolean {
  if (followerId === followingId) return false;
  let set = FOLLOWS.get(followerId);
  if (!set) {
    set = new Set();
    FOLLOWS.set(followerId, set);
  }
  if (follow) set.add(followingId);
  else set.delete(followingId);
  return true;
}

export function listFollowing(followerId: string): string[] {
  return Array.from(FOLLOWS.get(followerId) ?? []);
}
