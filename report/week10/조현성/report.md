# week10 — `main/` 구현 메커니즘 분석

> Week09 의 `plan.md` 사양과 `rslt.md` 의 신호 확장안을 그대로 풀스택으로 옮긴
> 결과물(`/main`)을 메커니즘 관점에서 분해합니다. "무엇이 들어 있는가" 보다
> "어떤 입력을 어떻게 점수화·캐싱·인터리브 해서 출력하는가" 가 핵심입니다.

---

## 1. 스택 개요

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15 App Router + React 19 (RSC) | 페이지 = 서버 컴포넌트, mutations 만 client |
| 인증 | NextAuth v5 + Google OAuth + PrismaAdapter | scope `youtube.readonly`, `access_type=offline`, `prompt=consent` |
| DB | Prisma + SQLite (dev), Postgres 전환 자리 마련 | JSON 컬럼이 없어 `String` 직렬화 |
| 캐시 | `lib/cache.ts` — in-memory ↔ Upstash 자동 전환 | env 두 개 있으면 Upstash, 없으면 메모리 |
| 외부 API | YouTube Data API v3 (`googleapis@148`) | thin wrapper `lib/youtube.ts` |
| 시각화 | recharts (radar, bar) + 자체 keyword cloud | RSC 에서 wrapper 만 `"use client"` |

핵심 파일:

```
main/
├─ lib/
│  ├─ auth.ts          OAuth + 토큰 미러링
│  ├─ youtube.ts       YouTube API v3 thin wrapper
│  ├─ sync-service.ts  performAutoSync — 3차 fetch 파이프라인
│  ├─ profiler.ts      generateProfile — 신호 가중치 + 정규화 + metrics
│  ├─ feed-builder.ts  buildFeed — 채널/키워드/카테고리 인터리브
│  ├─ profile-service.ts  DB I/O (JSON ↔ String pack/unpack)
│  ├─ cache.ts         CacheStore 추상화 + TTL 상수
│  └─ keys.ts          캐시 key 빌더
└─ app/api/
   ├─ auth/[...nextauth]/  NextAuth 핸들러
   ├─ sync/                POST → performAutoSync
   ├─ profile/[userId]/    GET (cache)
   ├─ profile/visibility/  POST 공개/비공개 토글
   ├─ feed/[userId]/       GET (version-keyed cache)
   ├─ explore/             GET 공개 목록 (cursor pagination)
   ├─ follow/[userId]/     POST / DELETE
   ├─ compare/             GET ?a=&b=
   └─ similar/             GET ?userId= 유사도 추천
```

---

## 2. 전체 데이터 흐름

```
1) Sign-in (Google OAuth)
     └─► NextAuth `signIn` callback 이 access/refresh/expires 를
         User row 에 미러링 (PrismaAdapter 의 Account row 와 별개).
         ↳ lib/auth.ts:40~75

2) POST /api/sync (사용자가 "Re-sync" 클릭)
     └─► performAutoSync(userId)            (sync-service.ts)
           ├─ 1차 fetch (병렬, 5콜):
           │    videoCategories.list, subscriptions.list,
           │    videos.list myRating=like, playlists.list mine,
           │    activities.list mine
           ├─ 2차 fetch (병렬):
           │    channels.list (구독 채널 id batch),
           │    playlistItems.list × ≤5  (PLAYLIST_PROBE_LIMIT)
           ├─ 3차 fetch:
           │    videos.list?id=... (playlist 영상 메타)
           └─ generateProfile({...}) → saveProfile (upsert)
              └─ cache.del(profileCacheKey(userId))

3) /dashboard 또는 /profile/[id]
     └─► 서버 컴포넌트가 buildFeed(viewerId, targetId, total)
           ├─ getProfile(targetId)   ← DB
           ├─ visibility guard       ← 본인 외에는 isPublic 만
           ├─ cache.get(feedCacheKey(v, t, n, version=lastSyncedAt))
           └─ 캐시 미스면:
               ├─ channel slot  ▸ getChannelUploads(top3)  (×2 콜/채널)
               ├─ keyword slot  ▸ search.list (top4)       (★ quota 핵심)
               ├─ category slot ▸ videos.list chart=mostPopular (top3)
               ├─ toVideo 정규화 → interleave([ch, kw, cat])
               └─ cache.set(... TTL.feed=30분)
```

---

## 3. 프로필러 — `lib/profiler.ts`

### 3.1 입력 표면
`generateProfile` 은 5종 입력을 받아 한 사용자의 `AlgoProfile` 을 합성합니다.

| 입력 | 출처 호출 | profiler 내부에서 무엇이 됨 |
|---|---|---|
| `subscriptions` | `subscriptions.list mine=true` (snippet 포함) | 채널별 recency multiplier 산출 |
| `channelDetails` | `channels.list?id=...` (topicDetails + brandingSettings + statistics) | 카테고리 / 키워드 / 구독자수 / Top channels |
| `likedVideos` | `videos.list myRating=like` (snippet+topicDetails+contentDetails+statistics) | 가장 강한 신호. 카테고리·태그·duration·언어·view 분포 |
| `playlistVideos` | `videos.list?id=...` (본인 playlist 영상 메타) | 명시적 큐레이션 가중 |
| `activities` | `activities.list mine=true` | recency 부스트 (like / subscription 액션) |

### 3.2 가중치 표

`profiler.ts:38~46` 의 상수 그대로:

| 신호 | 가중치 | recency 변조 |
|---|---|---|
| 구독 채널의 `topicCategories` | `+2 × subRecencyMultiplier(channel)` | 구독일이 1년이면 1.0, 5년이면 ~0.4 |
| 좋아요 영상의 `videoCategoryId` | `+5 × publishBoost(video)` | 30일 1.5 / 90일 1.25 / 1년 1.0 / older 0.8 |
| 좋아요 영상의 `topicCategories` | `+3 × publishBoost` | 동상 |
| Playlist 영상의 `videoCategoryId` | `+4 × publishBoost` | 동상 |
| Activities `like` / `subscription` | `+1.5 × publishBoost × subRecency` | 액티비티 자체가 시간 신호 |
| 키워드 (좋아요 영상 tags + 채널 brandingSettings) | `+1 빈도` | 가중 없음 |

> 가중치 비율 (5 : 4 : 3 : 2 : 1.5) 은 **명시성** 순서입니다. 좋아요(능동) >
> 플레이리스트(큐레이션) > 좋아요 영상의 토픽(부수 신호) > 단순 구독 >
> 좋아요 액티비티(이미 좋아요로 카운트됨 — 중복 위험 줄이려 1.5).

### 3.3 Recency 모델

두 종류의 시간 가중이 직교로 곱해집니다.

```ts
recencyMultiplier(subscription.publishedAt)   // "이 채널을 언제부터 봤나"
  → 0.4 .. 1.0, 반감기 ~730일
recencyBoost(video.publishedAt)               // "이 신호가 최근의 것인가"
  → {30일:1.5, 90일:1.25, 365일:1.0, older:0.8}
```

→ 같은 카테고리라도 "최근 구독한 채널의 최근 영상" 이 가장 큰 점수,
"5년 전 구독 채널의 옛날 영상" 은 가장 작은 점수.

### 3.4 정규화

1. 모든 카테고리 누적 후 상위 10개만 남김.
2. 그 합으로 다시 나눠 0–100 백분율.
3. 합 ≤ 0 인 신규 사용자 → `{ Discovery: 100 }` fallback.

키워드는 상위 12개만, sampleVideoIds 는 최대 20개.

### 3.5 파생 지표 — `ProfileMetrics`

`rslt.md §4` 의 "API 호출 0 으로 만들 수 있는 신호" 를 모두 합쳤습니다.

| 지표 | 공식 | UI 라벨 |
|---|---|---|
| `diversity` | Shannon entropy `H(scores) / log(N)` × 100 | 잡식 ≥75 / 균형 ≥45 / 한우물 <45 |
| `concentration` | `top1 / sum` × 100 | "Top-1 share" |
| `shortsRatio` | ISO 8601 duration ≤60s 비율 | Shorts 위주 ≥60% / 섞어보는 ≥30% / Long-form 중심 |
| `longFormRatio` | ≥600s 비율 | 보조 배지 |
| `languageDistribution` | `defaultAudioLanguage` ("en-US"→"en") 빈도 | 6개까지 배지, primary 만 강조 |
| `mainstreamScore` | `log10(median(viewCount)) - 3) / 5 × 100`, clamp [0,100] | "Mainstream X/100" |
| `nicheChannelScore` | `100 - (log10(median(subscriberCount)) - 3)/4 × 100` | "Niche 취향러 ↔ Mega 채널" |

### 3.6 유사도

같은 파일 끝에 세 함수가 묶여 있습니다:

```ts
cosineSimilarity(a.categories, b.categories)
jaccardSimilarity(a.topKeywords, b.topKeywords)
profileSimilarity(a, b) = round((0.7 * cos + 0.3 * jac) * 100)
```

→ `0.7 × 카테고리 + 0.3 × 키워드` 가중 평균. 카테고리는 정수 백분율 벡터이므로
cosine 이 자연스럽고, 키워드는 unordered set 이라 Jaccard 가 자연스럽다.
이 함수가 `components/similar-users.tsx` 와 `/api/similar` 양쪽에서 재사용됩니다.

---

## 4. Sync 파이프라인 — `lib/sync-service.ts`

`performAutoSync` 는 3-pass fetch 입니다.

```
Pass 1 (5콜 병렬) ──────────────────────────────────
  videoCategories.list  → id→name 맵
  subscriptions.list    → channelId 목록 + 구독일
  videos.list myRating=like (50개)
  playlists.list mine   → 본인 큐레이션
  activities.list mine  → recency 신호

Pass 2 (병렬) ──────────────────────────────────────
  channels.list?id=<subscriptionChannelIds>   (1콜 / 50개 batch)
  playlistItems.list × ≤PLAYLIST_PROBE_LIMIT(5)

Pass 3 ─────────────────────────────────────────────
  videos.list?id=<playlistVideoIds dedup, ≤40>  (1콜 / 50개 batch)

→ generateProfile(...)
→ saveProfile (upsert, lastSyncedAt = now())
→ cache.del(profileCacheKey(userId))
```

### 4.1 쿼터 가드

`PLAYLIST_PROBE_LIMIT = 5`, `PLAYLIST_VIDEOS_PER = 10`,
`PLAYLIST_VIDEOS_TOTAL = 40` 이 sync 비용 상한을 결정합니다. cost.md 기준
**sync 1회 ≈ 6–12u**.

### 4.2 토큰 만료 처리

`googleapis` 가 401 / `e.code === 401` 을 던지면 사용자가 이해할 수 있는
"로그아웃 후 다시 로그인하세요" 문구로 재포장 (`sync-service.ts:97-103`).
refresh token 자동 갱신은 아직 적용하지 않은 채로 비워둠 — 데모에서는
"로그아웃 후 재로그인" 으로 충분.

### 4.3 invalidate 패턴

- **profile cache**: 명시적 `cache.del(profileCacheKey(userId))`
- **feed cache**: **명시적 invalidate 없음**. key 에 `version = lastSyncedAt.getTime()`
  을 박아 두므로 sync 가 일어나면 새 key 로 자연 갈아탐. 옛 key 는
  TTL.feed 만료까지 그대로 두지만 다시 조회되지 않으니 무해.
- **explore cache**: 별도 무효화 없음. TTL.explore = 5분으로 짧게.

---

## 5. 피드 빌더 — `lib/feed-builder.ts`

### 5.1 비율 결정

`plan §Step 7` 의 30/40/30 을 그대로 옮긴 식:

```
wantChannel  = round(total * 0.3)
wantKeyword  = round(total * 0.4)
wantCategory = total - wantChannel - wantKeyword   // 나머지 흡수
```

`total = 18` 기준 → 5 / 7 / 6.

### 5.2 슬롯별 픽

- **channel**: `topChannels.id` 상위 3 → 각 채널 `channels.list` 로
  uploads playlistId 받아 `playlistItems.list` (2콜 / 채널).
- **keyword**: `topKeywords` 상위 4 → 각각 `search.list` 호출.
  `safeSearch=moderate`, `type=video`.
- **category**: `categories` 키(이름)를 ID 로 매핑할 수 있는 것만 상위 3
  (Music=10, Gaming=20, …) → `videos.list chart=mostPopular`.

매핑 테이블 (`NAME_TO_CATEGORY_ID`) 는 region KR 에서 흔히 등장하는 16개만
하드코딩. 매핑되지 않는 카테고리(Wikidata topic 명, 예: "Hip hop music")는
자동으로 슬롯에서 빠짐 → 키워드/채널 슬롯이 자연 보충.

### 5.3 인터리브

```ts
interleave([ch, kw, cat], total)
```

1. 세 큐를 합쳐 전체 dedupe (id 기준). 같은 영상이 채널+검색 양쪽에 떠도
   먼저 만난 슬롯에만 남음.
2. round-robin: ch → kw → cat → ch → kw → cat → … 순서로 `total` 채울 때까지.
3. 출처는 `source: "channel" | "keyword" | "category"` 로 보존 → 디버깅용
   `feed {3+7+5}` 카운터를 dashboard 헤더에 노출.

### 5.4 캐시 키 = viewer × target × total × version

```ts
feedCacheKey(viewerId, targetId, total, lastSyncedAtMs)
  → "feed:v<ms>:<viewer>:<target>:<total>"
```

- `viewerId` 가 들어가는 이유: **호출자(viewer) 의 토큰으로 YouTube 를 친다.**
  즉 같은 target 이라도 viewer 가 다르면 cold cache. (계정별 quota 추적 보전.)
- `total` 까지 키에 들어가는 이유: limit 마다 sliced 결과가 달라짐.
- `version=lastSyncedAt` 이 sync 후 자동 무효화의 핵심.

### 5.5 실패 분기

`FeedResult` 는 단일 union:

```
{ ok: true,  videos, counts: {channel, keyword, category}, cacheHit }
{ ok: false, reason: "no_profile" | "no_token" | "private" }
```

각 reason 이 라우터에서 정확히 한 HTTP 코드로 매핑 (404 / 401 / 403).

---

## 6. 캐시 추상화 — `lib/cache.ts`

```ts
interface CacheStore { get, set, del }
```

- `MemoryCache`: `Map<key, {v, exp}>`, lazy expiry on `get`.
- `UpstashCache`: `@upstash/redis` REST 클라이언트, TTL 은 `ex` 옵션.
- 모듈 로드 시 env 검사 → 자동 선택. `globalThis.__cache` 에 핀해 Next.js
  HMR 사이클에서 인스턴스 다중화 방지.

TTL:

| 키 | TTL | 이유 |
|---|---|---|
| `profile:<id>` | 1h | plan §주요 제약 "sync 최소 1시간" 정책과 정렬 |
| `feed:v<ms>:<v>:<t>:<n>` | 30분 | 핫한 keyword search 결과는 빠르게 변동 |
| `explore:<cursor>:<limit>` | 5분 | 목록은 자주 새로 들어옴 |

---

## 7. DB 스키마 결정

`prisma/schema.prisma` 의 주요 분기:

- `provider = "sqlite"` 이라 **모든 JSON 필드를 `String` 으로 저장**.
  `lib/profile-service.ts` 가 read 시 `safeParse`, write 시 `JSON.stringify`
  를 도맡음. Postgres 로 옮길 때는 (1) provider 교체, (2) `Json` /
  `String[]` 타입 환원, (3) profile-service 의 stringify 제거 — 3 점만 만짐.
- `accessToken` / `refreshToken` 평문 저장. plan §주요 제약의 "AES-256 wrapper" 는
  자리표시만 — 데모 단계에서는 secret 을 환경변수로 한정.
- `User.googleId` 는 nullable. PrismaAdapter 의 Account row 가 진실 소스이고,
  User 의 token 컬럼은 **편의 미러링** (lib/auth.ts 의 `signIn` callback).

---

## 8. API 라우트 한 줄 요약

| 라우트 | 책임 | 캐시 | 가드 |
|---|---|---|---|
| `POST /api/sync` | `performAutoSync` 트리거 | profile 키만 invalidate | session 필수 |
| `GET /api/profile/[userId]` | 단일 프로필 조회 | TTL.profile (1h) | private + non-owner → 403 |
| `POST /api/profile/visibility` | isPublic 토글 | profile invalidate | session, zod body |
| `GET /api/feed/[userId]` | 알고리즘 피드 | version-keyed (buildFeed 내부) | session, private, no_token |
| `GET /api/explore` | 공개 목록 (cursor) | TTL.explore (5m) | — |
| `POST /DELETE /api/follow/[userId]` | follow toggle | — | self / private / not_found |
| `GET /api/compare?a=&b=` | 카테고리 rows + sharedKeywords | — | 둘 다 public 이거나 본인 |
| `GET /api/similar?userId=` | profileSimilarity 상위 N | — | 본인 프로필 필요 |

라우트 핸들러는 거의 전부 "권한 → 서비스 함수 → JSON" 의 thin shell.
모든 도메인 로직은 `lib/*` 에 모여 있음.

---

## 9. UI ↔ profiler 매핑

`ProfileMetrics` 의 각 필드는 정확히 한 UI 카드로 대응됩니다.

```
profiler.metrics.diversity          → ProfileMetricsCard "Diversity" + 라벨
profiler.metrics.concentration      → "Top-1 share"
profiler.metrics.shortsRatio        → "Shorts ratio" + Shorts 위주/섞어보는/Long-form
profiler.metrics.nicheChannelScore  → "Niche score" + Niche/Mega 라벨
profiler.metrics.languageDistribution → 언어 배지 (primary 만 accent)
profiler.metrics.mainstreamScore    → outline 배지
profiler.categories                 → CategoryRadar / CategoryBar
profiler.topChannels                → ChannelList
profiler.topKeywords                → KeywordCloud
profileSimilarity(me, others)       → SimilarUsers 카드, /compare 비교
```

---

## 10. 책임 분리 한 장 요약

```
┌──────────────────────┬────────────────────────────────────────────┐
│ HTTP shell           │ app/api/*/route.ts  (어디서 무엇을 부르나)   │
├──────────────────────┼────────────────────────────────────────────┤
│ Service              │ sync-service / profile-service / feed-builder │
│                      │  (도메인 로직, 트랜잭션 경계)               │
├──────────────────────┼────────────────────────────────────────────┤
│ Algorithm            │ profiler.ts  (입력 N종 → 카테고리/키워드/    │
│                      │   metrics; 순수함수 · 외부 IO 없음)         │
├──────────────────────┼────────────────────────────────────────────┤
│ External adapter     │ youtube.ts  (googleapis verbs 만 노출)      │
│ Persistence adapter  │ prisma.ts + profile-service unpack/pack    │
│ Cache adapter        │ cache.ts (Memory ↔ Upstash 자동 선택)       │
└──────────────────────┴────────────────────────────────────────────┘
```

순수 알고리즘은 외부 의존성이 0 이라 단위 테스트하기 쉽고, 외부 어댑터는
모두 옆에 적당히 모킹 가능한 위치에 있습니다 (Phase2 의 `JHS/test/helpers/fakes.ts`
의 정신을 그대로 가져온 분리).

---

## 11. 한계 · 다음 한 걸음

| 한계 | 해소 방향 |
|---|---|
| Feed cost ≈ 409u (cold) — 98% 가 `search.list` | `cost.md §5` A/B/C 옵션 (키워드 슬롯 축소 · trending 대체 · 채널 ID 캐싱) |
| `viewer × target` 키 → 공개 프로필도 viewer 마다 cold | option D: 공개 프로필은 `target × version` 공유 캐시 |
| 토큰 평문 + refresh 자동 갱신 없음 | `lib/crypto.ts` AES-256 wrapper, `events.session` 에서 refresh |
| 카테고리 이름 → ID 매핑 16개 하드코딩 | Wikidata Q-id 트리로 부모 카테고리까지 (`rslt.md §5`) |
| 댓글 / Watch History 신호 부재 | 댓글은 search 우회(100u/sync) — 옵션 토글, watch history 는 Takeout 외 길 없음 |
| SQLite | provider + 타입 두 줄 변경 + profile-service stringify 제거로 Postgres 즉시 전환 |

---

## 12. 한 줄 요약

> **`main/` 은 "5종 YouTube 신호 → 가중치/recency → 카테고리·키워드·metrics →
> 30/40/30 슬롯 인터리브 → version-keyed 캐시" 라는 한 흐름의 풀스택 구체화이며,
> 알고리즘(profiler) 과 IO(어댑터) 가 정확히 분리되어 cost 절감·신호 확장·
> DB 전환 셋 모두 작은 패치로 가능하도록 설계되어 있다.**
