import { NextResponse } from "next/server";
import { getProfile, getUser } from "@/lib/mock-data";
import type { CategoryName } from "@/lib/types";

const ALL_CATEGORIES: CategoryName[] = [
  "Tech", "Music", "Gaming", "Entertainment", "Cooking",
  "Travel", "Beauty", "Sports", "News", "Education",
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = url.searchParams.get("a");
  const b = url.searchParams.get("b");
  if (!a || !b) {
    return NextResponse.json({ error: "?a=&b= required" }, { status: 400 });
  }
  const ua = getUser(a);
  const ub = getUser(b);
  const pa = getProfile(a);
  const pb = getProfile(b);
  if (!ua || !ub || !pa || !pb) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  if (!ua.isPublic || !ub.isPublic) {
    return NextResponse.json({ error: "private profile" }, { status: 403 });
  }

  // Normalize both distributions over the union of categories so the
  // radar chart has matching axes regardless of which subset each user
  // actually has weight in.
  const rows = ALL_CATEGORIES.map((cat) => ({
    category: cat,
    a: pa.categories[cat] ?? 0,
    b: pb.categories[cat] ?? 0,
  }));

  const sharedKeywords = pa.topKeywords.filter((k) =>
    pb.topKeywords.includes(k),
  );

  return NextResponse.json({
    a: { user: ua, profile: pa },
    b: { user: ub, profile: pb },
    rows,
    sharedKeywords,
  });
}
