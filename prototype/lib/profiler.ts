export interface ProfileResult {
  categories: Record<string, number>;
  keywords: string[];
  topChannels: Array<{ id: string; name: string; thumbnail: string }>;
  sampleVideoIds: string[];
}

/**
 * Core engine that transforms raw YouTube data into an Algorithm Profile.
 */
export function generateProfile(
  subscriptions: any[],
  likedVideos: any[],
  channelDetails: any[], // Added to analyze subscription categories
  categoryMapping: Record<string, string>
): ProfileResult {
  const categoryScores: Record<string, number> = {};
  const keywordMap: Record<string, number> = {};
  const topChannels: any[] = [];
  const sampleVideoIds: string[] = [];

  // 1. Process Subscriptions (Weight: 2 per channel)
  // Use channelDetails to find topics if subscriptions don't have categories
  channelDetails.forEach((channel) => {
    const topics = channel.topicDetails?.topicCategories || [];
    
    // Extract simple category names from Wikipedia links provided by YouTube
    // e.g. "https://en.wikipedia.org/wiki/Action_game" -> "Action game"
    topics.forEach((url: string) => {
      const topicName = url.split("/").pop()?.replace(/_/g, " ");
      if (topicName) {
        categoryScores[topicName] = (categoryScores[topicName] || 0) + 2;
      }
    });

    topChannels.push({
      id: channel.id,
      name: channel.snippet.title,
      thumbnail: channel.snippet.thumbnails?.default?.url,
      videoCount: parseInt(channel.statistics?.videoCount || "0", 10),
    });
  });

  // 2. Process Liked Videos (Weight: 5 per video - STRONGER signal)
  likedVideos.forEach((video) => {
    const catId = video.snippet.categoryId;
    const catName = categoryMapping[catId] || "Other";
    
    categoryScores[catName] = (categoryScores[catName] || 0) + 5;

    const tags = video.snippet.tags || [];
    tags.forEach((tag: string) => {
      const t = tag.toLowerCase();
      keywordMap[t] = (keywordMap[t] || 0) + 1;
    });

    if (sampleVideoIds.length < 20) {
      sampleVideoIds.push(video.id);
    }
  });

  // 3. Normalize Category Scores
  const totalScore = Object.values(categoryScores).reduce((a, b) => a + b, 0);
  const normalizedCategories: Record<string, number> = {};
  
  if (totalScore > 0) {
    Object.entries(categoryScores).forEach(([name, score]) => {
      normalizedCategories[name] = Math.round((score / totalScore) * 100) / 100;
    });
  } else {
    // If NO data at all, provide a default profile
    normalizedCategories["Discovery"] = 1.0;
  }

  // 4. Extract Top Keywords
  const sortedKeywords = Object.entries(keywordMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return {
    categories: normalizedCategories,
    keywords: sortedKeywords,
    topChannels: topChannels.slice(0, 10),
    sampleVideoIds,
  };
}
