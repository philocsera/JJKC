// /api/onboard — Phase 3 알고리즘 프로필 진입점 (옛 /api/sync 대체).
//   GET  : 기존 OnboardInput 을 폼 prefill 용으로 반환 (선택 채널은 표시 정보까지).
//   POST : 폼 입력 검증 → AlgoProfile 생성 + OnboardInput 보존 + 캐시 무효화.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cache } from "@/lib/cache";
import { profileCacheKey } from "@/lib/keys";
import { saveProfile } from "@/lib/profile-service";
import { buildOnboardProfile } from "@/lib/onboard-profile";
import { getChannelsByIds } from "@/lib/channel-service";
import { isCategoryName } from "@/lib/categories";
import { validSubKeys } from "@/lib/sub-taxonomy";

const safeParse = <T,>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export async function GET() {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const row = await prisma.onboardInput.findUnique({ where: { userId: me } });
  const channelIds = safeParse<string[]>(row?.channelIds, []);
  const categories = safeParse<string[]>(row?.categories, []);
  const subCategories = safeParse<string[]>(row?.subCategories, []);

  // 폼 chip 렌더용 채널 표시 정보 (선택 순서 보존).
  const channels = (await getChannelsByIds(channelIds)).map((c) => ({
    id: c.id,
    title: c.title,
    handle: c.handle,
    thumbnail: c.thumbnail,
    subscriberCount: c.subscriberCount,
  }));

  return NextResponse.json({ channelIds, categories, subCategories, channels });
}

// 개수 상한은 "거부"가 아니라 아래에서 slice/filter 로 정규화한다. 그래서 Zod 는
// 비정상 폭주만 막는 넉넉한 상한만 둔다(예: 채널 11개 선택 시 400 으로 저장 실패하던 버그 방지).
const Body = z.object({
  channelIds: z.array(z.string().min(1)).max(100).default([]),
  categories: z.array(z.string()).max(100).default([]),
  subCategories: z.array(z.string()).max(300).default([]),
});

const dedupe = (xs: string[]) => [...new Set(xs)];

export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const channelIds = dedupe(parsed.data.channelIds).slice(0, 10);
  const categories = dedupe(parsed.data.categories.filter(isCategoryName));
  // 세부 카테고리: 택소노미에 존재하고 + 부모가 선택된 것만 인정.
  const valid = validSubKeys();
  const subCategories = dedupe(parsed.data.subCategories).filter(
    (k) => valid.has(k) && categories.includes(k.split("/")[0]),
  );

  // 채널·카테고리 둘 다 비면 프로필을 만들 신호가 없다.
  if (channelIds.length === 0 && categories.length === 0) {
    return NextResponse.json(
      { error: "empty_input", message: "채널이나 카테고리를 최소 한 개 이상 골라 주세요." },
      { status: 400 },
    );
  }

  const { result, subscribedChannelIds } = await buildOnboardProfile({
    channelIds,
    categories,
    subCategories,
  });

  await saveProfile(me, result, subscribedChannelIds);

  await prisma.onboardInput.upsert({
    where: { userId: me },
    update: {
      channelIds: JSON.stringify(channelIds),
      categories: JSON.stringify(categories),
      subCategories: JSON.stringify(subCategories),
    },
    create: {
      userId: me,
      channelIds: JSON.stringify(channelIds),
      categories: JSON.stringify(categories),
      subCategories: JSON.stringify(subCategories),
    },
  });

  await cache.del(profileCacheKey(me));

  return NextResponse.json({ ok: true });
}
