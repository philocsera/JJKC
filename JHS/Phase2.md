# Phase 2 구현 문서 — 타인의 알고리즘으로 탐색

> 본 문서는 [`plan.md`](../plan.md) §Phase 2 ("타인의 알고리즘으로 탐색") 의 구현 계획서이다.
> Phase 1 (OAuth 로그인 + AlgoProfile 생성) 이 완료되어 있다는 전제에서 출발한다.

---

## 1. Phase 2 목표

| 항목 | 내용 |
|---|---|
| 핵심 가치 | 자신의 추천 알고리즘이 아닌 **타인의 알고리즘으로 유튜브를 보는 경험** 제공 |
| 사용자 스토리 | "친구 A의 시청 취향이 궁금하다 → A의 프로필 페이지에서 A의 추천 피드를 본다 → 마음에 들면 팔로우한다" |
| 산출물 | 공개 프로필 탐색 페이지, 타인 알고리즘 피드, 팔로우 시스템 |

### 완료 기준 (Definition of Done)

- [ ] `/explore` 에서 공개 프로필 카드 목록을 볼 수 있다 (페이지네이션 포함).
- [ ] `/profile/[userId]` 에서 해당 사용자의 카테고리/키워드/채널 + **본인 명의의 피드** 가 함께 보인다.
- [ ] 로그인 사용자는 "이 사람의 알고리즘으로 보기" 모드를 토글할 수 있다.
- [ ] 팔로우/언팔로우가 동작하며, 대시보드에 "팔로우 중인 알고리즘" 섹션이 보인다.
- [ ] YouTube API 쿼터를 초과하지 않도록 캐싱이 적용되어 있다.
- [ ] 비공개 프로필은 절대 노출되지 않는다 (E2E 테스트로 보장).

---

## 2. 현재 상태 (prototype 기준)

`prototype/` 디렉토리에 mock 기반의 골격이 이미 존재한다. Phase 2 작업은 **mock 을 실데이터로 교체** 하는 것이 큰 줄기다.

| 경로 | 현재 상태 | Phase 2 작업 |
|---|---|---|
| `app/api/explore/route.ts` | mock 사용자 목록 반환 | DB 쿼리로 교체 |
| `app/api/profile/[userId]/route.ts` | mock AlgoProfile 반환 | Prisma 쿼리 + 공개 여부 가드 |
| `app/api/feed/[userId]/route.ts` | `buildFeed()` (mock 풀) | YouTube API + Redis 캐시 기반 실 피드 |
| `app/api/follow/[userId]/route.ts` | in-memory `setFollow` | Prisma `Follow` 모델 사용 |
| `app/profile/[userId]/page.tsx` | 정적 렌더 | 피드 컴포넌트 + 팔로우 버튼 추가 |
| `lib/feed.ts` | mock pool 셔플 | 실 데이터 소스 결합 로직으로 전면 재작성 |

> 비고: Prisma 스키마(`prototype/prisma/schema.prisma`) 에는 `Follow`, `AlgoProfile` 모델이 이미 정의되어 있으나, `AlgoProfile.isPublic` 필드만 있고 **User 수준의 공개 여부 가드**는 추가 검토 필요 (현재는 `AlgoProfile.isPublic` 으로 통일하는 것이 단순).

---

## 3. 구현 항목

### 3.1 공개 프로필 탐색 (`GET /api/explore`)

**목적**: `isPublic=true` 인 AlgoProfile 목록을 카드형으로 노출.

**쿼리 파라미터**
```
?cursor=<cuid>     커서 기반 페이지네이션 (이전 페이지 마지막 id)
?limit=20          한 번에 가져올 개수 (기본 20, 최대 50)
?sort=recent       recent | popular (followers 수 기준)
?category=Tech     특정 카테고리 비중이 높은 프로필 필터
```

**구현 스케치**
```ts
// app/api/explore/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = clamp(parseInt(searchParams.get("limit") ?? "20"), 1, 50);
  const cursor = searchParams.get("cursor") ?? undefined;

  const profiles = await prisma.algoProfile.findMany({
    where: { isPublic: true },
    take: limit + 1,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { id: true, name: true, image: true } },
      _count: { select: { user: { select: { followers: true } } } },
    },
  });

  const hasMore = profiles.length > limit;
  const items = profiles.slice(0, limit);
  return Response.json({
    items: items.map(serializeProfileCard),
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}
```

**카드에 노출할 정보** (응답 페이로드 최소화)
- 유저: `id`, `name`, `image`
- 프로필: 상위 카테고리 3개, 키워드 5개, 대표 채널 썸네일 3개
- 메트릭: 팔로워 수, 최근 동기화 시각

### 3.2 타인 알고리즘 기반 피드 (`GET /api/feed/[userId]`)

**핵심 로직**: plan.md §Step 7 의 30/40/30 비율 (채널/키워드/카테고리) 을 실 YouTube API 로 구현.

#### 3.2.1 데이터 소스 구성

```
입력: targetUser 의 AlgoProfile
  ├── topChannels      → channels.list 의 uploads 플레이리스트 → playlistItems.list
  ├── topKeywords      → search.list (type=video, q=keyword)
  └── categories       → videos.list (chart=mostPopular, videoCategoryId)
```

#### 3.2.2 쿼터 비용 (YouTube Data API v3)

| 호출 | 비용 (units) | Phase 2 빈도 |
|---|---|---|
| `playlistItems.list` | 1 | 채널당 1회 (상위 3채널 → 3) |
| `search.list` | **100** | 키워드당 1회 (상위 2키워드 → 200) |
| `videos.list (chart)` | 1 | 카테고리당 1회 (상위 2카테고리 → 2) |
| `videos.list (id=)` | 1 | 메타데이터 보강 시 batch (id 50개씩) |

> **search.list 비용이 압도적으로 비싸다** (100 units). 매 피드 요청마다 호출하면 일일 쿼터 10,000 을 50회 만에 소진. **반드시 캐싱** 해야 한다.

#### 3.2.3 캐싱 전략 (Upstash Redis)

```
Key                                  TTL    내용
─────────────────────────────────────────────────────────────────
yt:channel:{channelId}:uploads       6h    채널 최신 영상 25개
yt:search:{keyword}                  24h   키워드 검색 상위 25개
yt:popular:{categoryId}              12h   카테고리 인기 영상 25개
feed:{targetUserId}:v{profileVer}    1h    완성된 피드 (셔플 전 단계)
```

- `feed:` 키에 `profileVer` 를 붙여 AlgoProfile 이 재동기화되면 자동 무효화.
- 캐시 미스 시에만 YouTube API 호출 → 쿼터 절감.
- **셔플은 캐시 후** 단계에서 수행 (시드: `targetUserId|YYYY-MM-DD` → 하루 동안 안정적 순서).

#### 3.2.4 구현 스케치

```ts
// lib/feed.ts (전면 재작성)
export async function buildFeed(targetUserId: string, total = 18) {
  const profile = await getProfileWithVersion(targetUserId);
  if (!profile || !profile.isPublic) return null;

  const cacheKey = `feed:${targetUserId}:v${profile.version}`;
  const cached = await redis.get<Video[]>(cacheKey);
  if (cached) return shuffleForToday(cached, targetUserId).slice(0, total);

  const [byChannel, byKeyword, byCategory] = await Promise.all([
    fetchFromTopChannels(profile.topChannels.slice(0, 3)),  // 30%
    fetchFromKeywords(profile.keywords.slice(0, 2)),         // 40%
    fetchFromCategories(profile.categories.slice(0, 2)),     // 30%
  ]);

  const merged = interleaveByRatio(
    { items: byChannel, ratio: 0.3 },
    { items: byKeyword, ratio: 0.4 },
    { items: byCategory, ratio: 0.3 },
  );
  const deduped = dedupeByVideoId(merged);

  await redis.set(cacheKey, deduped, { ex: 3600 });
  return shuffleForToday(deduped, targetUserId).slice(0, total);
}
```

#### 3.2.5 접근 제어

```ts
// route.ts
const profile = await prisma.algoProfile.findUnique({ where: { userId } });
if (!profile || !profile.isPublic) {
  return Response.json({ error: "not found" }, { status: 404 });
  // 비공개는 404 로 응답 (존재 여부 노출 방지)
}
```

### 3.3 "XXX의 알고리즘으로 보기" 모드

#### UI 동선

```
/profile/[userId]
  ├─ 헤더: 아바타 + 이름 + 팔로우 버튼
  ├─ 카테고리 도넛 차트 (recharts)
  ├─ 대표 채널 그리드 (3×2)
  ├─ 키워드 칩
  └─ "이 사람의 알고리즘으로 보기" 토글 버튼
        └─ ON 시 페이지 하단에 피드 그리드 노출
            └─ 영상 카드: 썸네일 + 제목 + 채널명 + (호버 시 임베드 재생)
```

#### 클라이언트 구현

```tsx
// app/profile/[userId]/page.tsx
"use client";
const [feedOn, setFeedOn] = useState(false);
const { data: feed } = useSWR(
  feedOn ? `/api/feed/${userId}` : null,
  fetcher,
  { revalidateOnFocus: false }
);
```

- `feedOn=false` 일 때 fetch 하지 않아 쿼터 보호.
- 무한 스크롤은 Phase 2 범위에서 제외 (고정 18개). 추가는 Phase 3 에서 고려.

#### 영상 재생

YouTube IFrame Player API 공식 사용:
```tsx
<iframe
  src={`https://www.youtube.com/embed/${videoId}`}
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
/>
```
임베드 차단된 영상은 클릭 시 youtube.com 외부 링크로 폴백.

### 3.4 팔로우 시스템

#### API 계약

| 메서드 | 경로 | 동작 |
|---|---|---|
| `POST /api/follow/[userId]` | 팔로우 | `Follow` 레코드 생성 (idempotent) |
| `DELETE /api/follow/[userId]` | 언팔로우 | 레코드 삭제 |
| `GET /api/follow/me` | 내 팔로잉 목록 | 대시보드에서 사용 |

#### Prisma 구현

```ts
// 팔로우
await prisma.follow.upsert({
  where: { followerId_followingId: { followerId: me.id, followingId: userId } },
  create: { followerId: me.id, followingId: userId },
  update: {},  // 이미 존재 시 no-op
});
```

#### 가드 조건
- 자기 자신을 팔로우 불가 (`me.id === userId` → 400).
- 비공개 프로필 팔로우 시도 → 403.
- 미인증 사용자 → 401.

#### 대시보드 통합

```
/dashboard
  ├─ 내 AlgoProfile (기존)
  └─ "팔로우 중인 알고리즘" 섹션 (신규)
        └─ 각 카드 클릭 → /profile/[userId]
```

---

## 4. 데이터 흐름도

```
[사용자가 /profile/abc 방문]
        │
        ▼
[Server Component: 프로필 메타 SSR]
        │   ── prisma.algoProfile.findUnique (isPublic 가드)
        ▼
[클라이언트: "알고리즘으로 보기" 토글]
        │
        ▼
[GET /api/feed/abc]
        │
        ├── Redis: feed:abc:v{N}  ──hit──▶ 셔플 후 반환
        │                          └miss
        ▼
[buildFeed()]
        │
        ├── topChannels[0..2]   → Redis(yt:channel:*) ─miss→ playlistItems.list
        ├── topKeywords[0..1]   → Redis(yt:search:*)  ─miss→ search.list (100 units)
        └── categories[0..1]    → Redis(yt:popular:*) ─miss→ videos.list (chart)
        │
        ▼
[Interleave 30/40/30 → Dedupe → Cache (1h)]
        │
        ▼
[Daily shuffle → 18개 반환]
```

---

## 5. 보안 / 프라이버시

| 위협 | 대응 |
|---|---|
| 비공개 프로필 enumeration | 모든 비공개/존재하지 않음을 동일하게 `404` 로 응답 |
| 타인의 accessToken 유출 | **피드 생성은 서비스 계정 토큰 또는 호출자 본인 토큰** 으로만 호출 (target 의 토큰 사용 금지) |
| 쿼터 고갈 공격 | `/api/feed/*` 에 IP 당 분당 30회 rate limit (Upstash Ratelimit) |
| 팔로우 스팸 | 동일 사용자에게 5분 내 follow→unfollow→follow 반복 차단 |

> **중요**: Phase 2 피드 생성은 **타인의 OAuth 토큰을 사용하지 않는다**. AlgoProfile 에 저장된 메타데이터(채널 ID, 키워드, 카테고리)만으로 호출자의 토큰 또는 API key 로 YouTube API 를 호출한다. 이렇게 해야 토큰 유출 위험이 없다.

---

## 6. 테스트 시나리오

### 단위 테스트
- [ ] `interleaveByRatio()` 가 30/40/30 비율을 유지하고, 한 소스가 부족하면 다른 소스로 채우는지.
- [ ] `dedupeByVideoId()` 가 중복 videoId 를 제거하는지.
- [ ] `shuffleForToday()` 가 같은 날짜에 같은 순서를 반환하는지.

### 통합 테스트 (mocked YouTube API)
- [ ] `GET /api/feed/[publicUserId]` → 200 + 18개 영상
- [ ] `GET /api/feed/[privateUserId]` → 404
- [ ] 캐시 hit 시 YouTube API 가 호출되지 않는지 (spy 검증)
- [ ] `POST /api/follow/[self]` → 400
- [ ] 미인증 `POST /api/follow/*` → 401

### E2E (Playwright)
- [ ] 로그인 → `/explore` → 카드 클릭 → 프로필 페이지 진입 → 피드 토글 → 영상 18개 노출
- [ ] 팔로우 버튼 클릭 → 대시보드에 해당 프로필 카드 등장 → 언팔로우 → 카드 사라짐
- [ ] 비공개 사용자 URL 직접 접속 → 404 페이지

---

## 7. 작업 분해 (1주 기준)

| Day | 작업 | 산출물 |
|---|---|---|
| 1 | `/api/explore` 실 DB 화 + 페이지네이션 | API + 단위 테스트 |
| 2 | `lib/feed.ts` 전면 재작성 (3 소스 결합) | YouTube 클라이언트 wrapper 포함 |
| 3 | Redis 캐싱 레이어 + rate limit | 모든 yt:* / feed:* 키 동작 |
| 4 | `/profile/[userId]` UI (피드 토글, 영상 그리드) | 페이지 완성 |
| 5 | 팔로우 시스템 (API + 대시보드 섹션) | 기능 완성 |
| 6 | E2E 테스트 + 비공개 가드 검증 | 테스트 통과 |
| 7 | Vercel preview 배포 + QA + 캐시 히트율 측정 | 배포 |

---

## 8. 열린 결정 사항 (Open Questions)

1. **추천 정렬 알고리즘**: 셔플을 완전 무작위로 할지, 채널/키워드/카테고리를 **번갈아 노출** 할지 (사용자 체감 다양성).
   - 제안: interleave 후 라운드 로빈 (1채널 → 1키워드 → 1키워드 → 1카테고리 …)
2. **자기 자신 프로필 피드 보기**: 본인 프로필에서도 "내 알고리즘으로 보기" 가 가능하게 할지?
   - 제안: 가능하게 하되, 본인은 항상 접근 (`isPublic` 무시).
3. **팔로우 알림**: 새로 팔로우당했을 때 알림이 필요한지?
   - Phase 3 의 커뮤니티 기능으로 미룬다.
4. **국가/언어 필터**: search.list 호출 시 `regionCode=KR`, `relevanceLanguage=ko` 를 고정할지, 사용자 설정으로 노출할지?
   - 제안: Phase 2 는 KR/ko 고정, Phase 3 에서 사용자 설정으로 분리.

---

## 9. 참고 링크

- [YouTube Data API — Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- [Upstash Redis — Next.js Integration](https://upstash.com/docs/redis/sdks/javascriptsdk/getstarted)
- [Next.js 15 — Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [plan.md §Phase 2](../plan.md)
- [prototype 현 구현](../prototype/)
