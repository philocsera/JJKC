// POST /api/discover/feedback {videoId, channelId?, action: like|dislike}
// /discover 추천 영상의 좋아요/싫어요(영상 단위). disliked 영상은 다음 재랭킹 후보에서 제외되고,
// like 시 channelId 가 오면 그 채널을 좋아하는 채널로 등록 → 다음부터 추천에서 제외된다.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { setVideoFeedback } from "@/lib/profile-service";
import { recomputeProfileWithFeedback } from "@/lib/recompute-profile";

const Body = z.object({
  videoId: z.string().min(1),
  channelId: z.string().min(1).optional(),
  action: z.enum(["like", "dislike"]),
});

export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const likedChannelAdded = await setVideoFeedback(
    me,
    parsed.data.videoId,
    parsed.data.action,
    parsed.data.channelId,
  );
  // 좋아요로 채널이 새로 추가됐으면 카테고리 프로필을 재계산(fingerprint·top categories·비슷한 사람 반영).
  if (likedChannelAdded) await recomputeProfileWithFeedback(me);
  return NextResponse.json({ ok: true });
}
