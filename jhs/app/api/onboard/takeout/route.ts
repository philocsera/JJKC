// POST /api/onboard/takeout {entries:[{channelId?,...}]} — Google Takeout 시청 기록으로
// 알고리즘 프로필 생성. 시청 영상의 channelId 를 빈도순으로 모아 카탈로그와 매칭한 뒤,
// 기존 온보딩과 동일하게 buildOnboardProfile → saveProfile. YouTube API 호출 0(파일 기반).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cache } from "@/lib/cache";
import { profileCacheKey } from "@/lib/keys";
import { saveProfile } from "@/lib/profile-service";
import { buildOnboardProfile } from "@/lib/onboard-profile";

const Body = z.object({
  entries: z
    .array(z.object({ channelId: z.string().optional() }).passthrough())
    .min(1)
    .max(10000),
});

const MAX_CHANNELS = 10; // buildOnboardProfile 와 동일하게 상위 10개 채널만

export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  // 1) 시청 기록의 channelId 빈도 집계
  const counts = new Map<string, number>();
  for (const e of parsed.data.entries) {
    if (e.channelId) counts.set(e.channelId, (counts.get(e.channelId) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return NextResponse.json({ error: "no_channels", message: "시청 기록에서 채널 정보를 찾지 못했습니다." }, { status: 400 });
  }

  // 2) 카탈로그에 있는 채널만 추림(분류·벡터가 이미 계산돼 있어야 프로필 생성 가능)
  const ids = [...counts.keys()];
  const existing = await prisma.channel.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const inCatalog = existing.map((c) => c.id);
  if (inCatalog.length === 0) {
    return NextResponse.json(
      { error: "no_catalog_match", message: "시청 채널 중 분석 카탈로그와 일치하는 한국 채널이 없습니다." },
      { status: 400 },
    );
  }

  // 3) 빈도순 상위 N개 → 기존 온보딩 프로필 빌더로 일관되게 생성
  const topChannelIds = inCatalog
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, MAX_CHANNELS);

  const { result, subscribedChannelIds } = await buildOnboardProfile({
    channelIds: topChannelIds,
    categories: [],
    subCategories: [],
  });
  await saveProfile(me, result, subscribedChannelIds);

  // 폼 prefill 용 입력 보존(직접 고르기로 다듬을 수 있게)
  const data = { channelIds: JSON.stringify(topChannelIds), categories: "[]", subCategories: "[]" };
  await prisma.onboardInput.upsert({ where: { userId: me }, update: data, create: { userId: me, ...data } });

  await cache.del(profileCacheKey(me));
  return NextResponse.json({
    ok: true,
    matchedChannels: topChannelIds.length,
    totalWatchedChannels: counts.size,
  });
}
