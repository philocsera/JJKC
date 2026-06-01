// POST /api/watch-as/rerank {userId} — 대상 사용자의 알고리즘으로 LLM 영상 재랭킹.
// 캐시는 대상(userId)+그 프로필 버전 기준 → 뷰어가 누구든 공유(쿼터 효율). 3h.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/profile-service";
import { rerankedVideosForUser, type RerankedVideo } from "@/lib/video-rerank";
import { llmEnabled, LLM_QUOTA_MESSAGE } from "@/lib/llm";
import { cache } from "@/lib/cache";

const Body = z.object({ userId: z.string().min(1) });
const TTL = 60 * 60 * 3;

export async function POST(req: Request) {
  if (!llmEnabled()) {
    return NextResponse.json(
      { error: "llm_disabled", message: "GEMINI_API_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { userId } = parsed.data;

  const profile = await getProfile(userId);
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  const ver = `${profile.lastSyncedAt}:${profile.likedVideoIds.length}:${profile.dislikedVideoIds.length}`;
  const key = `watch-as-rerank:v1:${userId}:${ver}`;

  const cached = await cache.get<RerankedVideo[]>(key);
  if (cached) return NextResponse.json({ ok: true, videos: cached, cached: true });

  const result = await rerankedVideosForUser(userId);
  if (!result.ok) {
    if (result.reason === "quota_exceeded") {
      return NextResponse.json({ error: "quota_exceeded", message: LLM_QUOTA_MESSAGE }, { status: 429 });
    }
    const status = result.reason === "llm_failed" ? 502 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }
  await cache.set(key, result.videos, TTL);
  return NextResponse.json({ ok: true, videos: result.videos });
}
