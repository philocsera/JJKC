# 📺 JJKC — 한국 유튜브 채널 추천

내 시청 취향을 입력하면 취향에 맞는 한국 유튜브 채널을 추천하고, 내 "알고리즘"을 다른 사람과 공유·비교하는 서비스. **YouTube Data API(키·쿼터·OAuth) 없이** 직접 구축한 한국 채널 카탈로그 위에서 동작한다.

🔗 https://ytalgoshare.vercel.app/

---

## 무엇으로 DB를 구성했나

추천의 토대는 **구독자 5만+ 한국 채널 4,753개** 카탈로그다. 공개 데이터만으로 수집·분류·클러스터링했다 (서빙 시 외부 호출 0).

### 1. 채널 수집 — 출처

| 출처 | 채널 수 | 방식 |
|---|---|---|
| **YouTube 공개 검색 스크래핑** | ~2,500 | `youtube.com/results?search_query=…` 의 `ytInitialData`(channelRenderer)에서 channelId + 구독자수 텍스트 파싱, continuation 으로 롱테일까지 페이지네이션 |
| **Playboard 랭킹** (14 카테고리 × top100) | ~1,135 | 사람이 붙여넣은 이름 리스트를 YouTube 검색으로 channelId 해결 |
| **외부 SQL 덤프 / 보강 수집** | ~1,116 | 구독자수·조회수 등 RSS 로 못 받는 메타데이터 보강 |
| **RSS 피드** (전 채널 검증) | 4,753 | `feeds/videos.xml?channel_id=…` 로 제목·영상 메타 수집 + **영상 제목 한글 비율로 외국 채널 제외** |

- 구독자 **5만 미만**과 **외국 채널**은 제외. **음악(K-pop 등) 카테고리는 프로젝트에서 제외**.
- 모든 수집은 공개 페이지/RSS 만 사용 — **API 키·OAuth 토큰·쿼터 0**.

### 2. 분류 — categories / subCategories

- **상위 카테고리 (14개)** — YouTube 표준 15개에서 Music 제외. `data/category-lexicon.ko.yaml` 한국어 키워드 사전을 `title + description + 최근 영상 제목` 에 매칭해 `{ "Gaming": 45, "Comedy": 30, … }` 벡터 산출 (`lib/classify.ts`).
- **세부 카테고리 (57개)** — 상위 카테고리 아래 세분 (예: 게임 → 마인크래프트 / 리그오브레전드 / 배틀그라운드 / 로블록스 …). 채널 keyword TF-IDF k-means 로 후보를 자동 발견한 뒤 사람이 라벨링 → `data/sub-taxonomy.ko.yaml`. `lib/subclassify.ts` 가 부모 카테고리 게이팅 매칭으로 `{ "Gaming/마인크래프트": 70 }` 부여.

### 3. 클러스터링

카테고리 벡터를 L2 정규화 → **k-means++ + 실루엣**으로 best-k 선정 → **클러스터 18개**(`lib/kmeans.ts`, `scripts/channels-cluster.ts`). centroid 는 `{ name: weight }` 로 저장돼 사용자 프로필과 같은 코사인 공간에서 비교되며, 추천 다양성·라벨에 쓰인다.

### 4. 재현 / 협업자 공유

`dev.db`(SQLite)는 git 에서 제외되지만, 카탈로그는 `jhs/data/catalog-seed.json` 으로 커밋된다 (사용자·토큰 데이터 미포함). clone 후:

```bash
cd jhs && npm install && npm run db:push && npm run catalog:restore
```

수집·분류 파이프라인 스크립트(`jhs/scripts/`): `discover-channels` → `enrich-discovered` → `reclassify-subcategories` → `channels-cluster` (+ `export-catalog` / `restore-catalog`).

---

## 어떤 기능이 있나

### 알고리즘 프로필 만들기 — `/onboard`
Google 로그인 후 **3단계**: ① 큰 카테고리 선택 → ② 그 카테고리의 세부 관심사 선택 → ③ 세부에 해당하는 채널 중 관심 채널 선택. 입력을 카테고리·세부·키워드 벡터와 지표(다양성·니치도 등)를 담은 `AlgoProfile` 로 변환한다. (구독·시청기록 권한 불필요 — 자기선언 기반)

### 채널 추천 — `/discover`
프로필과 채널을 **같은 카테고리/세부 벡터 공간**에서 비교해 랭킹한다:

```
점수 = 0.8·유사도 + 0.1·지표매칭 + 0.1·인기도
유사도 = 0.5·카테고리코사인 + 0.3·세부카테고리코사인 + 0.2·키워드자카드
         (세부 정보 없으면 0.7·카테고리 + 0.3·키워드 로 폴백)
```

클러스터별 노출 상한으로 다양성 보장, 이미 고른 채널은 제외. **추천 서빙 시 외부 호출 0** (`lib/channel-recommender.ts`).

### 알고리즘 공유 · 탐색 · 비교
- `/dashboard` — 내 알고리즘(카테고리 분포·대표 채널·키워드·지표) 시각화
- `/explore` — 공개된 다른 사람들의 알고리즘 둘러보기
- `/profile/[id]` — 타인 알고리즘 + 그 취향으로 만든 피드
- `/compare` — 두 알고리즘 비교, 닮은 사용자 추천(`/api/similar`), 팔로우, 공개/비공개 토글

### 피드 생성
타인 프로필의 대표 채널(30%)·키워드(40%)·카테고리(30%)로 후보 채널을 모아 각 채널의 RSS 최신 영상을 인터리브 → YouTube watch 링크로 연결.

---

## 기술 스택

Next.js 15 (App Router) · TypeScript · Prisma + SQLite · NextAuth (Google, 식별용) · Tailwind · Upstash Redis(캐시). 런타임 외부 호출은 채널 RSS 피드뿐 (키 0).

> 수집 전략·rate-limit 회피·lexicon 튜닝·메타데이터 출처·클러스터 결과 등 **기술 상세는 [`jhs/README.md`](jhs/README.md)** 참고.
