# 유튜브 알고리즘 공유 서비스 구현 계획

## 서비스 개요

사용자가 자신의 유튜브 알고리즘(시청 패턴, 추천 영상 등)을 공유하고, 다른 사람의 알고리즘 기반 콘텐츠를 탐색할 수 있는 플랫폼.

---

## 핵심 기능 정의

### Phase 1 — 알고리즘 프로필 공유
- Google/YouTube OAuth 로그인
- 유튜브 시청 기록, 좋아요 목록, 구독 채널 수집
- 공개 "알고리즘 프로필" 생성 (카테고리 분포, 대표 채널, 관심 키워드)
- 프로필 공개/비공개 설정

### Phase 2 — 타인의 알고리즘으로 탐색
- 다른 사용자의 프로필을 기반으로 큐레이션된 영상 피드 노출
- "XXX의 알고리즘으로 보기" 모드
- 관심 알고리즘 프로필 팔로우

### Phase 3 — 커뮤니티 기능
- 알고리즘 비교 (나 vs 타인 — 카테고리 분포 시각화)
- 유사한 알고리즘 사용자 추천
- 알고리즘 트렌드 피드 (인기 급상승 공유 채널)

---

## 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| Frontend | Next.js 15 (App Router) | SSR/SSG, Vercel 배포 최적화 |
| Backend | Next.js API Routes | 모노레포 단순화 |
| DB | PostgreSQL (Neon) | 관계형 데이터, Vercel 마켓플레이스 연동 |
| ORM | Prisma | 타입세이프 쿼리 |
| Auth | NextAuth.js v5 | Google OAuth 내장 지원 |
| Cache | Upstash Redis | YouTube API 응답 캐싱, 쿼터 절감 |
| 외부 API | YouTube Data API v3 | 시청 기록·구독·좋아요 데이터 |
| 배포 | Vercel | CI/CD, Edge Functions |
| 스타일 | Tailwind CSS + shadcn/ui | 빠른 UI 구성 |

---

## 구현 절차

### Step 1 — 프로젝트 초기 설정

```bash
npx create-next-app@latest yt-algo-share --typescript --tailwind --app
cd yt-algo-share
npx prisma init
npm install next-auth@beta @auth/prisma-adapter
npm install @google-cloud/local-auth googleapis
npm install @upstash/redis ioredis
```

### Step 2 — Google OAuth + YouTube API 설정

1. [Google Cloud Console](https://console.cloud.google.com) 에서 프로젝트 생성
2. **OAuth 2.0 클라이언트 ID** 발급 (Web Application)
3. **YouTube Data API v3** 활성화
4. 필요한 OAuth 스코프 설정:
   ```
   https://www.googleapis.com/auth/youtube.readonly
   https://www.googleapis.com/auth/youtube.force-ssl
   ```
5. `.env.local` 구성:
   ```env
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   NEXTAUTH_SECRET=...
   DATABASE_URL=...
   UPSTASH_REDIS_URL=...
   UPSTASH_REDIS_TOKEN=...
   ```

> **주의:** YouTube Data API v3는 일일 쿼터(10,000 units)가 있으므로 Redis 캐싱 필수.

### Step 3 — 데이터베이스 스키마 설계

```prisma
model User {
  id            String   @id @default(cuid())
  googleId      String   @unique
  name          String
  image         String?
  accessToken   String   // YouTube API 호출용 (암호화 저장)
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
  topKeywords     String[] // 추출된 키워드 태그
  sampleVideoIds  String[] // 대표 영상 ID 목록 (최대 20개)
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

### Step 4 — YouTube 데이터 수집 파이프라인

```
사용자 로그인 (OAuth)
    │
    ▼
YouTube Data API 호출
    ├── videos.list (liked videos)        → likeRating: like
    ├── subscriptions.list                → 구독 채널 목록
    └── playlistItems.list (watch later)  → 나중에 볼 영상
    │
    ▼
카테고리 분포 계산
    ├── videoCategories.list로 카테고리 ID → 이름 매핑
    └── 채널별 비중 집계
    │
    ▼
키워드 추출
    └── 영상 제목/설명 → TF-IDF 또는 형태소 분석
    │
    ▼
AlgoProfile DB 저장 + Redis 캐싱 (TTL: 1시간)
```

> **한계:** YouTube는 개인 추천 피드 API를 공개하지 않음. 시청 기록(myRating, watch history)도 OAuth scope로 읽기 어려움. 실제 "추천 알고리즘"이 아닌 **좋아요·구독 기반 프로필**로 근사(approximation) 처리.

### Step 5 — 핵심 API 엔드포인트 구현

```
POST /api/sync              → YouTube 데이터 동기화 (AlgoProfile 갱신)
GET  /api/profile/[userId]  → 공개 알고리즘 프로필 조회
GET  /api/feed/[userId]     → 해당 사용자 프로필 기반 영상 피드
GET  /api/explore           → 전체 공개 프로필 목록
POST /api/follow/[userId]   → 팔로우/언팔로우
GET  /api/compare?a=&b=     → 두 사용자 알고리즘 비교
```

### Step 6 — 프론트엔드 주요 페이지

```
/                   → 랜딩 + 로그인
/dashboard          → 내 알고리즘 프로필 (카테고리 차트, 채널 목록)
/explore            → 공개 프로필 탐색
/profile/[userId]   → 타인 프로필 상세 + 영상 피드
/compare            → 두 알고리즘 비교 시각화
```

### Step 7 — 알고리즘 피드 구현 전략

타인의 프로필로 영상 피드를 만드는 방법:

1. **채널 기반**: 상대방의 상위 구독 채널에서 최신 영상 가져오기 (`playlistItems` API)
2. **키워드 기반**: 상대방 키워드로 YouTube Search API 호출
3. **카테고리 기반**: 카테고리 비중에 따라 영상 비율 조정

```
타인 프로필 로드
    │
    ├─ topChannels (30%) → 각 채널 최신 영상 N개
    ├─ topKeywords (40%) → 키워드 검색 결과 영상
    └─ categories  (30%) → 카테고리별 인기 영상
    │
    ▼
중복 제거 + 비중에 따라 셔플
    │
    ▼
유튜브 영상 임베드 (iframe API) or 썸네일 + 링크
```

### Step 8 — 시각화 (카테고리 비교)

```bash
npm install recharts
```

- **Radar Chart**: 나 vs 타인의 카테고리 분포 비교
- **Bar Chart**: 채널별 비중
- **Word Cloud**: 관심 키워드 시각화

---

## 주요 제약 및 해결 방안

| 제약 | 해결 방안 |
|---|---|
| YouTube 개인 추천 피드 API 없음 | 좋아요·구독 데이터로 근사 프로필 생성 |
| API 일일 쿼터 10,000 units | Redis 캐싱, 동기화 주기 제한 (최소 1시간) |
| 사용자 토큰 보안 | accessToken DB 암호화 저장 (AES-256), HTTPS only |
| 개인정보 보호 | 프로필 공개 여부 사용자 선택, 민감 데이터 미노출 |
| YouTube iframe 제약 | YouTube IFrame Player API 공식 사용 |

---

## 개발 우선순위 로드맵

```
Week 1  OAuth 로그인 + YouTube API 연동 + DB 구축
Week 2  AlgoProfile 생성 파이프라인 + 대시보드 UI
Week 3  공개 프로필 탐색 + 타인 알고리즘 피드
Week 4  비교 시각화 + 팔로우 기능
Week 5  캐싱 최적화 + 배포 (Vercel) + QA
```

---

## 확장 가능성

- **브라우저 확장 프로그램**: 실제 유튜브 페이지에서 타인 알고리즘 피드 오버레이
- **알고리즘 일기**: 주간 시청 패턴 변화 추적
- **그룹 알고리즘**: 여러 명의 프로필을 합산한 공유 피드 (모임, 가족 등)
- **알고리즘 챌린지**: "1주일간 타인의 알고리즘으로만 보기" 이벤트
