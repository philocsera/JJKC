import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { 
  getSubscriptions, 
  getLikedVideos, 
  getVideoCategories, 
  getChannels 
} from "@/lib/youtube";
import { generateProfile } from "@/lib/profiler";
import { saveProfile } from "@/lib/profile-service";

export async function POST() {
  const user = await getCurrentUser();

  if (!user || !user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch tokens from DB (NextAuth might not put tokens in the session object directly)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { accessToken: true }
  });

  if (!dbUser?.accessToken) {
    return NextResponse.json({ error: "No YouTube access token found. Please re-login." }, { status: 400 });
  }

  try {
    const token = dbUser.accessToken;

    // 1. Fetch data from YouTube
    const [categories, subs, likes] = await Promise.all([
      getVideoCategories(token),
      getSubscriptions(token, 50),
      getLikedVideos(token, 50),
    ]);

    // 2. Fetch channel details for topics
    const channelIds = subs.map((s: any) => s.snippet.resourceId.channelId);
    let channelDetails: any[] = [];
    if (channelIds.length > 0) {
      channelDetails = await getChannels(token, channelIds);
    }

    // 3. Generate and Save profile
    const result = generateProfile(subs, likes, channelDetails, categories);
    const saved = await saveProfile(user.id, result);

    return NextResponse.json({ 
      success: true, 
      lastSyncedAt: saved.lastSyncedAt 
    });
  } catch (error: any) {
    console.error("Sync API error:", error);
    return NextResponse.json({ error: "Failed to sync data" }, { status: 500 });
  }
}
