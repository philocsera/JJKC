import { prisma } from "./prisma";
import { ProfileResult } from "./profiler";

/**
 * Saves or updates a user's algorithm profile in the database.
 */
export async function saveProfile(userId: string, result: ProfileResult) {
  return await prisma.algoProfile.upsert({
    where: { userId },
    update: {
      categories: JSON.stringify(result.categories),
      keywords: JSON.stringify(result.keywords),
      topChannels: JSON.stringify(result.topChannels),
      sampleVideoIds: JSON.stringify(result.sampleVideoIds),
      lastSyncedAt: new Date(),
    },
    create: {
      userId,
      categories: JSON.stringify(result.categories),
      keywords: JSON.stringify(result.keywords),
      topChannels: JSON.stringify(result.topChannels),
      sampleVideoIds: JSON.stringify(result.sampleVideoIds),
    },
  });
}

/**
 * Retrieves a user's profile and parses JSON fields.
 */
export async function getProfile(userId: string) {
  const profile = await prisma.algoProfile.findUnique({
    where: { userId },
    include: { user: true },
  });

  if (!profile) return null;

  return {
    ...profile,
    categories: JSON.parse(profile.categories),
    keywords: JSON.parse(profile.keywords),
    topChannels: JSON.parse(profile.topChannels),
    sampleVideoIds: JSON.parse(profile.sampleVideoIds),
  };
}
