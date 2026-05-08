import { NextResponse } from "next/server";
import { listPublicProfiles } from "@/lib/mock-data";

export async function GET() {
  const items = listPublicProfiles().map(({ user, profile }) => ({
    user,
    summary: {
      lastSyncedAt: profile.lastSyncedAt,
      topChannelNames: profile.topChannels.slice(0, 3).map((c) => c.name),
      topKeywords: profile.topKeywords.slice(0, 5),
      topCategory: dominantCategory(profile.categories),
    },
  }));
  return NextResponse.json({ count: items.length, items });
}

function dominantCategory(dist: Record<string, number | undefined>) {
  let best: { name: string; pct: number } = { name: "—", pct: 0 };
  for (const [name, pct] of Object.entries(dist)) {
    if ((pct ?? 0) > best.pct) best = { name, pct: pct ?? 0 };
  }
  return best;
}
