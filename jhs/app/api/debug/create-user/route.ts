// /api/debug/create-user — 디버깅용. 로그인/OAuth 없이 이름 + 알고리즘을 지정해
// User + AlgoProfile + OnboardInput 을 즉석 생성한다. 알고리즘 입력은 일반
// 온보딩(/api/onboard)과 동일한 형태(channelIds/categories/subCategories)이며,
// 동일한 buildOnboardProfile 파이프라인으로 프로필을 만든다.
//
// 프로덕션(VERCEL_ENV=production)에서는 비활성. 로컬/프리뷰 전용.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { saveProfile } from "@/lib/profile-service";
import { buildOnboardProfile } from "@/lib/onboard-profile";
import { isCategoryName } from "@/lib/categories";
import { validSubKeys } from "@/lib/sub-taxonomy";

const Body = z.object({
  name: z.string().trim().min(1).max(40),
  channelIds: z.array(z.string().min(1)).max(10).default([]),
  categories: z.array(z.string()).max(17).default([]),
  subCategories: z.array(z.string()).max(40).default([]),
});

const dedupe = (xs: string[]) => [...new Set(xs)];

export async function POST(req: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "disabled_in_production" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: "이름과 알고리즘 입력을 확인하세요." },
      { status: 400 },
    );
  }
  const { name } = parsed.data;

  // /api/onboard 와 동일한 정제 규칙.
  const channelIds = dedupe(parsed.data.channelIds).slice(0, 10);
  const categories = dedupe(parsed.data.categories.filter(isCategoryName));
  const valid = validSubKeys();
  const subCategories = dedupe(parsed.data.subCategories).filter(
    (k) => valid.has(k) && categories.includes(k.split("/")[0]),
  );

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

  // 고유 이메일(unique 제약 회피) — 디버그 식별용.
  const email = `debug-${Date.now()}-${Math.floor(Math.random() * 1e6)}@debug.local`;
  const user = await prisma.user.create({ data: { name, email } });

  await saveProfile(user.id, result, subscribedChannelIds);

  await prisma.onboardInput.create({
    data: {
      userId: user.id,
      channelIds: JSON.stringify(channelIds),
      categories: JSON.stringify(categories),
      subCategories: JSON.stringify(subCategories),
    },
  });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    name: user.name,
    categories: result.categories,
    subCategories: result.subCategories,
  });
}
