import { getSubscriptions, getLikedVideos, getVideoCategories } from "../lib/youtube";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function test() {
  const token = process.env.YOUTUBE_TEMP_ACCESS_TOKEN;

  if (!token || token.includes("여기에")) {
    console.error("❌ Error: YOUTUBE_TEMP_ACCESS_TOKEN is not set in .env file.");
    process.exit(1);
  }

  console.log("🚀 Starting YouTube API Test...");

  try {
    // 1. Test Video Categories (to map IDs to names)
    console.log("\n--- [1] Fetching Video Categories ---");
    const categories = await getVideoCategories(token);
    console.log(`✅ Found ${Object.keys(categories).length} categories.`);
    // Print a few examples
    const examples = Object.entries(categories).slice(0, 5);
    examples.forEach(([id, name]) => console.log(`   ID ${id}: ${name}`));

    // 2. Test Subscriptions
    console.log("\n--- [2] Fetching Subscriptions ---");
    const subs = await getSubscriptions(token, 5);
    console.log(`✅ Fetched ${subs.length} subscriptions.`);
    subs.forEach((s: any) => {
      console.log(`   - ${s.snippet.title} (ID: ${s.snippet.resourceId.channelId})`);
    });

    // 3. Test Liked Videos
    console.log("\n--- [3] Fetching Liked Videos ---");
    const likes = await getLikedVideos(token, 5);
    console.log(`✅ Fetched ${likes.length} liked videos.`);
    likes.forEach((v: any) => {
      const catId = v.snippet.categoryId;
      const catName = categories[catId] || "Unknown";
      console.log(`   - [${catName}] ${v.snippet.title}`);
    });

    console.log("\n🎉 API Test Completed Successfully!");
  } catch (error: any) {
    console.error("\n❌ API Test Failed!");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error:", error.message);
    }
  }
}

test();
