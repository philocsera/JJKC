// GET /api/explore?cursor=&limit=&sort=

import { listExplore } from "../src/explore/list.ts";
import { profileRepo } from "./wiring.ts";
import type { SortMode } from "../src/types.ts";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const sortParam = url.searchParams.get("sort");

  const sort: SortMode = sortParam === "popular" ? "popular" : "recent";

  const result = await listExplore(profileRepo, {
    ...(cursor ? { cursor } : {}),
    ...(limitParam ? { limit: Number(limitParam) } : {}),
    sort,
  });

  return Response.json(result, {
    headers: {
      // 공개 프로필 목록은 짧게 CDN 캐시 가능.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
