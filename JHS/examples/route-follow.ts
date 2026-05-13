// POST  /api/follow/[userId]   팔로우
// DELETE /api/follow/[userId]  언팔로우
//
// 호출자 인증은 prototype 측의 NextAuth 세션에서 가져온다 (예시에선 시그니처만 표시).

import { follow, unfollow } from "../src/follow/service.ts";
import { followRepo, profileRepo } from "./wiring.ts";
import type { FollowOutcome } from "../src/types.ts";

type Params = { userId: string };

// prototype 측의 NextAuth getServerSession 같은 함수로 대체된다.
declare function getCurrentUserId(req: Request): Promise<string | null>;

export async function POST(
  req: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  return toggle(req, ctx, "follow");
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  return toggle(req, ctx, "unfollow");
}

async function toggle(
  req: Request,
  ctx: { params: Promise<Params> },
  action: "follow" | "unfollow",
): Promise<Response> {
  const me = await getCurrentUserId(req);
  if (!me) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { userId } = await ctx.params;
  const deps = { profileRepo, followRepo };

  const result: FollowOutcome =
    action === "follow"
      ? await follow(deps, me, userId)
      : await unfollow(deps, me, userId);

  if (!result.ok) return mapOutcomeToResponse(result);
  return Response.json({ ok: true, following: result.following });
}

function mapOutcomeToResponse(r: Extract<FollowOutcome, { ok: false }>): Response {
  switch (r.code) {
    case "self":
      return Response.json({ error: "cannot follow self" }, { status: 400 });
    case "not_found":
    case "private":
      // enumeration 방지를 위해 둘 다 404 로 통일.
      return Response.json({ error: "not found" }, { status: 404 });
  }
}
