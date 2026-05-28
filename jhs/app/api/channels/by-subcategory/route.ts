// GET /api/channels/by-subcategory?subCategories=Gaming/마인크래프트,...&categories=Gaming,Sports
// onboard 폼 3단계용: 선택한 세부 카테고리의 채널을 "하나의 중복제거 리스트"로 반환.
// 세부를 안 고른 카테고리는 그 카테고리 top 채널로 폴백. 구독자순 정렬. DB만 읽음.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { listBySubCategory, listByCategory } from "@/lib/sources/catalog";
import { isCategoryName, type CategoryName } from "@/lib/categories";
import { validSubKeys } from "@/lib/sub-taxonomy";
import type { ChannelRecord } from "@/lib/types";

const PER_SOURCE = 40; // 소스(세부/카테고리)별 후보 수 — 합쳐서 dedupe 후 상위 LIMIT
const LIMIT = 60;

const slim = (c: ChannelRecord) => ({
  id: c.id,
  title: c.title,
  handle: c.handle,
  thumbnail: c.thumbnail,
  subscriberCount: c.subscriberCount,
});

export async function GET(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const valid = validSubKeys();
  const subKeys = [...new Set((sp.get("subCategories") ?? "").split(",").map((s) => s.trim()))]
    .filter((k) => valid.has(k))
    .slice(0, 20);
  const categories = [...new Set((sp.get("categories") ?? "").split(",").map((s) => s.trim()))]
    .filter(isCategoryName)
    .slice(0, 5);

  // 세부를 하나라도 고른 부모 카테고리 — 폴백 대상에서 제외.
  const parentsWithSub = new Set(subKeys.map((k) => k.split("/")[0]));

  // 1) 세부 카테고리 채널 + 2) 세부 미선택 카테고리 폴백 채널을 모은다.
  const pool: ChannelRecord[] = [];
  for (const key of subKeys) pool.push(...(await listBySubCategory(key, { limit: PER_SOURCE })));
  for (const name of categories) {
    if (parentsWithSub.has(name)) continue;
    pool.push(...(await listByCategory(name as CategoryName, { limit: PER_SOURCE })));
  }

  // id 기준 중복 제거 → 구독자순 → 상위 LIMIT.
  const byId = new Map<string, ChannelRecord>();
  for (const c of pool) if (!byId.has(c.id)) byId.set(c.id, c);
  const channels = [...byId.values()]
    .sort((a, b) => b.subscriberCount - a.subscriberCount)
    .slice(0, LIMIT)
    .map(slim);

  return NextResponse.json({ channels });
}
