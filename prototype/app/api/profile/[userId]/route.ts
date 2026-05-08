import { NextResponse } from "next/server";
import { getProfile, getUser } from "@/lib/mock-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const user = getUser(userId);
  const profile = getProfile(userId);
  if (!user || !profile) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!user.isPublic) {
    return NextResponse.json({ error: "private profile" }, { status: 403 });
  }
  return NextResponse.json({ user, profile });
}
