// GET /onboard/google-sync — OAuth(google-youtube) 동의 후 돌아오는 지점.
// 사용자의 YouTube 구독을 가져와 카탈로그 매칭 → buildOnboardProfile → saveProfile.
// 성공 시 /dashboard, 실패 시 /onboard?google=<reason> 로 리다이렉트.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cache } from "@/lib/cache";
import { profileCacheKey } from "@/lib/keys";
import { saveProfile } from "@/lib/profile-service";
import { buildOnboardProfile } from "@/lib/onboard-profile";
import { getGoogleAccessToken, getSubscriptionChannelIds } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.redirect(new URL("/", req.url));
  const fail = (reason: string) => NextResponse.redirect(new URL(`/onboard?google=${reason}`, req.url));

  const token = await getGoogleAccessToken(me);
  if (!token) return fail("reconnect");

  const subIds = await getSubscriptionChannelIds(token);
  if (subIds.length === 0) return fail("no_subs");

  // 카탈로그(분류·벡터 보유)에 있는 구독 채널만 프로필 빌드에 사용
  const existing = await prisma.channel.findMany({ where: { id: { in: subIds } }, select: { id: true } });
  const inCatalog = existing.map((c) => c.id);
  if (inCatalog.length === 0) return fail("no_match");

  const { result } = await buildOnboardProfile({
    channelIds: inCatalog.slice(0, 10),
    categories: [],
    subCategories: [],
  });
  await saveProfile(me, result, inCatalog); // 구독 전체를 subscribedChannelIds 로 보존

  const data = { channelIds: JSON.stringify(inCatalog.slice(0, 10)), categories: "[]", subCategories: "[]" };
  await prisma.onboardInput.upsert({ where: { userId: me }, update: data, create: { userId: me, ...data } });
  await cache.del(profileCacheKey(me));

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
