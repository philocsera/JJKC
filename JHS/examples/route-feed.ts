// Next.js 15 Route Handler 형태의 결합 예시.
// 실제 사용 시점에 prototype/app/api/feed/[userId]/route.ts 에 이 패턴으로 옮긴다.

import { buildFeed } from "../src/feed/builder.ts";
import { cache, clock, profileRepo, youtube } from "./wiring.ts";

type Params = { userId: string };

export async function GET(
  req: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  const { userId } = await ctx.params;
  const url = new URL(req.url);
  const total = Number(url.searchParams.get("n") ?? "18");

  const result = await buildFeed(
    { profileRepo, youtube, cache, clock },
    userId,
    { total },
  );

  if (!result.ok) {
    // Phase2.md §3.2.5: 비공개와 부재 모두 404 로 응답해 enumeration 차단.
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json(
    { userId, total: result.videos.length, videos: result.videos },
    {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-JHS-Cache": result.cacheHit ? "hit" : "miss",
      },
    },
  );
}
