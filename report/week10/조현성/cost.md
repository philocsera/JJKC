# YouTube Data API Quota 비용 분석

> 기준: [공식 quota cost 표](https://developers.google.com/youtube/v3/determine_quota_cost)
> 기본 할당량: Google Cloud 프로젝트당 **하루 10,000 units** (UTC 자정 리셋, 무료).
> `u` 는 돈으로 사는 단위가 아니라 **YouTube API quota 단위**. 부족하면 quota increase 를
> 신청할 수 있으나 (심사 기반, 여전히 무료) 직접 구매하는 상품은 없음.

---

## 1) Sync 1회 — `performAutoSync` (`lib/sync-service.ts`)

| 호출 | 엔드포인트 | 비용 |
|---|---|---|
| `getVideoCategories` | `videoCategories.list` | 1u |
| `getSubscriptions` (50개) | `subscriptions.list` | 1u |
| `getLikedVideos` (50개) | `videos.list myRating=like` | 1u |
| `getMyPlaylists` | `playlists.list mine=true` | 1u |
| `getMyActivities` | `activities.list mine=true` | 1u |
| `getChannels` (구독채널 50개 batch) | `channels.list` | 1u |
| `getPlaylistVideoIds` × N (N ≤ 5) | `playlistItems.list` | 0~5u |
| `getVideosByIds` (playlist 영상 메타) | `videos.list?id=…` | 0~1u |

- **최소: 6u** (playlists 없음)
- **일반: 8~9u**
- **최대: 12u** (5개 playlist 모두 활성)

`PLAYLIST_PROBE_LIMIT = 5` 가 quota 상한을 사실상 결정. 늘리면 1u/playlist 씩 추가.

---

## 2) Feed 1회 — `buildFeed` (`lib/feed-builder.ts`, cold cache)

`/dashboard` 또는 `/profile/[userId]` 로드마다 1회. 30/40/30 비율.

| 슬롯 | 호출 | 횟수 | 합계 |
|---|---|---|---|
| channel (top 3) | `channels.list` (uploads playlistId) + `playlistItems.list` | 2 × 3 | **6u** |
| keyword (top 4) | `search.list q=...` | 4 | **400u** ⚠️ |
| category (top 3) | `videos.list chart=mostPopular` | 3 | **3u** |

→ **~409u / feed (cold), 그중 ~98% 가 `search.list`**

**캐시:** `TTL.feed = 30분`, key = `viewerId × targetId × total × lastSyncedAt`
→ 같은 viewer 가 같은 target 을 30분 안에 다시 봐도 0u.
→ 다른 viewer 가 같은 target 을 봐도 cold (viewer 별 토큰 사용).

---

## 3) `search.list` 의 역할 — 왜 비싼가

피드의 keyword 슬롯은 **사용자의 `topKeywords` (좋아요 영상 태그 + 채널 brandingSettings 상위 4개)
로 YouTube 전역을 풀텍스트 검색** 하는 용도. 즉 **discovery / serendipity 슬롯** —
"내가 구독하지 않은 채널 중에서 내 취향 키워드와 맞는 영상" 을 발굴.

다른 두 슬롯은 **ID 직접 조회 (1u)**, keyword 슬롯만 **풀텍스트 검색 인덱스 (100u)** 라
가격 차이가 100배.

예시: `topKeywords = ["devops", "kubernetes", "rust", "synthwave"]`
```
search.list q="devops"     → 영상 5개  (100u)
search.list q="kubernetes"  → 영상 5개  (100u)
search.list q="rust"        → 영상 5개  (100u)
search.list q="synthwave"   → 영상 5개  (100u)
```
→ dedupe 후 `wantKeyword = round(total × 0.4)` 만큼 잘라 interleave.

---

## 4) 실제 일일 사용 시나리오

| 패턴 | 일일 quota |
|---|---|
| 1명 / sync 2회 + dashboard 3회 (캐시 활용) | sync 18u + feed ~409u × 2 = **~835u** |
| 1명 / sync 2회 + 다른 사람 프로필 5명 클릭 | 18u + 409u × 5 = **~2,065u** |
| 5명 활발 사용 | **~6,000~10,000u** (한도 근접) |
| 20명 활발 사용 | **한도 초과** — quota increase 필요 |

---

## 5) 절감 옵션 (나중에 진행 예정)

ROI 순:

### A. 키워드 4 → 2 로 줄이기 (한 줄 수정)
- `lib/feed-builder.ts` 의 `pickTopK(profile.topKeywords, 4)` → `2`
- feed 비용 **409u → 209u (-49%)**
- 키워드 discovery 신호 절반 유지

### B. `search.list` 제거, keyword 슬롯을 category trending 으로 대체
- feed 비용 **409u → 9u (-97%)**
- 트레이드오프: 피드가 "구독 + 카테고리 인기" 로만 채워져 **discovery 약화**
- 추천 알고리즘이라기보다 "구독 박스 + 트렌딩" 에 가까워짐

### C. `search.list` 를 채널 검색으로 전환 (`type=channel`)
- 같은 100u/검색이지만 결과(channelId) 를 DB 캐싱 → 그 후 1u/채널 로 재사용
- 첫 검색은 비싸지만 **시간이 갈수록 amortized 비용 ↓**
- 구현 복잡도 ↑

### D. 공개 프로필 feed 의 viewer-agnostic 공유 캐시
- 현재: `viewerId × targetId` 키 → viewer 마다 cold 캐시
- 변경: `targetId × lastSyncedAt` 키 → 공개 프로필이면 viewer 무관 공유
- 단점: viewer 의 자기 quota 가 아닌 공통 풀로 잡혀 책임 추적이 모호. 비공개 프로필은 적용 불가.

### E. Sync 쪽 절감 (작은 효과)
- `PLAYLIST_PROBE_LIMIT` 5 → 3: -2u/sync
- `getMyActivities` 토글 옵션화: -1u/sync
- 효과 미미 — sync 는 이미 충분히 싸다.

---

## 6) 메모

- **병목은 명확히 keyword 슬롯의 `search.list`** — 전체 비용의 ~98%.
- Sync 비용은 이번 rslt.md §1+§2 반영 후에도 12u 이하로 여전히 매우 저렴.
- 댓글 분석 (rslt.md §2 마지막 줄) 은 비용 100u/sync 라 활성화 시 sync 비용이 ~10배 됨 — 옵션 토글 권장.
