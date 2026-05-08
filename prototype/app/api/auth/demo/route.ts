import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_COOKIE } from "@/lib/auth";
import { getUser } from "@/lib/mock-data";

const Body = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const user = getUser(parsed.data.userId);
  if (!user) {
    return NextResponse.json({ error: "no such user" }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set(DEMO_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
