// POST /api/channels/feedback — 추천 카드 좋아요/싫어요.
//   like    → 좋아하는 채널 목록(likedChannelIds)에 추가 (추천에서 제외)
//   dislike → dislikedChannelIds 에 추가 (추천 + 관련 채널 제외)

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { addLikedChannel, addDislikedChannel } from "@/lib/profile-service";

const Body = z.object({
  channelId: z.string().min(1),
  action: z.enum(["like", "dislike"]),
});

export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { channelId, action } = parsed.data;

  if (action === "like") await addLikedChannel(me, channelId);
  else await addDislikedChannel(me, channelId);

  return NextResponse.json({ ok: true });
}
