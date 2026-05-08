import { NextResponse } from "next/server";
import { getProfile, getUser } from "@/lib/mock-data";
import { buildFeed } from "@/lib/feed";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const user = getUser(userId);
  const profile = getProfile(userId);
  if (!user || !profile) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!user.isPublic) {
    return NextResponse.json({ error: "private profile" }, { status: 403 });
  }

  const url = new URL(req.url);
  const total = clamp(parseInt(url.searchParams.get("n") ?? "18", 10), 6, 60);
  const feed = buildFeed(userId, total);
  return NextResponse.json({ userId, total: feed.length, videos: feed });
}

function clamp(n: number, lo: number, hi: number) {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
