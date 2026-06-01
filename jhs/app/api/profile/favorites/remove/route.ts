// POST /api/profile/favorites/remove { channelId } — 내 "좋아하는 채널"에서 채널 제거.
// 본인 프로필만 수정(세션 사용자 기준). 로그인 필요.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { removeFavoriteChannel } from "@/lib/profile-service";

const Body = z.object({ channelId: z.string().min(1) });

export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  await removeFavoriteChannel(me, parsed.data.channelId);
  return NextResponse.json({ ok: true });
}
