# Week 10 보고서 — Phase 2 설계 및 코어 구현 (조현성)

## 1. 이번 주 작업 요약

| 산출물 | 위치 | 비고 |
|---|---|---|
| Phase 2 구현 설계 문서 | `JHS/Phase2.md` | API 계약·캐시 규약·보안·테스트 시나리오·1주 작업 분해 포함 |
| Phase 2 코어 구현 | `JHS/src/` | TypeScript, ESM, strict 옵션 풀로딩 |
| 단위 테스트 | `JHS/test/` | `node --test` + `tsx` 로더, **29/29 통과** |
| Next.js 결합 예시 | `JHS/examples/` | Route Handler 패턴만 시연 (실제 와이어링은 어댑터 레이어) |

핵심 결정 — **prototype/ 와 코어를 분리** 했다. prototype 의 실제 Phase 1 인프라(Prisma 클라이언트, NextAuth 세션, googleapis, Upstash)는 아직 mock 단계라, 거기에 결합하면 mock 의 가정에 오버핏되는 코드가 만들어진다. 그래서 JHS 코어는 **포트(interface) 만 정의** 하고 어댑터를 두지 않는 방식으로 작성했다.

---

## 2. Phase 2 설계 문서 (`JHS/Phase2.md`)

Phase 2 의 세 가지 핵심 기능(공개 프로필 탐색, 타인 알고리즘 기반 피드, 팔로우)을 구현 가능한 단위까지 분해.

- **§3.2 피드 구현** — `search.list` 호출 비용이 100 units (다른 호출의 100배) 이라 캐싱 정책을 설계의 1순위로 두었다. TTL 위계: `keyword 24h > popular 12h > channel 6h > feed 1h`.
- **§3.4 팔로우 가드** — self / private / not_found 응답을 명시하되, enumeration 방지를 위해 not_found 와 private 은 같은 외부 응답(HTTP 404)으로 매핑.
- **§5 보안** — 타인의 OAuth 토큰을 절대 피드 생성에 사용하지 않는다. AlgoProfile 의 메타데이터(채널 ID, 키워드, 카테고리)만 가지고 호출자 토큰 또는 서비스 키로 YouTube API 를 호출.
- **§8 열린 결정 사항** — 정렬(라운드 로빈 vs 셔플), 자기 자신 프로필 피드, 국가/언어 필터 등 4가지를 명시적으로 보류.

---

## 3. Phase 2 코어 구현 (`JHS/src/`)

### 3.1 디렉토리 구조

```
JHS/
├── Phase2.md
├── README.md
├── package.json          (tsx + typescript, 외부 런타임 의존성 0)
├── tsconfig.json         (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
├── src/
│   ├── types.ts          도메인 타입 (AlgoProfile, Video, ProfileCard ...)
│   ├── ports.ts          외부 시스템 인터페이스 4개 + Clock
│   ├── clock.ts          SystemClock
│   ├── feed/
│   │   ├── interleave.ts 30/40/30 라운드 로빈, dedupe, 시드 기반 셔플
│   │   ├── sources.ts    채널/키워드/카테고리 fetch + 캐시 경유
│   │   └── builder.ts    buildFeed() 오케스트레이션
│   ├── explore/list.ts   커서 페이지네이션 + recent/popular 정렬
│   ├── follow/service.ts follow / unfollow / listFollowing + 가드
│   └── cache/
│       ├── keys.ts       yt:* / feed:* 키 빌더 + TTL 상수
│       └── memory-store.ts 테스트·개발 폴백
├── test/                 node --test, 29 테스트
└── examples/             Next.js Route Handler 예시 + wiring 스텁
```

### 3.2 포트-어댑터 분리

`src/ports.ts` 에 외부 의존성을 4개 인터페이스로 묶었다:

```ts
ProfileRepo   findById(id) / findPublic({ cursor, limit, sort })
FollowRepo    isFollowing / follow / unfollow / listFollowing  (idempotent)
YouTubeClient channelUploads / searchByKeyword / popularByCategory
CacheStore    get / set
Clock         now / today  (시간 의존성 주입으로 결정론적 테스트)
```

JHS 코어 코드는 어떤 파일도 `prototype/` 의 모듈을 import 하지 않는다. prototype Phase 1 이 완성되면 다음과 같은 어댑터 파일 하나만 prototype 쪽에서 작성하면 결합 완료:

```ts
// 추후 prototype/lib/jhs-wiring.ts 형태로 작성
export const profileRepo: ProfileRepo = {
  async findById(id) { return prisma.algoProfile.findUnique({ where: { userId: id } }); },
  async findPublic({ cursor, limit, sort }) { /* prisma 쿼리 */ },
};
// followRepo / youtube (googleapis) / cache (Upstash) 도 동일 패턴
```

이렇게 두면:
- prototype 의 mock-data 가 진짜 Prisma 로 교체되어도 JHS 코어는 변하지 않는다.
- JHS 코어를 단독으로 typecheck + test 할 수 있다 (실제로 가능).
- 다른 개발자(예: Phase 3 작업자)가 같은 포트 위에 새 기능을 얹을 수 있다.

### 3.3 피드 결합 알고리즘 (`feed/interleave.ts`)

Phase2.md §8 의 결정사항대로 셔플 대신 **라운드 로빈** 으로 다양성을 보장.

```
한 사이클:
  bucket[0].next() → bucket[1].next() → bucket[2].next() → 반복
  각 버킷은 target (총량 × 비율) 까지만 소비
  한 버킷이 비면 다음 사이클에서 건너뜀
  total 미달 시 남은 항목으로 backfill
```

`shuffleForToday()` 는 `${userId}|${YYYY-MM-DD}` 시드의 Mulberry32 PRNG 기반 Fisher-Yates 셔플. 결과:
- 같은 날 같은 사용자 페이지 = 항상 같은 순서 (SSR 캐싱 가능)
- 날짜가 바뀌면 자동으로 재셔플 (체감 신선도 확보)

### 3.4 캐싱 정책 (`cache/keys.ts`)

```
yt:channel:{id}:uploads     TTL 6h    (1 unit/call)
yt:search:{keyword}         TTL 24h   (100 units/call — 가장 길게)
yt:popular:{categoryId}     TTL 12h   (1 unit/call)
feed:{userId}:v{version}    TTL 1h    (완성된 피드)
```

`profile.version` 필드를 키에 박아 넣어, AlgoProfile 이 재동기화되면 자동으로 feed 캐시가 무효화된다. 단, 소스 캐시(`yt:*`)는 version 과 독립이라 비용이 큰 search 호출은 24시간 동안 재사용된다 — 이게 핵심 쿼터 절약 포인트.

---

## 4. 테스트 결과

```
$ npm run typecheck
> tsc --noEmit
(no errors)

$ npm test
✔ 29 tests passed (0 failed)
  - cache.test.ts        4
  - explore.test.ts      6
  - feed.test.ts         7
  - follow.test.ts       7
  - interleave.test.ts   5
```

핵심 검증 케이스:

| 카테고리 | 검증 |
|---|---|
| 결합 비율 | `interleaveByRatio` 가 30/40/30 비율을 유지하고 한 버킷 부족 시 backfill |
| 셔플 결정론 | 같은 시드 → 같은 결과 / 다른 날짜 → 다른 결과 |
| 캐시 | 2회차 호출에서 `FakeYouTubeClient` 의 호출 카운터가 증가하지 않음 |
| 캐시 무효화 | profile.version 변경 시 `feed:*` 키는 갱신, `yt:*` 는 의도적으로 유지 |
| 비공개 가드 | private profile → `reason: "private"`, 호출자는 404 로 응답 |
| 팔로우 idempotent | 같은 사람 두 번 팔로우해도 관계 1개 |
| 팔로우 가드 | self / not_found / private 각각 다른 code |
| 비공개 전환 후 언팔로우 | 허용 (관계 정리 가능해야 함) |
| 페이지네이션 | 커서로 페이지 분할 시 중복 없음, limit 클램프 [1, 50] |

---

## 5. prototype 측 현재 상태와의 관계

prototype 은 mock 으로만 동작 중이며, 다음 항목들이 Phase 1 단계로 채워질 예정:

| prototype 영역 | 현 상태 | Phase 1 완료 후 |
|---|---|---|
| `lib/prisma.ts` | 존재 | 그대로 사용 |
| `lib/youtube.ts` | mock | googleapis 실호출로 교체 |
| `lib/mock-data.ts` | in-memory | 폐기 → Prisma 쿼리로 대체 |
| `app/api/feed/[userId]` | mock 풀 사용 | JHS `buildFeed()` 어댑터로 위임 |
| `app/api/follow/[userId]` | in-memory `Map` | JHS `follow()` 어댑터로 위임 |
| `app/api/explore` | mock 목록 | JHS `listExplore()` 어댑터로 위임 |

JHS 측에선 prototype 의 어떤 구체 구현도 import 하지 않으므로, 위 교체는 prototype 쪽 어댑터 한 파일에서만 일어난다.

---

## 6. 다음 주 (Week 11) 계획

1. **prototype Phase 1 작업과의 인터페이스 조율** — 현재 prototype 의 `prisma/schema.prisma` 에 `AlgoProfile.version` 필드가 없다. `updatedAt` 의 epoch ms 를 version 으로 쓸지, 별도 컬럼을 둘지 결정 필요.
2. **YouTube 어댑터 작성** — googleapis 호출을 `YouTubeClient` 포트에 맞추는 prototype 측 어댑터.
3. **Rate limit 추가** — Phase2.md §5 에 명시한 IP 당 분당 30회 제한 (Upstash Ratelimit).
4. **프론트엔드 통합** — `/profile/[userId]` 페이지에 "이 사람의 알고리즘으로 보기" 토글 + 영상 그리드.

---

## 7. 참고 링크

- 설계 문서: [`JHS/Phase2.md`](../../../JHS/Phase2.md)
- 구현 README: [`JHS/README.md`](../../../JHS/README.md)
- 코어 코드: [`JHS/src/`](../../../JHS/src/)
- 테스트: [`JHS/test/`](../../../JHS/test/)
- 결합 예시: [`JHS/examples/`](../../../JHS/examples/)
- 상위 계획: [`plan.md`](../../../plan.md)
