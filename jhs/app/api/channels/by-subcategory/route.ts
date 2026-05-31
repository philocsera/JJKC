// GET /api/channels/by-subcategory?subCategories=Gaming/마인크래프트,...&categories=Gaming,Sports&offset=0
// onboard 폼 3단계용: 선택한 세부 카테고리의 채널을 "하나의 중복제거 리스트"로 반환.
// 세부를 안 고른 카테고리는 그 카테고리 top 채널로 폴백. 구독자순 정렬. DB만 읽음.
// offset 으로 "더보기" 페이지네이션 — hasMore 로 다음 페이지 존재 여부를 알린다.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { listBySubCategory, listByCategory } from "@/lib/sources/catalog";
import { isCategoryName, type CategoryName } from "@/lib/categories";
import { validSubKeys } from "@/lib/sub-taxonomy";
import type { ChannelRecord } from "@/lib/types";

const PAGE = 60;       // 한 페이지(요청)당 반환 채널 수
const MAX_OFFSET = 600; // 페이지네이션 상한 — 소스별 과도한 fetch 방지

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

  const offset = Math.min(MAX_OFFSET, Math.max(0, Number(sp.get("offset")) || 0));
  // 이번 페이지까지 필요한 채널 수 + 1(다음 페이지 존재 판별용). 소스별로 이만큼씩 끌어온다.
  const need = offset + PAGE;
  const perSource = Math.min(MAX_OFFSET + PAGE, need + 1);

  // 세부를 하나라도 고른 부모 카테고리 — 폴백 대상에서 제외.
  const parentsWithSub = new Set(subKeys.map((k) => k.split("/")[0]));

  // 1) 세부 카테고리 채널 + 2) 세부 미선택 카테고리 폴백 채널을 모은다.
  const pool: ChannelRecord[] = [];
  for (const key of subKeys) pool.push(...(await listBySubCategory(key, { limit: perSource })));
  for (const name of categories) {
    if (parentsWithSub.has(name)) continue;
    pool.push(...(await listByCategory(name as CategoryName, { limit: perSource })));
  }

  // id 기준 중복 제거 → 구독자순 → offset 부터 PAGE 개.
  const byId = new Map<string, ChannelRecord>();
  for (const c of pool) if (!byId.has(c.id)) byId.set(c.id, c);
  const sorted = [...byId.values()].sort((a, b) => b.subscriberCount - a.subscriberCount);
  const channels = sorted.slice(offset, offset + PAGE).map(slim);
  const hasMore = offset + PAGE < sorted.length && offset + PAGE < MAX_OFFSET + PAGE;

  return NextResponse.json({ channels, hasMore });
}
