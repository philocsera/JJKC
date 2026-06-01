# JJKC — Service Mechanism (Technical Reference)

Supplementary details behind the slide deck. JJKC profiles your YouTube "algorithm,"
recommends Korean channels/videos that match it, and lets you explore and compare other
people's algorithms. The defining constraint of the whole system: **it runs on a
self-built Korean-channel catalog and public RSS feeds — no YouTube Data API key, no
quota, no OAuth scope at serving time.**

> Figures here are read directly from the code and the committed catalog seed, so a few are
> more precise than the deck (which rounds "≈6,600 channels / 14 categories").

---

## 0. System at a glance

```
                 ┌─────────────────── build time (offline scripts) ───────────────────┐
  public search  │  discover ──► RSS enrich ──► classify ──► subclassify ──► cluster   │
  + RSS feeds ───►│  (scrape)     (Korean filter)  (lexicon)   (parent-gated)  (k-means)│
                 │                         ▼                                            │
                 │             Channel catalog (6,685 ch, 17 clusters)  ── committed ──►│ catalog-seed.json
                 └────────────────────────────────────────────────────────────────────┘
                                           │  (restored into DB on deploy)
                 ┌──────────────────────── serving time (zero YouTube API) ────────────┐
   user input ──►│  AlgoProfile  ──►  channel ranking (pure DB math)  ──►  RSS latest   │
  (3 methods)    │  (vectors)        0.8·sim+0.1·metric+0.1·quality      videos/channel │
                 │                                     ▼                                 │
                 │                        LLM re-rank (Gemini) ──► Top-15 video feed     │
                 └───────────────────────────────────────────────────────────────────-─┘
```

- **Build time:** Python/TS scripts collect and label channels into a static catalog that is
  committed as a seed file (`main/data/catalog-seed.json`) and restored into the DB.
- **Serving time:** channel ranking is pure in-process math over the DB; the only network
  calls are public per-channel RSS feeds and one LLM provider for re-ranking.

---

## 1. The channel catalog (built without the YouTube API)

The recommendation foundation is a static table of **6,685 Korean YouTube channels** (all
with subscribers ≥ 50,000), grouped into **17 clusters**. It was assembled entirely from
public, unauthenticated endpoints.

### 1.1 Collection sources

`Channel.source` records provenance. Actual distribution in the committed seed:

| Source | Channels | How |
|---|---:|---|
| `yt-search` | 4,442 | Public search-results scraping → RSS-enriched (the dominant source) |
| `search` | 1,112 | Earlier public-search channel-ID resolver pass |
| `seed-enrich` | 1,083 | Original seed channels re-enriched from RSS |
| `playboard-scrape` | 45 | Names from Playboard top-100 lists, resolved via public search |
| `external-dump` | 3 | Survivors of an external SQL dump import |

Re-discovery upserts on `Channel.id`, so later search passes rewrote earlier rows — which is
why the dump/Playboard sources, large in the first build, are now minor.

### 1.2 Discovery — public search scraping (`scripts/discover-channels.ts`)

1. For each query, fetch `youtube.com/results?search_query=<q>&sp=EgIQAg%3D%3D&hl=ko&gl=KR`
   (the `sp` token restricts results to the **channel** search type).
2. Parse `ytInitialData` out of the HTML and walk it for `channelRenderer` nodes →
   `channelId` (must start with `UC`), title, subscriber text, handle.
3. Paginate the long tail via the internal `youtubei/v1/search` continuation endpoint
   (scraped `INNERTUBE` key/context), up to 5 pages per query.
4. **Subscriber parsing** understands Korean units (억/만/천), bare 명, and English M/K/B,
   with guards so auto-generated handles (`@100mishop`) aren't misread as "100M subs."
5. Keep only channels with **subscribers ≥ 50,000** that aren't already in the DB.

Rate-limit hygiene: concurrency 2, 1.5–3 s jitter between requests, exponential 429
backoff, give up a query after 5 consecutive 429s. Dedup keeps the max-subscriber record
per channel ID.

**Query pool** (`main/data/`): ~50 inline broad verticals + `overnight-queries.txt` (896
queries, a ~128-noun × 7-suffix expansion like `먹방`/`먹방 추천`/`먹방 채널`…) +
`niche-queries.txt` (159 hand-curated long-tail verticals) + `remaining-queries.txt` (168,
the resume pool when an overnight run is interrupted).

### 1.3 Enrichment & Korean-language filtering (`scripts/enrich-discovered.ts`)

For each discovered channel:

1. **RSS fetch** `feeds/videos.xml?channel_id=…` (the only network call — key-free, official
   Atom endpoint). 429/503-aware backoff `[4, 15, 45] s`; a persistent throttle trips a
   circuit breaker that writes the remainder for later resume.
2. **Korean filter — Hangul ratio.** Combine the feed title + recent video titles/descriptions;
   `hangulRatio = #[가-힣] / (#[가-힣] + #[a-zA-Z])`. **Below 0.3 → discarded as foreign.**
3. **Classify** the combined text (§2) → category vector + keywords.
4. **Music exclusion** — drop the channel if its dominant category is `Music` (Music is
   unsupported project-wide).
5. **Upsert** into the catalog (the discovered subscriber count is trusted, since RSS never
   exposes it).

A separate title-script heuristic (`remove-foreign-channels.ts`) removes channels whose
title has no Hangul and matches Vietnamese/CJK/Thai/Cyrillic/Arabic/Devanagari scripts,
cascading the removal through every profile and similar-channel list.

### 1.4 Per-channel metadata stored

`id, title, handle, thumbnail, description, subscriberCount, videoCount, viewCount, country,
isKorean, categories (JSON {name:0–100}), subCategories (JSON {"Parent/Sub":0–100}),
keywords (JSON []), metrics (JSON {mainstreamScore, nicheScore, uploadsPerMonth}), clusterId,
similarChannelIds (JSON [{id,score}]), source, timestamps.`

Metric formulas (log10-scaled, `lib/category-utils.ts`):

```
mainstreamScore(medianViews) = clamp(0,100, round(((log10(views) − 3) / 5) · 100))   // 1k≈0, 100M≈100
nicheScore(subscribers)      = clamp(0,100, round(100 − ((log10(subs) − 3) / 4) · 100)) // 1k≈100, 10M≈0
uploadsPerMonth              = round(videoCount / spanDays · 30, 1)                     // from RSS dates
```

---

## 2. Classification — categories & subcategories

The classifier is **deterministic and offline** — a Korean keyword lexicon, **not an LLM**.
It runs in batch scripts to populate `Channel.categories` / `Channel.subCategories`; the LLM
is used only for prose features (summaries, compare insight, video re-ranking).

### 2.1 Category namespace

`CATEGORY_NAMESPACE` (`lib/categories.ts`) has **17 keys**:

`Gaming, Comedy, Entertainment, 요리·먹방, 뷰티·패션, 생활·하우투, Science & Technology,
Education, News & Politics, Sports, People & Blogs, Travel & Events, 영화, 애니메이션,
Autos & Vehicles, Pets & Animals, Nonprofits & Activism`.

- `Music` and `Food` are intentionally excluded (`Food` exists only as an internal lexicon
  label that is aliased into `요리·먹방`).
- The deck's **"14 categories"** comes from the radar **fingerprint** view, which merges three
  pairs (`영화·애니메이션`, `예능·코미디`, `과학·교육`) into single display axes — 14 axes split
  into two radars, "엔터·취미" and "정보·생활."

### 2.2 How a channel is classified (`lib/classify.ts`)

Over the channel's `title + description + keywords` (+ recent video titles in RSS scripts):

1. **Lexicon matching** against `data/category-lexicon.ko.yaml`. Korean keywords →
   substring match; short ASCII keywords (≤4 chars) → word-boundary regex (so `lol` doesn't
   match `lollipop`); each hit adds the keyword's weight (1, or 2–3 for strong signals) to
   its category.
2. Optional `hintCategory` prior (weak, weight 1.5).
3. **Alias redistribution** (`Food → 요리·먹방`).
4. **Normalize** with `normalizeTopN(scores, 10)` → keep top-10 categories, rescale to sum ≈ 100.
5. **Keywords** → up to 12 (matched lexicon terms first, then top-frequency tokens minus a stoplist).

Output: `Channel.categories = {"Gaming": 45, "Entertainment": 30, …}`. The lexicon carries
many documented false-positive purges (e.g. bare `차`/car removed because it hits 출발/차이;
replaced with `중고차`, `차박`). Reported average hit-rate after tuning ≈ 43.6%; a future
embedding-based classifier is noted as planned.

### 2.3 Subcategories (`lib/subclassify.ts`)

**71 subcategories across the 14 valid parents** (the deck's "57" is a stale figure). Same
matching rules, plus **parent-category gating**: a parent's subs are only scored if that
parent already has a non-zero category score (prevents e.g. "운동/exercise" firing under two
parents). Score per sub = count of distinct keyword hits → `normalizeTopN(_, 5)`. Stored as
`{"Gaming/마인크래프트": 70}`.

Examples per parent: Gaming 8 (마인크래프트, 리그오브레전드, 배틀그라운드, 로블록스, 모바일게임,
콘솔·고전, FPS·슈팅, 스트리머), News & Politics 8 (재테크·경제, 국내주식, 미국주식, 코인,
부동산, 시사·정치평론, 방송사뉴스, 정당정치), 요리·먹방 7 (먹방, ASMR, 길거리음식, 요리·레시피,
한식·집밥, 베이킹·홈카페, 자취요리), Education 6, Science & Technology 5, Sports 5,
Travel & Events 5, Autos 5, etc.

The taxonomy was hand-curated from a TF-IDF + k-means cluster proposer
(`scripts/discover-subcategories.ts`); the raw clusters were noisy (silhouette ≈ 0.045),
which is exactly why a human labeled the final set.

---

## 3. Clustering

A pure-TypeScript k-means (zero ML dependencies, `lib/kmeans.ts`) groups channels by their
category vectors so the centroid lives in the **same namespace as user profiles** and can be
compared by cosine directly.

- **Vectors:** each channel's `categories` (÷100) placed in a sorted category vocabulary, then
  **L2-normalized** so Euclidean distance ≈ cosine distance.
- **k-means++ init**, deterministic RNG (seed 42), Lloyd iterations (≤100), empty clusters
  reseeded to the farthest point.
- **Best-k by silhouette:** sweep `k = 6 … min(20, n/8)`, run full k-means per k, pick the
  highest mean silhouette. The current catalog landed on **k = 17** (an earlier ~2,200-channel
  catalog gave 16 at silhouette 0.434).
- **Stored centroid** is *not* the raw k-means centroid: it's the mean of members' real
  `categories` maps → `normalizeTopN(_, 12)`, kept in the profile namespace. Each cluster
  also stores a `label` (top-2 categories joined by " · "), top keywords, size, and a color.

**Channel-to-channel similarity** is precomputed separately
(`scripts/compute-channel-similarity.ts`): within each cluster bucket (to avoid N²), score
every pair with the same `profileSimilarity` metric (§5.1) and store each channel's top-12
peers in `similarChannelIds`. Used for the "similar channels" UI and to exclude channels
related to ones the user disliked.

---

## 4. The algorithm profile (`AlgoProfile`)

The central per-user object. Every structured field is stored as a JSON string and parsed in
`lib/profile-service.ts`.

| Field | Meaning |
|---|---|
| `categories` | category vector `{name: %}`, top-10, sums ≈ 100 |
| `subCategories` | `{"Parent/Sub": %}`, top-8 |
| `topChannels` | up to 10 representative channels `{id,name,thumbnail,videoCount}` |
| `topKeywords` | up to 12 keywords (ordered list) |
| `metrics` | diversity, concentration, shorts/long-form ratio, language dist, mainstream/niche scores |
| `subscribedChannelIds` | "already watching" set, excluded from recs |
| feedback sets | `likedChannelIds`, `dislikedChannelIds`, `likedVideoIds`, `dislikedVideoIds`, `shownVideoIds` (FIFO ≤300) |
| `summaryText` | one-line LLM persona summary |

`metrics.diversity` = Shannon entropy of the category map ÷ log(N) × 100;
`concentration` = top-1 category share; `mainstreamScore`/`nicheChannelScore` averaged from
the chosen channels' metrics.

### 4.1 Three input methods — all converge on one builder

All three live methods feed **`buildOnboardProfile`** (`lib/onboard-profile.ts`), which builds
the vector purely from the **pre-vectorized catalog** — it never calls the YouTube Data API.
(A richer behavioral profiler exists in `lib/profiler.ts` but is dormant / unused.)

The builder blends **behavioral (channels) 0.6 / declared (categories) 0.4**:

```
channelAgg = Σ catalog-channel categories     → normalizeTopN(_, 15)
checkedAgg = 100 per checked category          → normalizeTopN(_, 15)
blended    = 0.6·channels + 0.4·declared       → categories = normalizeTopN(blended, 10)
            (if only one side is present, that side gets weight 1.0)
```

| Method | Input | How channels are chosen |
|---|---|---|
| **A — Google Sign-in** | `youtube.readonly` subscriptions list | subscriptions ∩ catalog; first 10 (no frequency weighting); full set saved as `subscribedChannelIds` |
| **B — Takeout upload** | watch-history `.json`/`.html` | parsed **client-side**; channel IDs counted by **watch frequency**; top-10 by frequency ∩ catalog |
| **C — Direct selection** | pick categories → subcategories → channels | the only method that supplies declared `categories`/`subCategories`, so the only one exercising the 0.6/0.4 blend |

Raw inputs are stored in `OnboardInput` so the profile is reproducible/editable.
`recomputeProfileWithFeedback` always rebuilds from the original onboarding input merged with
likes minus dislikes, so feedback never compounds.

---

## 5. Recommendation engine

Two layers sharing one metric namespace: **channel ranking** (pure DB, zero network) and the
**video pipeline** (RSS fan-out + LLM re-rank).

### 5.1 Channel score (`lib/channel-recommender.ts`)

```
score = round( 0.8·profileSimilarity + 0.1·metricMatch + 0.1·qualityPrior )     // each 0–100

profileSimilarity =  round( (0.5·categoryCosine + 0.3·subCategoryCosine + 0.2·keywordJaccard)·100 )
            (fallback, when either side lacks subcategories — common):
                     round( (0.7·categoryCosine + 0.3·keywordJaccard)·100 )

metricMatch  = clamp(0,100, 100 − (|nicheDiff| + |mainstreamDiff|)/2)            // taste-scale fit
qualityPrior = clamp(0,100, round(((log10(subscribers) − 5) / 3)·100))          // 100k subs→0, 100M→100
```

So **taste similarity dominates (0.8)**, with light corrections for niche/mainstream fit and
a weak popularity prior.

- **Diversity cap:** a soft MMR-style pass limits each cluster to `maxPerCluster` in the
  primary list (overflow still appears if there's room) — defaults `limit 24, maxPerCluster 6`.
- **Exclusions:** subscribed, representative, liked, and disliked channels, plus every channel
  precomputed as *similar to a disliked* channel.
- **Zero external calls** — ranking is Prisma + in-process math.

### 5.2 Video pipeline (`lib/video-rerank.ts`)

```
CHANNEL_FANOUT 60   PER_CHANNEL 12   RSS_CONCURRENCY 15   POOL_CAP 150   TOP_N 15
```

1. **Fan-out:** rank the top 60 candidate channels for the user (`maxPerCluster 8`).
2. **RSS latest videos:** fetch ~12 recent videos per channel, 15 concurrent
   (4.5 s timeout, one retry on empty — data-center IPs intermittently fail RSS; 30-min cache).
3. **Exclude** disliked videos and already-shown videos.
4. **Strict 1 video per channel:** take each channel's newest unseen video → candidate pool
   (≤150). Channel duplication is structurally impossible.
5. **LLM re-rank:** Gemini `gemini-2.5-flash-lite` returns a strict JSON array of indices +
   ≤18-char Korean reasons (temperature 0.4).
6. **Final Top 15** in LLM order, with a redundant channel de-dup safety net.

**Serving-path audit:** the only `fetch()` is the public Atom RSS endpoint
(`feeds/videos.xml`) — no `googleapis`, no API key. The LLM provider is the only other
external service touched. `/api/discover/rerank` enforces a per-IP **daily limit of 10**
(KST-day buckets, DB-backed, fail-open), caches 3 h, and rotates to unseen videos on repeat.
Video `like`/`dislike` feedback re-derives the profile and downstream ranking.

---

## 6. Social features

### 6.1 Similar users
`/api/similar` scores up to 100 public profiles with `profileSimilarity` (passing only
`categories` + `topKeywords`, so the 0.7/0.3 fallback path), sorts, and returns the most
similar. The dashboard widget links each to `/compare`.

### 6.2 Compare
Side-by-side of two profiles: a **category radar overlay** (union of category keys, top
10–12), **shared channels** (A's representatives ∩ B's representatives/subscriptions), shared
keywords, an optional **"both would like" video set** (LLM picks exactly **12**, 3 h cache),
and a 4–6 sentence **LLM compare insight** using the real names (24 h cache).

### 6.3 Watch-as
"Experience someone else's algorithm." Runs the §5.2 pipeline against the *target's* profile
(Top 15), auto-starting. The cache is **keyed on the target**, so all viewers share it for
quota efficiency.

### 6.4 Profile feed (`lib/feed-builder.ts`)
A blended feed from a profile, default 18 videos, weighted **channels 30% / keywords 40% /
categories 30%** (e.g. 5 / 7 / 6). Each branch resolves to channels (the target's
representatives, or catalog channels matched by keyword/category), pulls their RSS, then the
three branches are **round-robin interleaved** with global video de-dup. Every video links to
`youtube.com/watch?v=…`; 30-min cache.

---

## 7. LLM, caching, rate-limiting, auth

### 7.1 LLM routing & fallback (`lib/llm.ts`)
OpenAI-compatible `/chat/completions`, two providers in a fallback chain:

- **Primary — Gemini** (`gemini-2.5-flash` default; **`gemini-2.5-flash-lite` for video
  re-rank**, routed via `LLM_RERANK_MODEL` so the heavy, frequent rerank calls get a separate
  free-tier quota). Gemini calls send `reasoning_effort: "none"` (2.5 is a "thinking" model;
  otherwise it burns the token budget and returns empty).
- **Secondary — Groq** (`llama-3.3-70b-versatile`).

A provider returning HTTP 429 (quota) is skipped to the next; if all fail and at least one was
a 429, an `LlmQuotaError` surfaces a Korean "daily free quota used up" message. If no key is
set, features degrade to `null` gracefully.

### 7.2 Caching (`lib/cache.ts`)
In-memory by default; auto-switches to **Upstash Redis** when its env vars are present.
TTLs: feed 30 min, profile 1 h, explore 5 min, rerank/compare-videos/watch-as 3 h,
compare-insight 24 h. Cache keys embed a profile `lastSyncedAt` version + feedback counts so
re-onboarding or new feedback naturally invalidates.

### 7.3 Rate-limiting (`lib/rate-limit.ts`)
DB-backed daily counter (shared across serverless instances), keyed `action:ip:KST-day`. IP
is taken from `x-real-ip`/`x-forwarded-for` and sanitized. Only `/api/discover/rerank`
enforces a hard cap (10/day, fail-open); other LLM routes rely on caching + login + the
provider quota chain.

### 7.4 Auth (`lib/auth.ts`)
**Auth.js v5** + `PrismaAdapter`, database sessions, **two Google providers**:
`google` (lightweight `openid email profile` login) and `google-youtube` (adds
`youtube.readonly`, offline access, account-linking — used only for onboarding Method A).
The session callback injects `user.id`; the YouTube token columns are now treated as dead
since the live app runs on RSS/catalog rather than the Data API.

---

## 8. Chrome extension

A separate MV3 extension ("JJKC Algorithm Viewer") that scores **the video you're currently
watching** against your JJKC profile, in-page.

- **Connection bridge:** the site posts `{type: JJKC_CONNECT_EXTENSION, userId}` (origin-checked);
  the content script stores `userId` in `chrome.storage.local`.
- **Video metadata extraction:** reads `ytInitialPlayerResponse` + DOM (`title, channel,
  official category, keywords, hashtags, description`), guarding against YouTube's SPA
  navigation showing stale DOM.
- **Category estimation:** a **client-side OpenAI** call (separate from the server's
  Gemini/Groq stack) classifies the video into the **17 JJKC categories** with a strict JSON
  schema (`categoryScores`, `keywords`, `summary`, `confidence`); the local lexicon classifier
  is the fallback.
- **Similarity** (`calculateHybridSimilarity`): over the 17-category space,
  `raw = 0.40·cosine + 0.40·affinity + 0.20·keyword`, where *affinity* uses a hand-built
  category-affinity table (related categories partially credit each other) and *keyword* counts
  video terms found in the profile text (hashtags ×1.5). Final
  `score = round(5 + √clamp(raw) · 95)` → a 5–100 "match %," shown with a cosine/affinity/keyword
  breakdown and a level label (매우 높음 … 매우 낮음).
- **Satisfaction feedback:** rating (1–5) + text → `POST /api/extension/reviews`
  (anonymous, `ExtensionReview` table) → viewable on the site's `/admin` review dashboard.

---

## 9. Tech stack & deployment

- **App:** Next.js 15 (App Router) · TypeScript · Tailwind. Located in `main/`.
- **DB:** Prisma. Local dev = SQLite (`dev.db`, derived schema); production = **Neon Postgres**.
  The catalog (channels + clusters) ships as `main/data/catalog-seed.json` and is restored
  after `prisma db push`; user/auth data is never seeded.
- **Cache:** in-memory ↔ Upstash Redis.
- **LLM:** Gemini → Groq fallback.
- **Live service:** https://jjkc-algo-blush.vercel.app (Vercel CLI deploys; not Git-integrated).
- **This deck:** https://philocsera.github.io/JJKC/ (GitHub Pages, `/docs`).

**Serving-time external dependencies:** public channel **RSS feeds** + one **LLM provider**.
Nothing else — no YouTube Data API, no quota, no per-request OAuth.

---

*This document is generated from the source code as a companion to the slide deck; exact
weights, field names, and file paths are taken from `main/lib/*` and `main/data/*`.*
