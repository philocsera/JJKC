현재 `youtube.readonly` scope 안에서 더 활용할 수 있는 정보 + 외부 소스까지 정리해 봅니다. **현재 코드(`lib/youtube.ts` + `lib/profiler.ts`)와의 갭** 위주로.

---

## 0) 지금 쓰는 것 (요약)

| 데이터 | 가중치 |
|---|---|
| 구독 채널의 `topicDetails.topicCategories` | +2 / topic |
| 좋아요 영상의 `videoCategoryId` | +5 / video |
| 좋아요 영상의 `snippet.tags` | 키워드 빈도수 |
| 채널 메타 (snippet, statistics.videoCount) | top channels 표시용 |

---

## 1) 이미 받고 있는데 **버려지는** 필드 (free wins — 코드 한두 줄 추가)

| 위치 | 필드 | 활용 아이디어 |
|---|---|---|
| `videos.list myRating=like` part=`topicDetails` | `topicCategories` (영상 단위) | 채널 topic 외에 **영상 단위 topic** 도 +N 가중. 같은 채널 안에서도 영상마다 주제가 달라 신호 풍부. |
| `videos.list myRating=like` part=`statistics` ✅ 새로 요청 | `viewCount`, `likeCount` | **대중성 점수**: 내가 좋아한 영상의 viewCount 중앙값 → "메인스트림 vs 마이너 취향" 한 지표 |
| `videos.list myRating=like` part=`contentDetails` | `duration` (ISO 8601) | **Shorts 비율** (≤ 60s) vs long-form. 시청 패턴 분류 |
| `videos.list myRating=like` snippet | `defaultAudioLanguage`, `defaultLanguage` | **언어 분포** — 모노링구얼/멀티링구얼 사용자 구분 |
| `videos.list myRating=like` snippet | `publishedAt` | **최신성 가중**: 최근에 올라온 영상을 더 좋아하는지 / 과거 영상도 발굴하는지 |
| `channels.list` part=`statistics` | `subscriberCount` | **니치 vs 메가**: 작은 채널 위주 구독자(취향러)인지, 대형 채널 위주(메인스트림)인지 |
| `channels.list` part=`brandingSettings` | `channel.keywords` | 채널 자체가 자기 정의한 키워드 — `topicCategories` 보완 |
| `subscriptions.list` snippet | `publishedAt` (구독 시작 시각) | **recency**: 최근 구독 = 현재 관심사 강조. 오래된 구독 = 장기 취향 |
| `subscriptions.list` part=`subscriberSnippet` | 구독자 수 / 채널 영상 수 | 위 subscriberCount 와 같은 신호를 한 번에 |

→ **이것만 적용해도 기존 호출 수는 그대로** (part 만 늘어남, quota 비용 동일 또는 +1).

---

## 2) 새로 부를 수 있는 엔드포인트

| 엔드포인트 | 가져오는 것 | 신호 강도 | 비용 |
|---|---|---|---|
| **`playlists.list mine=true`** | 사용자가 만든 재생목록 (제목/설명) | ★★★★ **명시적 큐레이션** — 좋아요보다 강한 의도 | 1u |
| **`playlistItems.list` (위 playlists)** | 각 playlist 의 영상들 | ★★★★ playlist 가중치로 영상별 분석 | 1u/playlist |
| **Watch Later (`playlistId=WL`)** | 나중에 볼 영상 | ★★★ 시청 의도 — 좋아요보다 forward-looking | 1u |
| **`activities.list mine=true`** | 좋아요/구독/댓글 활동 로그 (시간 포함) | ★★★ recency 보정 + 활동 다양성 | 1u |
| **`commentThreads.list` (검색으로 본인 채널/댓글 찾기)** | 본인이 단 댓글 영상 | ★★★★★ **댓글 = 능동적 관심**, 가장 강한 신호. 단 API 제약(직접 mine= 없음). search 로 우회. | 100u (search) |
| **`videos.list chart=mostPopular regionCode=KR`** (피드 빌더에서 이미 사용) | 시드 카테고리별 trending — 빠진 카테고리 보완 가능 | ★★ 보조 | 1u |
| **본인 업로드 (`channels.list?mine=true` → uploads playlist)** | 본인이 업로드한 영상 | ★★★★ 본인이 크리에이터면 가장 강함. 일반 유저는 0개일 가능성 높음 | 1u |

> 댓글 부분은 **scope 추가 필요 없음** (`youtube.readonly` 로 가능), 단 my-comments 전용 엔드포인트가 없어 search 우회라 비싸다(100u). 평소 안 켜는 게 낫고, 사용자 명시 요청 시만.

---

## 3) Watch History (시청 기록) — ⚠️ 사실상 막혀 있음

`channels.list mine=true&part=contentDetails` 응답의 `relatedPlaylists.watchHistory` 와 `relatedPlaylists.favorites` 는 **2016년 즈음부터 비활성화**되었습니다. ID 는 받지만 `playlistItems.list` 가 빈 배열 반환. 시청 기록은 YouTube Takeout (Google Data Export) 수동 다운로드 외에 자동 API 경로 없음. plan.md §주요 제약의 "시청 기록도 OAuth scope 로 읽기 어려움" 그대로.

---

## 4) 현재 데이터만으로 **계산할 수 있는** 파생 지표 (API 추가 호출 0)

| 지표 | 정의 | UI 활용 |
|---|---|---|
| **카테고리 엔트로피 (다양성 점수)** | `−Σ(pᵢ·log pᵢ)` over categories | "취향 다양도 0–100" 배지 |
| **장르 집중도** | top1 카테고리 / sum | "한 우물 vs 잡식" |
| **키워드 → 카테고리 cross-fit** | tags 가 categories 와 얼마나 정합? | 일관성 점수 |
| **유사도 매칭** | 두 사용자의 categories 벡터 cosine + keyword Jaccard | "당신과 닮은 알고리즘" 추천 |
| **채널 가중 평균 sub-count** | top channels 의 subscriberCount 평균 | 니치 ↔ 메가 슬라이더 |

> plan.md §Phase 3 "유사한 알고리즘 사용자 추천" 이 마지막 줄로 바로 매칭됨 — 추가 데이터 없이 구현 가능.

---

## 5) 외부 데이터 소스 (선택)

| 소스 | 더해주는 것 | 비용/제약 |
|---|---|---|
| **Spotify Web API** | 음악 영상의 장르/아티스트 메타 | OAuth 별도, 음악 카테고리 사용자에게만 유효 |
| **MusicBrainz** | 같은 (무료) | rate-limited (1 req/sec) |
| **Wikipedia / Wikidata** | `topicCategories` URL 의 부모 카테고리 트리 | 무료, 정적 캐시 가능 |
| **YouTube Trending RSS / scrape** | 공식 API 외의 트렌딩 신호 | TOS 회색지대, 비권장 |
| **공개 채널 카테고리 데이터셋** (Channel Crawler 등) | YouTube 가 안 주는 fine-grained 분류 | 데이터셋 최신성 불확실 |

→ **Wikidata** 만 강력 추천. `topicDetails.topicCategories` 의 Wikipedia URL → Wikidata Q-id 매핑하면 카테고리 계층 (예: "Action game" → "Video game" → "Entertainment") 받아올 수 있어 **카테고리 통합/세분화** 양쪽에 쓰임. 캐시 가능.

---

## 6) 우선순위 추천

| # | 항목 | 임팩트 | 노력 | 비용(quota) |
|---|---|---|---|---|
| 1 | **§1 의 unused part 다 켜기** (statistics, contentDetails, duration, language, subscriberCount) | ★★★★ | XS | 0 |
| 2 | **playlists.list mine=true** + 가중치 추가 | ★★★★ | S | +1u/sync |
| 3 | **subscriptions.publishedAt 기반 recency 가중** | ★★★ | S | 0 |
| 4 | **카테고리 엔트로피 + 유사도 매칭** (Phase 3 직결) | ★★★★ | M | 0 |
| 5 | **Shorts/Long-form 시청 패턴 배지** | ★★ | XS | 0 |
| 6 | **언어 분포 배지** | ★★ | XS | 0 |
| 7 | **Wikidata 카테고리 트리 enrichment** | ★★★ | M | 0 (외부) |
| 8 | **activities.list** 시간 가중 | ★★ | M | +1u/sync |
| 9 | 댓글 분석 (search 우회) | ★★★★★ | L | +100u/sync — quota 부담 큼, 옵션 토글 권장 |

---

## 7) 결론

**가장 ROI 좋은 다음 한 걸음**: §1 의 "이미 부르고 있는데 안 쓰는 필드" 를 profiler 에 합치는 것. 외부 호출 0, 새 신호 5종 추가, plan.md §확장 가능성 의 "알고리즘 일기 / 그룹 알고리즘" 도 이 위에 자연스럽게 얹힘.

원하시면 §1 + §4(유사도 매칭) 패치까지 바로 구현해 드리겠습니다.
