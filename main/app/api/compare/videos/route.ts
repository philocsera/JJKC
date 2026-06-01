// POST /api/compare/videos {aId, bId} — 두 사람이 "둘 다 좋아할" 영상 LLM 재랭킹.
// 캐시는 쌍(aId,bId)+양쪽 프로필 버전 기준. 3h.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/profile-service";
import { rerankedSharedVideosForPair, type RerankedVideo } from "@/lib/video-rerank";
import { llmEnabled } from "@/lib/llm";
import { cache } from "@/lib/cache";

const Body = z.object({ aId: z.string().min(1), bId: z.string().min(1) });
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
  const { aId, bId } = parsed.data;
  if (aId === bId) return NextResponse.json({ error: "same_user" }, { status: 400 });

  const [pa, pb] = await Promise.all([getProfile(aId), getProfile(bId)]);
  if (!pa || !pb) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  const key = `compare-videos:v1:${aId}:${bId}:${pa.lastSyncedAt}-${pb.lastSyncedAt}`;
  const cached = await cache.get<RerankedVideo[]>(key);
  if (cached) return NextResponse.json({ ok: true, videos: cached, cached: true });

  const result = await rerankedSharedVideosForPair(aId, bId);
  if (!result.ok) {
    const status = result.reason === "llm_failed" ? 502 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }
  await cache.set(key, result.videos, TTL);
  return NextResponse.json({ ok: true, videos: result.videos });
}
