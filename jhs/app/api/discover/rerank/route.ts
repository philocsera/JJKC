// POST /api/discover/rerank — 버튼 클릭 시에만 LLM 으로 영상을 재랭킹한다.
// 프로필(취향) 변경 + "이미 보여준 영상(shown)" 변경 시 캐시 무효화 → 다시 추천하면
// 안 본 영상으로 갈아끼워 보여준다. 3h 캐시. 로그인 필요.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getProfile, recordShownVideos } from "@/lib/profile-service";
import { rerankedVideosForUser, type RerankedVideo } from "@/lib/video-rerank";
import { llmEnabled, LLM_QUOTA_MESSAGE } from "@/lib/llm";
import { cache } from "@/lib/cache";
import { clientIp, bumpDailyCount } from "@/lib/rate-limit";

const PROMPT_VER = "v1";
const TTL = 60 * 60 * 3; // 3시간 — 새 영상이 천천히 반영되도록
const DAILY_IP_LIMIT = 10; // IP 당 하루 추천받기 횟수 상한(KST 자정 리셋)

export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!llmEnabled()) {
    return NextResponse.json(
      { error: "llm_disabled", message: "GEMINI_API_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  // IP 당 하루 추천받기 횟수 제한(버튼 누름 기준 — '다시 추천'·캐시 응답 포함).
  // 카운터 장애 시엔 기능을 막지 않는다(fail-open).
  const ip = clientIp(req);
  let used = 0;
  try {
    used = await bumpDailyCount("discover-rerank", ip);
  } catch (err) {
    // 카운터 장애(예: 테이블 부재/DB 오류)는 로그로 남기고 기능은 막지 않는다(fail-open).
    console.error("[rate-limit] discover-rerank bump failed:", err);
    used = 0;
  }
  if (used > DAILY_IP_LIMIT) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `오늘 추천받기 한도(IP당 하루 ${DAILY_IP_LIMIT}회)를 모두 사용했어요. 내일 다시 시도해 주세요.`,
      },
      { status: 429 },
    );
  }

  const profile = await getProfile(me);
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  // shown 시그니처: 길이 + 마지막(가장 최근) 보여준 영상 id. 생성마다 새 영상이 끝에
  // 붙으므로 매번 달라져 캐시가 무효화 → "다시 추천" 시 안 본 영상으로 갱신된다.
  // (길이만 쓰면 shown 상한 도달 후 고정돼 갱신이 멈추므로 마지막 id 를 함께 넣는다.)
  const shown = profile.shownVideoIds;
  const shownSig = shown.length ? `${shown.length}:${shown[shown.length - 1]}` : "0";
  const ver = `${profile.lastSyncedAt}:${profile.likedChannelIds.length}:${profile.dislikedChannelIds.length}:${profile.likedVideoIds.length}:${profile.dislikedVideoIds.length}:${shownSig}`;
  const key = `discover-rerank:${PROMPT_VER}:${me}:${ver}`;

  const cached = await cache.get<RerankedVideo[]>(key);
  if (cached) return NextResponse.json({ ok: true, videos: cached, cached: true });

  const result = await rerankedVideosForUser(me, { excludeVideoIds: new Set(shown) });
  if (!result.ok) {
    if (result.reason === "quota_exceeded") {
      return NextResponse.json({ error: "quota_exceeded", message: LLM_QUOTA_MESSAGE }, { status: 429 });
    }
    const status = result.reason === "llm_failed" ? 502 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  // 방금 보여준 영상을 기록 → 다음 재랭킹 후보에서 제외(반응 없던 영상 재노출 방지).
  await recordShownVideos(me, result.videos.map((v) => v.videoId));
  await cache.set(key, result.videos, TTL);
  return NextResponse.json({ ok: true, videos: result.videos });
}
