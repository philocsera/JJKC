import { getSubscriptions, getLikedVideos, getVideoCategories, getChannels } from "../lib/youtube";
import { generateProfile } from "../lib/profiler";
import { saveProfile } from "../lib/profile-service";
import { prisma } from "../lib/prisma";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function sync() {
  const token = process.env.YOUTUBE_TEMP_ACCESS_TOKEN;
  const userId = "me"; // UI에서 보여줄 기본 ID

  if (!token) return;

  try {
    console.log("🔄 Syncing YouTube data to DB...");
    
    // 1. Ensure User exists
    await prisma.user.upsert({
      where: { id: userId },
      update: { name: "My Algorithm" },
      create: { id: userId, name: "My Algorithm", email: "test@example.com" },
    });

    // 2. Fetch & Profile
    const [categories, subs, likes] = await Promise.all([
      getVideoCategories(token),
      getSubscriptions(token, 50),
      getLikedVideos(token, 50),
    ]);

    const channelDetails = await getChannels(token, subs.map((s: any) => s.snippet.resourceId.channelId));
    const result = generateProfile(subs, likes, channelDetails, categories);

    // 3. Save to DB
    await saveProfile(userId, result);
    
    console.log("✅ Successfully saved profile to DB!");
  } catch (error) {
    console.error("❌ Sync failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

sync();
