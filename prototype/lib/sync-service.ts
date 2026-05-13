import { 
  getSubscriptions, 
  getLikedVideos, 
  getVideoCategories, 
  getChannels 
} from "./youtube";
import { generateProfile } from "./profiler";
import { saveProfile } from "./profile-service";
import { prisma } from "./prisma";

/**
 * Automatically fetches YouTube data and generates a profile for a given user.
 * This is the "magic" function that makes it work without manual input.
 */
export async function performAutoSync(userId: string) {
  // 1. Get tokens - Try User model first, then Account table (NextAuth default)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: { where: { provider: "google" } } }
  });

  const accessToken = user?.accessToken || user?.accounts[0]?.access_token;

  if (!accessToken) {
    throw new Error("No access token found for user");
  }

  const token = accessToken;

  try {
    // 2. Fetch everything from YouTube in parallel
    const [categories, subs, likes] = await Promise.all([
      getVideoCategories(token),
      getSubscriptions(token, 50),
      getLikedVideos(token, 50),
    ]);

    // 3. Fetch detailed channel topics for subscriptions
    const channelIds = subs.map((s: any) => s.snippet.resourceId.channelId);
    let channelDetails: any[] = [];
    if (channelIds.length > 0) {
      // YouTube allows max 50 IDs per request, which matches our default
      channelDetails = await getChannels(token, channelIds);
    }

    // 4. Run the profiling algorithm
    const result = generateProfile(subs, likes, channelDetails, categories);

    // 5. Save the result to DB
    return await saveProfile(userId, result);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.error(`Auto-sync unauthorized for user ${userId}. Likely missing scopes.`);
      throw new Error("YouTube API 권한이 없습니다. 로그인 시 'YouTube 계정 보기' 권한을 체크했는지 확인해 주세요.");
    }
    console.error(`Auto-sync failed for user ${userId}:`, error);
    throw error;
  }
}
