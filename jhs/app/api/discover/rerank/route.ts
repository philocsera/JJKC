// POST /api/discover/rerank — 버튼 클릭 시에만 LLM 으로 영상을 재랭킹한다.
// 프로필(취향) 버전 + 좋아요/싫어요 변경 시 캐시 무효화. 3h 캐시. 로그인 필요.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getProfile } from "@/lib/profile-service";
import { rerankedVideosForUser, type RerankedVideo } from "@/lib/video-rerank";
import { llmEnabled, LLM_QUOTA_MESSAGE } from "@/lib/llm";
import { cache } from "@/lib/cache";

const PROMPT_VER = "v1";
const TTL = 60 * 60 * 3; // 3시간 — 새 영상이 천천히 반영되도록

export async function POST() {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!llmEnabled()) {
    return NextResponse.json(
      { error: "llm_disabled", message: "GEMINI_API_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const profile = await getProfile(me);
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  const ver = `${profile.lastSyncedAt}:${profile.likedChannelIds.length}:${profile.dislikedChannelIds.length}:${profile.likedVideoIds.length}:${profile.dislikedVideoIds.length}`;
  const key = `discover-rerank:${PROMPT_VER}:${me}:${ver}`;

  const cached = await cache.get<RerankedVideo[]>(key);
  if (cached) return NextResponse.json({ ok: true, videos: cached, cached: true });

  const result = await rerankedVideosForUser(me);
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
