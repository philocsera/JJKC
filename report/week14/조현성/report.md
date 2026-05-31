# week14 — JJKC 최종 구현 정리: 기능과 구현 방식

> **JJKC**(`https://jjkc-algo-blush.vercel.app/`)는 내 시청 취향을 "알고리즘 프로필"로
> 만들어 **취향에 맞는 한국 유튜브 채널을 추천**하고, 그 알고리즘을 **다른 사람과 공유·비교**하는
> 서비스다. 핵심 설계 원칙은 **YouTube Data API 키·쿼터 없이** 직접 구축한 한국 채널
> 카탈로그(구독자 5만+ · 6천여 개) 위에서 동작하고, **서빙 시 외부 호출을 채널 RSS 로만**
> 한정한다는 것이다. 이 문서는 최종 구현된 기능 단위로 "무엇을 / 어떻게 구현했는지"를 정리한다.

---

## 0. 시스템 한눈에

```
[데이터 파이프라인 — 오프라인 1회/배치]
  검색 스크래핑 → RSS 보강·한글필터 → lexicon 분류 → k-means 클러스터 → catalog-seed.json
                                                                              │
[런타임 — 사용자 요청 시]                                                     ▼
  온보딩(3단계 or Google연동) → AlgoProfile 생성·저장 ── DB(Postgres/SQLite) ── 카탈로그
        │                                              │
        ├─ 추천(/discover): 코사인·자카드 + 클러스터 다양성 → (선택)Gemini 재랭킹
        ├─ 피드/워치애즈: RSS 인터리브
        └─ 공유·탐색·비교(/dashboard /explore /compare /profile): 프로필 유사도 + Gemini 인사이트
```

| 계층 | 기술 |
|---|---|
| 프레임워크 | Next.js 15 App Router · React 19 · TypeScript |
| DB / ORM | Prisma 6 + PostgreSQL(Neon, 정본) / SQLite(로컬) · NextAuth v5 |
| 캐시 | Upstash Redis(없으면 인메모리 자동 폴백) |
| 외부 호출 | 채널 RSS(`feeds/videos.xml`) + (선택)Gemini 재랭킹·요약 |
| 분류/클러스터 | 자체 lexicon 매칭 + 순수 TS k-means++ (외부 ML 의존성 0) |

---

## 1. 채널 카탈로그 데이터 파이프라인 (오프라인)

추천의 토대인 한국 채널 카탈로그를 **API 키 없이** 만드는 4단계. 전부 `jhs/scripts/`.

### 1.1 수집 — `discover-channels.ts`
- **YouTube 공개 검색 스크래핑**: `youtube.com/results?search_query=…&sp=…&hl=ko&gl=KR`(채널 필터)
  의 응답 HTML에서 `var ytInitialData = {…}` 를 떼어내 `channelRenderer` 노드를 파싱
  → `channelId`·`title`·`subscriberCountText`·`videoCountText` 추출.
- **continuation 페이지네이션**: 첫 페이지의 continuation token 으로 `youtubei/v1/search` 를
  반복 호출해 롱테일까지(쿼리당 최대 5페이지) 캔다. 쿼리 풀은 먹방·게임·뷰티·주식 등
  80여 개 한국 버티컬 니치.
- **구독자수 정규화**: "67.6만명"/"1.2억"/"1.2M" → 정수. 핸들(`@id`)이 구독자수로
  오파싱되는 케이스를 방어.
- **rate-limit 회피**: 동시성 2 + 요청 간 jitter(1.5~3s) + 429 지수 백오프(8→16→32s).
  구독자 5만 미만·기존 DB 중복을 거른 신규만 JSON 으로 적재.

### 1.2 보강·필터 — `enrich-discovered.ts`
- 채널별 **RSS 피드**(`feeds/videos.xml?channel_id=…`)로 최근 15개 영상 제목·메타 수집
  (429/503 시 4→15→45s 백오프 + 미처리분 보관).
- **외국 채널 제외**: `한글 비율 = 한글자/(한글자+영문자)` 가 **0.3 미만이면 제외** —
  영상 제목 기준으로 한국 콘텐츠만 남긴다.
- `classify()` 로 카테고리·키워드 산출, **Music(K-pop 등) 카테고리 제외**(프로젝트 정책),
  `uploadsPerMonth`·`mainstreamScore`·`nicheScore` 계산 후 `Channel` 테이블 upsert.

### 1.3 분류 — `lib/classify.ts` / `lib/subclassify.ts`
- **상위 14 카테고리**: `data/category-lexicon.ko.yaml`(가중치 붙은 한국어 키워드 사전)을
  `title+description+최근영상제목` 에 매칭해 `{ "Gaming": 45, "Comedy": 30, … }` 벡터 산출.
  영문·짧은 키워드는 `\b` word-boundary 매칭(`lol`이 `lollipop`에 안 걸리게), 한글은 substring 매칭.
  top-10 만 합=100 으로 정규화.
- **세부 57 카테고리**: `data/sub-taxonomy.ko.yaml`(부모 카테고리 아래 세분). 채널의 상위
  카테고리에 해당하는 **부모 게이팅**만 매칭해 `{ "Gaming/마인크래프트": 70 }` 부여 →
  "운동"이 Howto/People&Blogs 양쪽에서 오발하는 것을 차단.

### 1.4 클러스터링 — `lib/kmeans.ts` / `scripts/channels-cluster.ts`
- 채널 카테고리 벡터를 **L2 정규화**(코사인≈유클리드) → **k-means++** 초기화(D²-가중 시드) →
  할당/갱신 반복(빈 클러스터는 최원점 재시드, max 100회) → **실루엣 점수**로 best-k 선정.
- 결정론(Mulberry32 seed=42)이라 재현 가능, 외부 의존성 0(순수 TS). 결과는 centroid
  `{name:weight}` 로 저장 → 사용자 프로필과 같은 코사인 공간에서 비교(추천 다양성·라벨에 활용).

### 1.5 재현·협업 — `export-catalog.ts` / `restore-catalog.ts`
- DB의 `Channel`+`ChannelCluster` 만(사용자·토큰 제외) `data/catalog-seed.json` 으로 내보내고,
  복원 시 전체 삭제→500개 배치 재삽입(멱등, BigInt↔string 변환). clone 후
  `npm run db:push && npm run catalog:restore` 로 동일 카탈로그 재현.

### 1.6 로컬/프로덕션 DB 토글 — `gen-sqlite-schema.mjs`
- 정본 `schema.prisma`(Postgres)의 datasource 블록만 정규식 치환해 `schema.sqlite.prisma`
  (gitignore, `provider=sqlite`, `file:./dev.db`)를 **자동 생성**. 모든 필드가 스칼라라
  100% 호환 → 단일 진실 소스 유지하며 로컬 SQLite ↔ 프로덕션 Postgres 무드리프트 전환.

---

## 2. 인증 — NextAuth v5 (Google)

`lib/auth.ts`. Prisma 어댑터로 세션·계정을 DB에 저장. **두 개의 Google provider** 구성:

| provider | scope | 용도 |
|---|---|---|
| `google` (기본) | `openid email profile` | 가벼운 식별 로그인(YouTube 권한 없음) |
| `google-youtube` | `+ youtube.readonly`, `access_type=offline`, `prompt=consent` | 구독 자동 분석용 토큰 발급 |

- `/login` → `signIn("google")` → 성공 시 `/dashboard`.
- 세션 콜백에서 `session.user.id` 를 수동 주입(NextAuth 기본 세션엔 id 없음).
- 레거시 YouTube 토큰 컬럼은 호환을 위해 남기되 기본 로그인에선 채우지 않음.

---

## 3. 온보딩 — 알고리즘 프로필 생성 (`/onboard`)

선언형 폼과 Google 연동, **두 경로가 같은 `AlgoProfile` 산출물로 수렴**한다.

### 3.1 3단계 선언형 폼 (`components/onboard-form.tsx`)
1. **상위 카테고리** 다중 선택.
2. 선택한 카테고리의 **세부 관심사** 선택(`sub-taxonomy` 라벨 로드).
3. 세부에 해당하는 **채널 선택**: `/api/channels/by-subcategory` 가 세부 일치 + 부모
   카테고리 폴백으로 구독자순 상위 채널을 제시 → 다중 선택.
- 제출 시 `channelIds[]·categories[]·subCategories[]` 를 `/api/onboard` 로 POST(zod 검증).

### 3.2 프로필 변환 로직 (`lib/onboard-profile.ts`)
**행동 신호(선택 채널) 60% + 선언 신호(체크한 카테고리) 40%** 블렌드:
- 채널 쪽: 이미 분류·벡터화된 `Channel.categories`/`subCategories` 를 합산·정규화.
- 선언 쪽: 체크 항목을 동등 가중(100)으로.
- 결과를 합쳐 카테고리 top-10·세부 top-8 벡터를 만들고, `topChannels`(top-10)·
  `topKeywords`(선택 채널 키워드 빈도 top-12)·`metrics` 를 채워 `saveProfile()` 로 저장.
  원본 폼 입력은 `OnboardInput` 에 보존(재계산용), 프로필 캐시는 무효화.

**지표(`ProfileMetrics`, `lib/category-utils.ts`)**:
- `diversity` = 카테고리 Shannon 엔트로피(0–100), `concentration` = top-1 점유율,
- `mainstreamScore` = viewCount 중앙값 log10 스케일, `nicheChannelScore` = 구독자수 역로그,
- `languageDistribution`(한국 채널 → ko:100) 등.

### 3.3 Google 연동(구독 자동 분석) — `/onboard/google-connect` → `/onboard/google-sync`
- `signIn("google-youtube")` 로 `youtube.readonly` 동의 → `Account` 에 refresh_token 저장.
- `google-sync` 에서 토큰 갱신(`lib/youtube.ts`) 후 YouTube API v3 `subscriptions.list`
  페이지네이션으로 **구독 채널 id 전체**를 받아 **카탈로그와 매칭되는 것만** 필터 →
  그 채널 id 들로 동일한 `buildOnboardProfile()` 호출 → `/dashboard`.
  실패 시 `/onboard?google=<reason>` 로 사유 표시.
  (현재 운영 안내상 OAuth 테스트 사용자 등록 계정만 사용 가능.)

---

## 4. 채널 추천 (`/discover`)

### 4.1 점수 공식 — `lib/channel-recommender.ts`
```
점수 = 0.8·유사도(SIM_W) + 0.1·지표매칭(METRIC_W) + 0.1·인기도(QUALITY_W)
유사도 = 0.5·카테고리코사인 + 0.3·세부코사인 + 0.2·키워드자카드
         (세부 없으면 0.7·카테고리 + 0.3·키워드 폴백)
```
- 코사인은 `dot/(‖a‖‖b‖)`, 키워드는 자카드(교집합/합집합).
- 지표 매칭 = 사용자·채널의 niche/mainstream 차이를 100에서 차감.
- 인기도 = 구독자수 log 스케일. **서빙 시 외부 호출 0**(전부 사전계산 카탈로그).

### 4.2 클러스터 다양성 (MMR 류)
- `maxPerCluster`(기본 6) 로 한 클러스터에서 노출 가능한 채널 수를 제한.
  점수순 순회하며 상한 미달은 primary, 초과는 overflow 로 분리 → primary 우선으로
  limit 까지 반환. 고득점 편중을 막아 추천 다양성 보장. 이미 고른 채널은 제외.

### 4.3 (선택)Gemini 재랭킹·피드백 — `/api/discover/rerank`, `/api/discover/feedback`
- **버튼 클릭 시에만**(온디맨드) 추천 상위 18채널의 최근 영상을 RSS 로 모아(동시성 6),
  싫어요 영상 제외 후 후보 풀 구성 → **Gemini(gemini-2.5-flash-lite)** 로 top-15 재랭킹 +
  한 줄 이유 생성. 프로필 버전 기준 캐시(3h).
- `feedback` 은 `{videoId, action: like|dislike}` 를 DB 저장 → 다음 재랭킹 후보에서 반영.

---

## 5. 피드 생성 & 워치애즈

### 5.1 피드 빌더 — `lib/feed-builder.ts`
- 대상 프로필의 **대표 채널 30% + 키워드 40% + 카테고리 30%** 비율로 후보 채널을 모으고,
  채널별 필요 영상 수를 산출 → 3갈래 RSS 를 `Promise.all` 병렬 호출 → **round-robin
  인터리브**(videoId Set 으로 중복 제거) → YouTube watch 링크. 캐시 키에 프로필
  `lastSyncedAt` 을 버전으로 포함해 온보딩 재제출 시 자동 갱신.
- RSS 어댑터(`lib/sources/rss.ts`)는 fast-xml-parser 로 Atom 파싱, 429/503 을
  `RateLimitError` 로 구분. 채널별 최근영상은 30분 TTL 캐시(`lib/recent-videos.ts`).

### 5.2 워치애즈 — `/watch-as/[userId]`
- **타인의 알고리즘으로 보는 피드**. `/api/watch-as/rerank` 가 대상 사용자 프로필을
  입력으로 discover 와 동일한 재랭킹 파이프라인을 재사용. 캐시는 대상 프로필 버전 기준
  (뷰어 무관 공유 → Gemini 쿼터 절약). 미실행 상태는 블러 teaser 카드로 표시.

---

## 6. 공유 · 시각화 · 비교 · 소셜

### 6.1 대시보드 (`/dashboard`)
- `CategoryRadar`(Recharts, L2 정규화 벡터를 레이더로) + `CategoryBar`(백분율) +
  대표 채널 top-10 + 키워드 태그(12) + 메트릭(다양성·집중도 등) + 닮은 사용자 4명.

### 6.2 탐색 (`/explore`)
- `listPublic()` 로 공개 프로필을 모아 내 프로필과 `profileSimilarity()` 계산 →
  **가장 강하게 공유하는 카테고리별로 그룹핑**(공유 없으면 "그 밖의 사람들"). 5분 캐시.

### 6.3 비교 (`/compare`)
- 두 프로필 카테고리를 레이더에 **오버레이**, **공통 관심 채널**(교집합) 표시.
- `/api/compare/insight`: Gemini 가 4~6문장 한국어 비교 코멘트 생성(24h 캐시).
- `/api/compare/videos`: 두 사람이 다 좋아할 공통 영상 top-12 를 Gemini 로 재랭킹(3h 캐시).

### 6.4 타인 프로필 (`/profile/[id]`)
- 소유자 정보 + 레이더 + 대표 채널 + LLM 페르소나 요약(`/summary`, 40~60자) +
  워치애즈/비교 진입점. `/api/profile/[id]` 는 1h 캐시.

### 6.5 유사 사용자 (`/api/similar`)
- 기준 프로필 vs 공개 프로필들의 `profileSimilarity`(카테고리 코사인 0.7 + 키워드 자카드 0.3,
  0–100) 정렬 상위 N. 대시보드·탐색 추천에 사용.

### 6.6 팔로우 (`/api/follow/[userId]`)
- POST/DELETE 토글. 자기 자신 차단, 중복(P2002)·없음(P2025) 무시로 **멱등**.
  `Follow` 는 `(followerId, followingId)` 복합 PK. 프론트는 `useTransition` 으로 낙관적 토글.

---

## 7. 인프라 — 캐시 / 클러스터 API

- **캐시(`lib/cache.ts`)**: `CacheStore` 인터페이스로 Upstash Redis(REST) 와 인메모리를
  추상화. env 가 있으면 Upstash, 없으면 자동 폴백(HMR-safe). TTL = feed 30m·profile 1h·
  explore 5m·compare insight 24h·rerank 3h.
- **클러스터 API**: `/api/clusters`(전체, 1h 캐시), `/api/clusters/[id]`(멤버 채널 구독자순).
  `ChannelCluster` 는 centroid·topCategories·topKeywords·label·color 보관.

---

## 8. 핵심 설계 요약

1. **API 키 0 카탈로그** — 공개 검색 스크래핑 + RSS 로만 6천여 한국 채널 수집·분류·클러스터.
2. **벡터 단일 공간** — 채널/프로필/클러스터를 같은 카테고리 코사인 공간에 두어 추천·비교·
   유사도가 한 가지 수학으로 통일.
3. **두 온보딩 경로의 수렴** — 선언형 폼과 Google 구독 자동 분석이 동일한 `AlgoProfile` 로 귀결.
4. **서빙 외부 호출 최소화** — 추천 점수는 사전계산 카탈로그(외부 0), RSS 와 Gemini 재랭킹은
   온디맨드 + 프로필 버전 캐시로 호출량을 통제.
5. **로컬/프로덕션 비대칭** — 정본 Postgres 스키마를 건드리지 않고 datasource 치환만으로
   SQLite 로컬 미러를 자동 생성(week13 도입, 본 구현에 계승).

---

## 9. 한 줄 요약

> **공개 데이터로 만든 한국 채널 카탈로그를 카테고리 벡터 공간에 올려놓고, 그 위에서
> "내 알고리즘 만들기 → 추천 → 공유·비교"를 모두 같은 코사인/자카드 수학과 RSS·
> (선택)Gemini 재랭킹으로 구현했다. YouTube API 키 없이, 서빙 외부 호출은 RSS 로 최소화.**
