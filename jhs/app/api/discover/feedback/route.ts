// POST /api/discover/feedback {videoId, action: like|dislike}
// /discover 추천 영상의 좋아요/싫어요(영상 단위). disliked 는 다음 재랭킹 후보에서 제외된다.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { setVideoFeedback } from "@/lib/profile-service";

const Body = z.object({ videoId: z.string().min(1), action: z.enum(["like", "dislike"]) });

export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  await setVideoFeedback(me, parsed.data.videoId, parsed.data.action);
  return NextResponse.json({ ok: true });
}
