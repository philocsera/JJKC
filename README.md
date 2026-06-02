# 📺 JJKC — 한국 유튜브 채널 추천 · 알고리즘 공유

내 시청 취향으로 한국 유튜브 채널·영상을 추천받고, 내 "알고리즘"을 다른 사람과 공유·비교하는 서비스. **YouTube Data API(키·쿼터·OAuth) 없이** 직접 구축한 한국 채널 카탈로그 위에서 동작한다. 서빙 시 외부 호출은 채널 RSS 피드뿐이다.

🔗 https://jjkc-algo-blush.vercel.app/
📑 서비스 메커니즘 슬라이드 — https://philocsera.github.io/JJKC/

이 문서는 **각 기능이 내부적으로 어떻게 동작하는지** 를 단계별(1·2·3…)로 설명한다.

---

## 0. 토대 — 채널 카탈로그는 어떻게 만들어지나

모든 추천의 토대는 **구독자 5만+ 한국 채널 6,592개** 카탈로그다. 공개 데이터만으로 수집·분류·클러스터링한다 (서빙 시 외부 호출 0).

### 0-1. 수집 (`scripts/discover-channels.ts`, `enrich-discovered.ts`)

1. **YouTube 공개 검색 스크래핑** — `youtube.com/results?search_query=…` 의 `ytInitialData`(channelRenderer)에서 channelId·구독자수 텍스트를 파싱하고, continuation 토큰으로 롱테일까지 페이지네이션한다.
2. **니치 쿼리 풀 배치** — ~900개 한국 버티컬 쿼리(`data/overnight-queries.txt`)를 순차로 돌려 발굴한다. 중단되면 `scripts/resume-enrich.sh` 로 남은 쿼리만 이어서 재개한다.
3. **rate-limit 회피** — 요청 간 5~9초 + jitter, `CONSENT=YES` 쿠키로 EU 동의창 우회, 20건마다 burst pause, 동시성 1.
4. **RSS 검증** — 전 채널에 대해 `feeds/videos.xml?channel_id=…` 를 호출해 제목·영상 메타를 수집하고, **영상 제목의 한글 비율로 외국 채널을 제외**한다.
5. **필터** — 구독자 5만 미만·외국 채널·음악(K-pop 등) 카테고리는 제외한다. 전 과정에서 **API 키·OAuth·쿼터 0**.

### 0-2. 분류 (`lib/classify.ts`, `lib/subclassify.ts`)

1. 채널의 `title + description + 최근 영상 제목` 합본 텍스트를 만든다.
2. **상위 카테고리(14개)** — `data/category-lexicon.ko.yaml` 한국어 키워드 사전을 매칭한다. 한글은 substring, 짧은 영문(≤4자)은 word-boundary 로 매칭해 `{ "Gaming": 45, "Comedy": 30, … }` 벡터를 만든다 (YouTube 표준 15개 중 Music 제외).
3. **세부 카테고리(57개)** — 부모 카테고리 아래 세분(예: 게임 → 마인크래프트/롤/배그…). TF-IDF k-means 로 후보를 자동 발견하고 사람이 라벨링한 `data/sub-taxonomy.ko.yaml` 을 부모 게이팅 매칭해 `{ "Gaming/마인크래프트": 70 }` 을 부여한다.

### 0-3. 클러스터링 (`lib/kmeans.ts`, `scripts/channels-cluster.ts`)

1. 모든 채널의 카테고리 벡터를 모아 전역 vocabulary 를 만들고, 각 채널을 sparse 벡터로 → **L2 정규화**.
2. k=6~20 각각에 대해 **k-means++** 초기화 후 수렴까지 반복.
3. **실루엣 점수가 최고인 k** 를 best-k 로 선택 → **클러스터 16개** 생성.
4. centroid 를 `{ name: weight }` 형태로 저장한다. 사용자 프로필과 **같은 코사인 공간**에 있어 추천 다양성·라벨에 직접 쓰인다.

> 협업자 공유: `dev.db`(SQLite)는 git 제외지만 카탈로그는 `main/data/catalog-seed.json` 으로 커밋된다. clone 후 `cd main && npm install && npm run sqlite:push && npm run catalog:restore`. 파이프라인 상세는 [`main/README.md`](main/README.md) 참고.

---

## 1. 알고리즘 프로필 만들기 — `/onboard`

Google 로그인 후 **세 가지 방법** 중 하나로 만든다. 셋 다 최종적으로 동일한 `AlgoProfile`(카테고리·세부·키워드 벡터 + 지표)로 저장된다 (`lib/onboard-profile.ts`).

### 1-A. 직접 고르기 (3단계 폼)

1. **큰 카테고리** 를 고른다.
2. 그 카테고리의 **세부 관심사** 를 고른다.
3. 세부에 해당하는 **채널 중 관심 채널** 을 고른다.
4. 서버가 두 신호를 blend 한다 — 고른 채널의 카테고리 벡터(행동, 0.6) + 체크한 카테고리(선언, 0.4)를 각각 정규화 후 합산해 `categories` 를 만든다 (세부 카테고리도 동일 방식).
5. 고른 채널의 keywords 를 빈도순으로 모아 `topKeywords`, 카테고리 분포 엔트로피로 다양성·집중도 지표를 채운다.

### 1-B. 파일로 분석하기 (Google Takeout 업로드)

1. 사용자가 Google Takeout 시청 기록(`.json`/`.html`)을 업로드한다.
2. **브라우저에서** `lib/takeout-parser.ts` 가 파일을 파싱해 각 영상의 videoId·channelId·제목을 뽑는다 (서버로 원본 파일을 보내지 않음).
3. `POST /api/onboard/takeout` 가 시청 기록의 channelId 를 **빈도순으로 집계** 한다.
4. 카탈로그에 존재하는(=이미 분류·벡터화된) 채널만 추려 빈도 상위 10개를 고른다.
5. 그 채널 목록을 **1-A 와 동일한 빌더(`buildOnboardProfile`)** 에 넘겨 프로필을 만든다.

### 1-C. Google 연동 (YouTube 구독 자동 분석)

1. `/onboard/google-connect` 에서 `youtube.readonly` 권한으로 연동한다.
2. 내 **구독 채널 목록** 을 가져온다.
3. 구독 채널 중 카탈로그(한국 채널)와 일치하는 것만 추린다 (일치 0이면 `no_match` 안내).
4. 추린 채널을 **1-A 와 동일한 빌더** 에 넘겨 프로필을 만든다.

> 셋 다 공통: 입력 원본은 `OnboardInput` 으로 보존돼 나중에 "직접 고르기"로 다듬을 수 있고, 저장 직후 프로필 캐시는 무효화된다.

---

## 2. 대시보드 분석 — `/dashboard`

저장된 `AlgoProfile` 을 시각화한다.

1. 카테고리 분포(레이더), 대표 채널, 키워드 클라우드, 다양성·니치도 지표를 그린다.
2. **AI 한 줄 요약** — `생성` 버튼을 누르면 카테고리·키워드·대표 채널을 LLM 에 넘겨 40~60자 페르소나 문장을 만들어 `summaryText` 로 저장한다 (`lib/llm-features.ts`, build-time 1회).
3. **크롬 확장 연결** — 버튼을 누르면 `window.postMessage` 로 내 userId 를 확장 프로그램에 전달한다(아래 §7).

---

## 3. 채널 추천 — `/discover` (채널 탭)

프로필과 채널을 **같은 카테고리/세부 벡터 공간** 에서 비교해 랭킹한다 (`lib/channel-recommender.ts`). **외부 호출 0.**

1. 프로필 카테고리 벡터를 `ChannelCluster.centroid` 와 코사인 비교해 소속 클러스터(+2순위)를 정한다.
2. 아직 안 보는 채널을 다음 점수로 랭킹한다:

   ```
   점수 = 0.8·유사도 + 0.1·지표매칭 + 0.1·인기도
   유사도 = 0.5·카테고리코사인 + 0.3·세부카테고리코사인 + 0.2·키워드자카드
            (세부 정보 없으면 0.7·카테고리 + 0.3·키워드 로 폴백)
   ```
3. 클러스터별 노출 상한으로 **다양성** 을 보장하고, 이미 고른 채널·싫어요한 채널은 제외한다.

---

## 4. AI 영상 추천 — `/discover` (영상 탭)

추천 채널들의 최신 영상을 모아 **LLM 이 취향에 맞는 순으로 재랭킹** 한다 (`lib/video-rerank.ts`). YouTube API 호출 0 (RSS + 캐시).

1. §3 추천 상위 채널을 넉넉히(FANOUT 60) 잡는다.
2. 각 채널 RSS 에서 최근 영상을 가져오되, **싫어요·이미 본 영상을 제외** 한다.
3. **채널당 가장 최근 안 본 영상 1개** 만 후보로 넣는다 → 후보가 곧 "서로 다른 채널" 목록이라 추천에 채널 중복이 안 생긴다.
4. 후보 목록과 내 취향(요약·카테고리·키워드·좋아요/싫어요 채널)을 LLM 에 넘겨 관련성 순 top-15 와 **한 줄 추천 이유** 를 받는다.
5. **LLM 제공자 폴백 체인** (`lib/llm.ts`) — 1차 **Google Gemini**(무료 티어), 429(한도 소진)면 2차 **Groq**(llama, 무료·빠름)로 자동 전환. 둘 다 한도 소진이면 "오늘 무료 사용량 소진" 안내를 띄운다.
6. 결과는 캐시되며, 좋아요/싫어요 피드백은 다음 추천의 후보·가중치에 반영된다.

---

## 5. 알고리즘 탐색 · 체험 — `/explore`, `/profile/[id]`, `/watch-as`

1. `/explore` — 공개된 다른 사람들의 알고리즘을 둘러본다.
2. 궁금한 사람을 클릭하면 `/profile/[id]` 에서 그 사람의 알고리즘(카테고리·대표 채널·키워드)을 본다.
3. **그 사람 알고리즘으로 유튜브 체험** (`/watch-as/[userId]`) — 타인 프로필의 대표 채널(30%)·키워드(40%)·카테고리(30%)로 후보 채널을 모으고, 각 채널 RSS 최신 영상을 라운드로빈 인터리브해 피드를 만든 뒤 YouTube watch 링크로 연결한다 (`lib/feed-builder.ts`).
4. 공개/비공개 토글, 팔로우(`/api/follow`)도 여기서 한다.

---

## 6. 알고리즘 비교 — `/compare`

1. 두 사람의 프로필을 카테고리 **코사인 + 키워드 자카드** 종합 점수로 비교한다.
2. **AI 비교 코멘트** — 두 사람의 실제 이름·카테고리·공통 채널을 LLM 에 넘겨 4~6문장의 비교 분석을 생성한다 (runtime + 캐시).
3. **함께 볼 영상** — 양쪽 추천의 교집합 채널 + 공통 관심 채널의 최신 영상을 후보로, "둘 다 좋아할" 순으로 LLM 재랭킹한다.
4. **닮은 사용자 추천** (`/api/similar`) — 공개 프로필 중 나와 카테고리·키워드 종합 점수가 높은 순으로 추천한다.

---

## 7. 크롬 확장 프로그램 — "지금 보는 영상이 내 알고리즘과 얼마나 비슷한가"

유튜브 시청 중 현재 영상과 내 알고리즘의 유사도를 점수로 보여준다. 상세는 [`chrome-extension/README.md`](chrome-extension/README.md).

1. **프로필 연결** — JJKC 사이트가 `window.postMessage` 로 보낸 userId 를 `content.js` 가 출처 검증 후 `chrome.storage.local` 에 저장한다 (수동 입력도 가능).
2. **프로필 표시** — `GET /api/profile/{userId}` 로 내 카테고리·Top 채널·요약을 받아 17개 표준 카테고리 벡터로 정규화해 보여준다.
3. **현재 영상 수집** — `content.js` 가 유튜브 DOM·`ytInitialPlayerResponse` 에서 제목·채널·공식 카테고리·설명·해시태그·키워드를 모은다.
4. **영상 카테고리 추정** — OpenAI `/v1/responses` 를 JSON Schema strict 로 호출해 영상을 17개 카테고리에 합계 100%로 분배한다. 키가 없거나 실패하면 사전(lexicon)+공식 카테고리 기반 **DOM fallback** 으로 계산한다.
5. **하이브리드 유사도** — `0.4·코사인 + 0.4·관련카테고리 affinity + 0.2·키워드 겹침`(해시태그 1.5배 가중)을 합산하고 `5 + sqrt(raw)·95` 로 5~100% 로 스케일링해, 점수 분해·수준·코멘트와 함께 보여준다.
6. **익명 만족도 평가** — 별점·리뷰를 `POST /api/extension/reviews` 로 개인 식별 정보 없이 전송한다.

---

## 기술 스택

Next.js 15 (App Router) · TypeScript · Prisma (프로덕션 Neon Postgres / 로컬 SQLite 미러) · NextAuth (Google, 식별용) · Tailwind · Upstash Redis(캐시) · LLM: Gemini → Groq 폴백(서버), OpenAI(확장 프로그램). 런타임 외부 호출은 채널 RSS 피드뿐 (YouTube API 키 0).

> 수집 전략·rate-limit 회피·lexicon 튜닝·클러스터 결과 등 **데이터 파이프라인 상세는 [`main/README.md`](main/README.md)**, **확장 프로그램 동작 상세는 [`chrome-extension/README.md`](chrome-extension/README.md)** 참고.
