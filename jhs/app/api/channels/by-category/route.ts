// GET /api/channels/by-category?categories=Music,Gaming — onboard 폼 2단계용.
// 선택한 카테고리마다 top-1 카테고리가 일치하는 채널을 인기순으로 묶어 반환.
// DB(Channel) 만 읽음. YouTube API 호출 0.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { listByCategory } from "@/lib/sources/catalog";
import { isCategoryName, CATEGORY_LABELS_KO, type CategoryName } from "@/lib/categories";

const PER_CATEGORY = 24;

export async function GET(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("categories") ?? "";
  const categories = [...new Set(raw.split(",").map((s) => s.trim()))]
    .filter(isCategoryName)
    .slice(0, 5);

  const groups = await Promise.all(
    categories.map(async (name: CategoryName) => {
      const channels = await listByCategory(name, { limit: PER_CATEGORY });
      return {
        category: name,
        label: CATEGORY_LABELS_KO[name],
        channels: channels.map((c) => ({
          id: c.id,
          title: c.title,
          handle: c.handle,
          thumbnail: c.thumbnail,
          subscriberCount: c.subscriberCount,
        })),
      };
    }),
  );

  return NextResponse.json({ groups });
}
