import { google } from "googleapis";

/**
 * YouTube Data API v3 client helper
 */
export const getYouTubeClient = (accessToken: string) => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.youtube({ version: "v3", auth });
};

/**
 * Fetches the user's subscribed channels.
 * Used for "Long-term interest" profiling.
 */
export async function getSubscriptions(accessToken: string, maxResults = 50) {
  const youtube = getYouTubeClient(accessToken);
  const response = await youtube.subscriptions.list({
    part: ["snippet", "contentDetails"],
    mine: true,
    maxResults,
  });

  return response.data.items || [];
}

/**
 * Fetches the user's liked videos.
 * Used for "Active/Specific interest" profiling.
 * Note: 'myRating' requires specific OAuth scopes.
 */
export async function getLikedVideos(accessToken: string, maxResults = 50) {
  const youtube = getYouTubeClient(accessToken);
  const response = await youtube.videos.list({
    part: ["snippet", "topicDetails", "contentDetails"],
    myRating: "like",
    maxResults,
  });

  return response.data.items || [];
}

/**
 * Fetches detailed info for multiple channels.
 * Used to find the category/topic of subscribed channels.
 */
export async function getChannels(accessToken: string, channelIds: string[]) {
  const youtube = getYouTubeClient(accessToken);
  const response = await youtube.channels.list({
    part: ["snippet", "topicDetails", "statistics"],
    id: channelIds,
    maxResults: 50,
  });

  return response.data.items || [];
}

/**
 * Maps category IDs to human-readable names.
 * YouTube uses IDs like "28" for "Science & Technology".
 */
export async function getVideoCategories(accessToken: string, regionCode = "KR") {
  const youtube = getYouTubeClient(accessToken);
  const response = await youtube.videoCategories.list({
    part: ["snippet"],
    regionCode,
  });

  const mapping: Record<string, string> = {};
  response.data.items?.forEach((item) => {
    if (item.id && item.snippet?.title) {
      mapping[item.id] = item.snippet.title;
    }
  });

  return mapping;
}

/**
 * Fetches the most popular videos in a specific category.
 * Used for "Category-based feed generation".
 */
export async function getPopularVideosByCategory(
  accessToken: string,
  categoryId: string,
  maxResults = 10,
) {
  const youtube = getYouTubeClient(accessToken);
  const response = await youtube.videos.list({
    part: ["snippet", "statistics"],
    chart: "mostPopular",
    videoCategoryId: categoryId,
    maxResults,
  });

  return response.data.items || [];
}
