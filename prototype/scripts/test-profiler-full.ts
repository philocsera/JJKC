import { getSubscriptions, getLikedVideos, getVideoCategories, getChannels } from "../lib/youtube";
import { generateProfile } from "../lib/profiler";
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

  console.log("🚀 Starting Enhanced Profiler Test...");

  try {
    // 1. Fetch Basic Data
    console.log("   - Fetching categories...");
    const categoryMapping = await getVideoCategories(token);
    
    console.log("   - Fetching subscriptions...");
    const subs = await getSubscriptions(token, 20);
    
    console.log("   - Fetching liked videos...");
    const likes = await getLikedVideos(token, 20);

    // 2. Fetch Channel Details for Subscriptions (Crucial for when likes are 0)
    console.log(`   - Fetching details for ${subs.length} channels...`);
    const channelIds = subs.map((s: any) => s.snippet.resourceId.channelId);
    let channelDetails: any[] = [];
    if (channelIds.length > 0) {
      channelDetails = await getChannels(token, channelIds);
    }

    // 3. Generate Profile
    console.log("\n📊 Generating Algorithm Profile...");
    const profile = generateProfile(subs, likes, channelDetails, categoryMapping);

    // 4. Print Results
    console.log("\n--- [Algorithm Profile Results] ---");
    
    console.log("\n📈 Category Distribution:");
    const sortedCats = Object.entries(profile.categories).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length === 0) {
      console.log("   (No category data found)");
    } else {
      sortedCats.forEach(([name, ratio]) => {
        const bar = "█".repeat(Math.round(ratio * 20));
        console.log(`   ${name.padEnd(20)}: ${bar} ${(ratio * 100).toFixed(0)}%`);
      });
    }

    console.log("\n🏷️  Top Keywords:");
    console.log(`   ${profile.keywords.join(", ") || "(No keywords found)"}`);

    console.log("\n📺 Top Channels:");
    profile.topChannels.forEach(ch => console.log(`   - ${ch.name}`));

    console.log("\n🎥 Sample Video IDs (Count):", profile.sampleVideoIds.length);

    console.log("\n🎉 Enhanced Profiler Test Completed!");
  } catch (error: any) {
    console.error("\n❌ Test Failed!");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error:", error.message);
    }
  }
}

test();
