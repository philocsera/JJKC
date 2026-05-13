# JHS — Phase 2 구현

[Phase2.md](../JHS/Phase2.md) 의 구현체. **포트-어댑터 패턴** 으로 외부 시스템(DB / YouTube API / Redis / 인증) 과 분리되어 있다.

## 무엇을 만들고, 무엇을 안 만드는가

| 영역 | 위치 | Phase 1 / prototype 책임 |
|---|---|---|
| 피드 결합 로직 (30/40/30) | `src/feed/` | — |
| 캐시 키 규약 + in-memory 폴백 | `src/cache/` | — |
| 팔로우 비즈니스 규칙 | `src/follow/` | — |
| 공개 프로필 탐색 | `src/explore/` | — |
| Next.js Route Handler 어댑터 예시 | `examples/` | — |
| **AlgoProfile 생성 / OAuth / Prisma 클라이언트** | — | Phase 1 (prototype/) |
| **Redis(Upstash) / YouTube googleapis 클라이언트** | — | Phase 1 인프라 |
| **NextAuth 세션 객체** | — | Phase 1 |

## 포트 (`src/ports.ts`)

외부 세계와의 경계. 이 인터페이스만 구현하면 JHS 코드를 어디든 끼울 수 있다.

```
ProfileRepo   findById / findPublic           ← Prisma 어댑터 필요
FollowRepo    follow / unfollow / list        ← Prisma 어댑터 필요
YouTubeClient channelUploads / search / popular ← googleapis 어댑터 필요
CacheStore    get / set                       ← Upstash 어댑터 필요 (또는 MemoryCacheStore 사용)
Clock         now / today                     ← 시간 의존성 (테스트용 주입)
```

## 디렉토리

```
src/
  types.ts            도메인 타입 (AlgoProfile, Video, ProfileCard …)
  ports.ts            외부 의존성 인터페이스
  clock.ts            SystemClock (실시간)
  feed/
    interleave.ts     비율 결합 + 중복 제거 + 일별 셔플
    sources.ts        채널/키워드/카테고리별 영상 수집 + 캐시
    builder.ts        buildFeed() 메인
  explore/
    list.ts           공개 프로필 페이지네이션
  follow/
    service.ts        follow / unfollow + 가드
  cache/
    keys.ts           yt:* / feed:* 키 빌더
    memory-store.ts   테스트/개발용 in-memory 캐시
test/
  helpers/fakes.ts    InMemoryProfileRepo / FakeYouTubeClient / FixedClock …
  *.test.ts           node --test 기반 단위 테스트
examples/
  route-feed.ts       Next.js Route Handler 결합 예시 (어댑터 위치 표시)
  route-follow.ts
  route-explore.ts
```

## 실행

```bash
cd JHS
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test (tsx 로더)
```

## prototype 과의 결합 시점

prototype 측 Phase 1 인프라가 준비되면, prototype 에 다음과 같은 어댑터 파일 하나만 추가하면 JHS 가 그대로 동작한다:

```ts
// prototype/lib/jhs-wiring.ts (Phase 1 이후 작성)
import { prisma } from "./prisma";
import { Redis } from "@upstash/redis";
import { google } from "googleapis";
// import { ... } from "@/jhs/...";  // JHS 패키지 경로

export const profileRepo: ProfileRepo = { /* prisma.algoProfile.findUnique 등 */ };
export const followRepo: FollowRepo = { /* prisma.follow.upsert 등 */ };
export const cache: CacheStore = { /* upstash.get / set */ };
export const youtube: YouTubeClient = { /* google.youtube('v3').xxx */ };
```

JHS 내부 코드는 prototype 의 어떤 모듈도 import 하지 않는다 — 결합은 어댑터 레이어에서만 일어난다.
