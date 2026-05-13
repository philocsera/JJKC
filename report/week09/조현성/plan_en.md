# YouTube Algorithm Sharing Service — Implementation Plan

## Service Overview

A platform where users can share their YouTube algorithm (watch patterns, recommended videos, etc.) and explore content curated by other users' algorithms.

---

## Core Feature Definitions

### Phase 1 — Algorithm Profile Sharing
- Google/YouTube OAuth login
- Collect YouTube watch history, liked videos, and subscribed channels
- Generate a public "Algorithm Profile" (category distribution, top channels, interest keywords)
- Profile visibility settings (public / private)

### Phase 2 — Browse via Others' Algorithms
- Display a curated video feed based on another user's profile
- "Watch through XXX's algorithm" mode
- Follow algorithm profiles you find interesting

### Phase 3 — Community Features
- Algorithm comparison (me vs. others — category distribution visualization)
- Recommend users with similar algorithms
- Algorithm trend feed (rapidly rising shared channels)

---

## Tech Stack

| Area | Choice | Reason |
|---|---|---|
| Frontend | Next.js 15 (App Router) | SSR/SSG, Vercel deployment optimization |
| Backend | Next.js API Routes | Monorepo simplicity |
| DB | PostgreSQL (Neon) | Relational data, Vercel Marketplace integration |
| ORM | Prisma | Type-safe queries |
| Auth | NextAuth.js v5 | Built-in Google OAuth support |
| Cache | Upstash Redis | YouTube API response caching, quota reduction |
| External API | YouTube Data API v3 | Watch history, subscriptions, liked videos data |
| Deployment | Vercel | CI/CD, Edge Functions |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI composition |

---

## Implementation Steps

### Step 1 — Project Initial Setup

```bash
npx create-next-app@latest yt-algo-share --typescript --tailwind --app
cd yt-algo-share
npx prisma init
npm install next-auth@beta @auth/prisma-adapter
npm install @google-cloud/local-auth googleapis
npm install @upstash/redis ioredis
```

### Step 2 — Google OAuth + YouTube API Configuration

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Issue an **OAuth 2.0 Client ID** (Web Application)
3. Enable **YouTube Data API v3**
4. Configure required OAuth scopes:
   ```
   https://www.googleapis.com/auth/youtube.readonly
   https://www.googleapis.com/auth/youtube.force-ssl
   ```
5. Configure `.env.local`:
   ```env
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   NEXTAUTH_SECRET=...
   DATABASE_URL=...
   UPSTASH_REDIS_URL=...
   UPSTASH_REDIS_TOKEN=...
   ```

> **Note:** YouTube Data API v3 has a daily quota (10,000 units), so Redis caching is essential.

### Step 3 — Database Schema Design

```prisma
model User {
  id            String   @id @default(cuid())
  googleId      String   @unique
  name          String
  image         String?
  accessToken   String   // For YouTube API calls (stored encrypted)
  isPublic      Boolean  @default(false)
  profile       AlgoProfile?
  follows       Follow[] @relation("follower")
  followers     Follow[] @relation("following")
  createdAt     DateTime @default(now())
}

model AlgoProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id])
  categories      Json     // { "Entertainment": 40, "Tech": 30, ... }
  topChannels     Json     // [{ id, name, thumbnail, videoCount }]
  topKeywords     String[] // Extracted keyword tags
  sampleVideoIds  String[] // Representative video ID list (up to 20)
  lastSyncedAt    DateTime
  updatedAt       DateTime @updatedAt
}

model Follow {
  followerId  String
  followingId String
  follower    User   @relation("follower", fields: [followerId], references: [id])
  following   User   @relation("following", fields: [followingId], references: [id])
  @@id([followerId, followingId])
}
```

### Step 4 — YouTube Data Collection Pipeline

```
User Login (OAuth)
    │
    ▼
YouTube Data API Calls
    ├── videos.list (liked videos)        → likeRating: like
    ├── subscriptions.list                → Subscribed channel list
    └── playlistItems.list (watch later)  → Watch later videos
    │
    ▼
Category Distribution Calculation
    ├── Map category IDs → names via videoCategories.list
    └── Aggregate per-channel weights
    │
    ▼
Keyword Extraction
    └── Video titles/descriptions → TF-IDF or morphological analysis
    │
    ▼
Save AlgoProfile to DB + Redis Cache (TTL: 1 hour)
```

> **Limitation:** YouTube does not expose a personal recommendation feed API. Watch history (myRating, watch history) is also difficult to read via OAuth scopes. The actual "recommendation algorithm" is approximated using a **likes- and subscriptions-based profile**.

### Step 5 — Core API Endpoint Implementation

```
POST /api/sync              → Sync YouTube data (update AlgoProfile)
GET  /api/profile/[userId]  → Retrieve public algorithm profile
GET  /api/feed/[userId]     → Video feed based on that user's profile
GET  /api/explore           → List all public profiles
POST /api/follow/[userId]   → Follow / Unfollow
GET  /api/compare?a=&b=     → Compare two users' algorithms
```

### Step 6 — Frontend Key Pages

```
/                   → Landing + Login
/dashboard          → My algorithm profile (category chart, channel list)
/explore            → Browse public profiles
/profile/[userId]   → Another user's profile detail + video feed
/compare            → Two-algorithm comparison visualization
```

### Step 7 — Algorithm Feed Implementation Strategy

How to build a video feed from another user's profile:

1. **Channel-based**: Fetch the latest videos from the user's top subscribed channels (`playlistItems` API)
2. **Keyword-based**: Call YouTube Search API with the user's keywords
3. **Category-based**: Adjust video ratio according to category weights

```
Load Target Profile
    │
    ├─ topChannels (30%) → Latest N videos from each channel
    ├─ topKeywords (40%) → Keyword search results
    └─ categories  (30%) → Popular videos by category
    │
    ▼
Deduplicate + Shuffle by weight
    │
    ▼
Embed YouTube videos (iframe API) or thumbnail + link
```

### Step 8 — Visualization (Category Comparison)

```bash
npm install recharts
```

- **Radar Chart**: Compare my vs. others' category distributions
- **Bar Chart**: Per-channel weight breakdown
- **Word Cloud**: Interest keyword visualization

---

## Key Constraints and Solutions

| Constraint | Solution |
|---|---|
| No YouTube personal recommendation feed API | Approximate profile from likes and subscriptions data |
| API daily quota of 10,000 units | Redis caching, limit sync frequency (minimum 1 hour) |
| User token security | Encrypt accessToken in DB (AES-256), HTTPS only |
| Privacy protection | User controls profile visibility; sensitive data not exposed |
| YouTube iframe restrictions | Use official YouTube IFrame Player API |

---

## Development Priority Roadmap

```
Week 1  OAuth login + YouTube API integration + DB setup
Week 2  AlgoProfile generation pipeline + Dashboard UI
Week 3  Public profile exploration + Others' algorithm feed
Week 4  Comparison visualization + Follow feature
Week 5  Cache optimization + Deployment (Vercel) + QA
```

---

## Future Extension Possibilities

- **Browser Extension**: Overlay others' algorithm feeds directly on the YouTube page
- **Algorithm Diary**: Track weekly changes in watch patterns
- **Group Algorithm**: Combined feed from multiple users' profiles (friend groups, family, etc.)
- **Algorithm Challenge**: "Watch only through someone else's algorithm for 1 week" event
