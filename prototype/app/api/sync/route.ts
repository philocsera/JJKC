import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { touchProfileSync } from "@/lib/mock-data";

// In a real build this would:
//   1. Pull a fresh access token from NextAuth.
//   2. Call YouTube Data API v3 (videos.list?myRating=like, subscriptions.list,
//      playlistItems.list) — see plan.md §Step 4.
//   3. Recompute categories / channels / keywords and persist via Prisma.
//   4. Cache the response in Upstash Redis with a 1h TTL.
// For the prototype it just bumps lastSyncedAt so the dashboard shows
// the user a recent timestamp.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const profile = touchProfileSync(user.id);
  if (!profile) {
    return NextResponse.json({ error: "no profile" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, lastSyncedAt: profile.lastSyncedAt });
}
