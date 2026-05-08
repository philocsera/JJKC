import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUser, isFollowing, setFollow } from "@/lib/mock-data";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return toggle(params, true);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return toggle(params, false);
}

async function toggle(
  paramsPromise: Promise<{ userId: string }>,
  follow: boolean,
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const { userId } = await paramsPromise;
  if (userId === me.id) {
    return NextResponse.json({ error: "cannot follow self" }, { status: 400 });
  }
  if (!getUser(userId)) {
    return NextResponse.json({ error: "no such user" }, { status: 404 });
  }
  const ok = setFollow(me.id, userId, follow);
  return NextResponse.json({
    ok,
    following: isFollowing(me.id, userId),
  });
}
