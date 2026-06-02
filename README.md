# 📺 JJKC — Korean YouTube Channel Recommendations & Algorithm Sharing

Get Korean YouTube channel/video recommendations based on your viewing taste, and share & compare your "algorithm" with others. Runs entirely on a hand-built catalog of Korean channels — **no YouTube Data API (no key, no quota, no OAuth)**. At serving time the only external call is to channel RSS feeds.

🔗 https://jjkc-algo-blush.vercel.app/
📑 Mechanism slides — https://philocsera.github.io/JJKC/

This document explains **how each feature works internally**, step by step (1·2·3…).

---

## 0. Foundation — How the channel catalog is built

Every recommendation rests on a catalog of **6,592 Korean channels with 50k+ subscribers**. It is collected, classified, and clustered using only public data (zero external calls at serving time).

### 0-1. Collection (`scripts/discover-channels.ts`, `enrich-discovered.ts`)

1. **Scraping YouTube public search** — parse channelId and subscriber-count text from `ytInitialData` (channelRenderer) on `youtube.com/results?search_query=…`, and paginate into the long tail via continuation tokens.
2. **Batched niche query pool** — run ~900 Korean vertical queries (`data/overnight-queries.txt`) sequentially to discover channels. If interrupted, `scripts/resume-enrich.sh` resumes with only the remaining queries.
3. **Rate-limit avoidance** — 5–9s + jitter between requests, bypass the EU consent dialog with a `CONSENT=YES` cookie, a burst pause every 20 requests, concurrency of 1.
4. **RSS verification** — call `feeds/videos.xml?channel_id=…` for every channel to collect title/video metadata, and **exclude foreign channels by the Korean-character ratio of video titles**.
5. **Filters** — exclude channels under 50k subscribers, foreign channels, and the Music (K-pop, etc.) category. The entire process uses **no API key, no OAuth, no quota**.

### 0-2. Classification (`lib/classify.ts`, `lib/subclassify.ts`)

1. Build a combined text of `title + description + recent video titles` for each channel.
2. **Top-level categories (14)** — match against the Korean keyword lexicon `data/category-lexicon.ko.yaml`. Korean uses substring matching, short English terms (≤4 chars) use word-boundary matching, producing a vector like `{ "Gaming": 45, "Comedy": 30, … }` (the 15 standard YouTube categories minus Music).
3. **Sub-categories (57)** — subdivisions under each parent (e.g. Gaming → Minecraft / LoL / PUBG…). Candidates are auto-discovered via TF-IDF k-means, hand-labeled into `data/sub-taxonomy.ko.yaml`, then assigned with parent-gated matching, e.g. `{ "Gaming/마인크래프트": 70 }`.

### 0-3. Clustering (`lib/kmeans.ts`, `scripts/channels-cluster.ts`)

1. Collect every channel's category vector into a global vocabulary, turn each channel into a sparse vector, then **L2-normalize**.
2. Run **k-means++** for each k = 6–20, iterating to convergence.
3. Pick the **k with the highest silhouette score** as best-k → **16 clusters**.
4. Store each centroid as `{ name: weight }`. Because it lives in the **same cosine space** as user profiles, it directly drives recommendation diversity and labels.

> Collaborator sharing: `dev.db` (SQLite) is gitignored, but the catalog is committed as `main/data/catalog-seed.json`. After cloning: `cd main && npm install && npm run sqlite:push && npm run catalog:restore`. See [`main/README.md`](main/README.md) for pipeline details.

---

## 1. Building an algorithm profile — `/onboard`

After Google login, create a profile via **one of three methods**. All three ultimately save the same `AlgoProfile` (category/sub-category/keyword vectors + metrics) (`lib/onboard-profile.ts`).

### 1-A. Pick manually (3-step form)

1. Choose a **broad category**.
2. Choose **sub-interests** within that category.
3. Choose **channels of interest** among those that match the sub-interests.
4. The server blends two signals — the category vectors of the chosen channels (behavioral, 0.6) + the checked categories (declared, 0.4), each normalized then summed into `categories` (sub-categories use the same blend).
5. The chosen channels' keywords are aggregated by frequency into `topKeywords`, and the entropy of the category distribution fills the diversity/concentration metrics.

### 1-B. Analyze from a file (Google Takeout upload)

1. The user uploads their Google Takeout watch history (`.json`/`.html`).
2. **In the browser**, `lib/takeout-parser.ts` parses the file to extract each video's videoId/channelId/title (the raw file is never sent to the server).
3. `POST /api/onboard/takeout` **aggregates channelIds by frequency** from the watch history.
4. It keeps only channels present in the catalog (i.e. already classified/vectorized) and takes the top 10 by frequency.
5. That channel list is passed to the **same builder as 1-A (`buildOnboardProfile`)** to create the profile.

### 1-C. Google linking (automatic analysis from YouTube subscriptions)

1. Link via `youtube.readonly` scope at `/onboard/google-connect`.
2. Fetch the user's **subscription list**.
3. Keep only subscriptions that match the catalog (Korean channels) (0 matches → `no_match` notice).
4. Pass the filtered channels to the **same builder as 1-A** to create the profile.

> Common to all three: the raw input is preserved as `OnboardInput` so it can later be refined via "Pick manually," and the profile cache is invalidated right after saving.

---

## 2. Dashboard analysis — `/dashboard`

Visualizes the saved `AlgoProfile`.

1. Renders the category distribution (radar), top channels, keyword cloud, and diversity/niche metrics.
2. **AI one-line summary** — pressing `Generate` feeds categories/keywords/top channels to an LLM to produce a 40–60 character persona sentence, saved as `summaryText` (`lib/llm-features.ts`, generated once at build-time).
3. **Chrome extension connect** — a button sends my userId to the extension via `window.postMessage` (see §7).

---

## 3. Channel recommendations — `/discover` (Channels tab)

Ranks profiles against channels in the **same category/sub-category vector space** (`lib/channel-recommender.ts`). **Zero external calls.**

1. Compare the profile's category vector against `ChannelCluster.centroid` by cosine similarity to assign its cluster (+ a runner-up).
2. Rank channels the user isn't watching yet with:

   ```
   score      = 0.8·similarity + 0.1·metricMatch + 0.1·popularity
   similarity = 0.5·categoryCosine + 0.3·subCategoryCosine + 0.2·keywordJaccard
                (falls back to 0.7·category + 0.3·keyword if no sub-category info)
   ```
3. A per-cluster exposure cap guarantees **diversity**, and already-chosen and disliked channels are excluded.

---

## 4. AI video recommendations — `/discover` (Videos tab)

Gathers the latest videos from recommended channels and has an **LLM re-rank them by taste** (`lib/video-rerank.ts`). Zero YouTube API calls (RSS + cache).

1. Take a generous set of top channels from §3 (FANOUT 60).
2. Fetch recent videos from each channel's RSS, **excluding disliked and already-seen videos**.
3. Keep only **the single most recent unseen video per channel** → the candidate set is effectively a list of distinct channels, so no channel duplicates appear in the recommendations.
4. Feed the candidate list and my taste (summary/categories/keywords/liked-disliked channels) to the LLM to get a relevance-ranked top-15, each with a **one-line reason**.
5. **LLM provider fallback chain** (`lib/llm.ts`) — primary **Google Gemini** (free tier); on 429 (quota exhausted) it automatically switches to the secondary **Groq** (llama, free & fast). If both are exhausted, a "you've used today's free quota" notice is shown.
6. Results are cached, and like/dislike feedback feeds into the candidates and weights of the next recommendation.

---

## 5. Explore & experience algorithms — `/explore`, `/profile/[id]`, `/watch-as`

1. `/explore` — browse other people's public algorithms.
2. Click someone you're curious about to see their algorithm (categories/top channels/keywords) at `/profile/[id]`.
3. **Experience YouTube through their algorithm** (`/watch-as/[userId]`) — gather candidate channels from the target profile's top channels (30%) / keywords (40%) / categories (30%), round-robin interleave each channel's latest RSS videos into a feed, then link out to YouTube watch URLs (`lib/feed-builder.ts`).
4. The public/private toggle and follow (`/api/follow`) also live here.

---

## 6. Compare algorithms — `/compare`

1. Compare two profiles by a combined score of category **cosine + keyword Jaccard**.
2. **AI comparison comment** — feed both people's real names/categories/shared channels to an LLM to generate a 4–6 sentence comparative analysis (runtime + cache).
3. **Videos to watch together** — using latest videos from the intersection of both recommendation sets + shared channels of interest as candidates, the LLM re-ranks them by "both would enjoy this."
4. **Similar-user suggestions** (`/api/similar`) — among public profiles, recommend those with the highest combined category/keyword score relative to mine.

---

## 7. Chrome extension — "How close is the video I'm watching to my algorithm?"

While watching YouTube, shows the similarity between the current video and your algorithm as a score. See [`chrome-extension/README.md`](chrome-extension/README.md) for details.

1. **Connect profile** — `content.js` receives the userId the JJKC site sends via `window.postMessage`, validates the origin, and stores it in `chrome.storage.local` (manual entry also supported).
2. **Show profile** — fetch my categories/top channels/summary via `GET /api/profile/{userId}` and display them normalized into a 17-category standard vector.
3. **Collect current video** — `content.js` gathers the title/channel/official category/description/hashtags/keywords from the YouTube DOM and `ytInitialPlayerResponse`.
4. **Estimate video category** — call OpenAI `/v1/responses` in JSON-Schema strict mode to distribute the video across 17 categories summing to 100%. If there's no key or it fails, fall back to a lexicon + official-category based **DOM fallback**.
5. **Hybrid similarity** — sum `0.4·cosine + 0.4·related-category affinity + 0.2·keyword overlap` (hashtags weighted 1.5×) and scale via `5 + sqrt(raw)·95` to 5–100%, shown with a score breakdown, level, and comment.
6. **Anonymous satisfaction rating** — send a star rating and review via `POST /api/extension/reviews` with no personally identifying information.

---

## Tech stack

Next.js 15 (App Router) · TypeScript · Prisma (Neon Postgres in production / local SQLite mirror) · NextAuth (Google, for identity) · Tailwind · Upstash Redis (cache) · LLM: Gemini → Groq fallback (server), OpenAI (extension). At runtime the only external call is to channel RSS feeds (zero YouTube API keys).

> For data-pipeline details (collection strategy, rate-limit avoidance, lexicon tuning, cluster results) see [`main/README.md`](main/README.md); for extension internals see [`chrome-extension/README.md`](chrome-extension/README.md).
