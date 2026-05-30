// POST /api/compare/insight {aId, bId} — 버튼 클릭 시에만 두 알고리즘 AI 비교 코멘트 생성.
// 24h 캐시 → 같은 쌍 재요청은 API 호출 없이 캐시 반환. 로그인 필요.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { getProfileWithOwner } from "@/lib/profile-service";
import { generateCompareInsight } from "@/lib/llm-features";
import { llmEnabled } from "@/lib/llm";
import { cache } from "@/lib/cache";

const Body = z.object({ aId: z.string().min(1), bId: z.string().min(1) });

export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!llmEnabled()) {
    return NextResponse.json({ error: "llm_disabled", message: "GEMINI_API_KEY 가 설정되지 않았습니다." }, { status: 503 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { aId, bId } = parsed.data;
  if (aId === bId) return NextResponse.json({ error: "same_user" }, { status: 400 });

  const [a, b] = await Promise.all([getProfileWithOwner(aId), getProfileWithOwner(bId)]);
  if (!a || !b) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ver = `${new Date(a.profile.lastSyncedAt).getTime()}-${new Date(b.profile.lastSyncedAt).getTime()}`;
  const key = `compare-insight:${aId}:${bId}:${ver}`;

  let insight = await cache.get<string>(key);
  if (!insight) {
    const bChannelIds = new Set<string>([
      ...b.profile.topChannels.map((c) => c.id),
      ...b.profile.subscribedChannelIds,
    ]);
    const sharedChannels = a.profile.topChannels.filter((c) => bChannelIds.has(c.id)).map((c) => c.name);
    insight = await generateCompareInsight(a, b, sharedChannels);
    if (!insight) return NextResponse.json({ error: "generation_failed" }, { status: 502 });
    await cache.set(key, insight, 60 * 60 * 24);
  }
  return NextResponse.json({ ok: true, insight });
}
