// POST /api/sync — YouTube → AlgoProfile upsert + cache invalidate.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { performAutoSync } from "@/lib/sync-service";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const saved = await performAutoSync(userId);
    return NextResponse.json({
      ok: true,
      lastSyncedAt: saved.lastSyncedAt.toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "sync_failed" },
      { status: 500 },
    );
  }
}
