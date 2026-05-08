# yt-algo-share — Prototype

Mock-data prototype of the YouTube algorithm sharing service described in
`../plan.md`. Runs end-to-end with no external services — Google OAuth,
Postgres, Upstash, and the YouTube API are all stubbed by a deterministic
in-memory dataset (`lib/mock-data.ts`). Replace those seams with real
clients when promoting from prototype to Phase 1 of the plan.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS for styling
- recharts for category radar/bar visualizations
- Prisma schema in `prisma/schema.prisma` (referenced, not executed)
- Cookie-based "demo auth" — pick a fake user from the landing page

## Run

```bash
cd JJKC_algorithm/prototype
npm install
npm run dev
# open http://localhost:3000
```

## What works

- `/` — landing page; pick any of 6 demo users to "sign in" as
- `/dashboard` — your AlgoProfile (radar, bar, channels, keywords, sample videos)
- `/explore` — list every public profile
- `/profile/[userId]` — someone else's profile + algorithm-driven feed
- `/compare?a=&b=` — radar chart of two profiles overlaid
- `POST /api/sync` — re-derive your profile (idempotent on mock data)
- `GET /api/profile/[userId]` — JSON profile
- `GET /api/feed/[userId]` — JSON feed (channels 30% / keywords 40% / categories 30%)
- `GET /api/explore` — list of public profiles
- `GET /api/compare?a=&b=` — categories side-by-side
- `POST/DELETE /api/follow/[userId]` — toggle follow (in-memory)

## Where the seams are

| Real service                | Mock seam                          |
| --------------------------- | ---------------------------------- |
| NextAuth + Google OAuth     | `lib/auth.ts` (cookie-based)       |
| Prisma queries to Postgres  | `lib/mock-data.ts`                 |
| YouTube Data API v3         | hard-coded channels / videos       |
| Upstash Redis cache         | not used (mock is already in-mem)  |

When swapping to real services, the API routes in `app/api/**/route.ts`
should be the only files whose internals change — their request/response
shapes are stable.

## Mock dataset

Six fictional users (Alex / Bora / Chris / Dana / Eun / Frank) with
deliberately different category distributions so the comparison and
explore views look meaningful. Channels and keywords are made up;
thumbnails come from `picsum.photos` so the page renders without
hitting YouTube.

## Limitations vs the plan

- No actual sync from YouTube. `POST /api/sync` just bumps `lastSyncedAt`.
- Follow state is held in a module-level Map; lost on server restart.
- No rate limiting, no encryption, no audit trail. Do not deploy as-is.
- Category names match `videoCategories.list` IDs only loosely
  (Tech / Music / Gaming / etc. picked for demo readability).
