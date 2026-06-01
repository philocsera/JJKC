// GET /api/channels/search?q=… — onboard 폼의 채널 선택용 카탈로그 검색.
// DB(Channel) LIKE 검색만. YouTube API 호출 0.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { searchChannels } from "@/lib/sources/catalog";

export async function GET(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ channels: [] });

  const results = await searchChannels(q, { limit: 10 });
  return NextResponse.json({
    channels: results.map((c) => ({
      id: c.id,
      title: c.title,
      handle: c.handle,
      thumbnail: c.thumbnail,
      subscriberCount: c.subscriberCount,
    })),
  });
}
