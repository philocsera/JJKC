🔵 Bigger Bets (임팩트 크나 비용·노력 큼)
  
  - 의미 기반 재랭킹: 상위 50채널을 프로필+채널설명으로 LLM 매칭점수(0~100) → 0.7×벡터 + 0.3×재랭킹. hot 1000채널/신규만 배치로 (비용 통제 필수).
  - 신규 채널 자동 분류 파이프라인: upsertChannel 시 runtime LLM 분류(6h 캐시) + 매일 배치 확정(apply-all-categories 재사용). 기존 키워드 classify.ts
  대체.
  - 좋아요/싫어요 의미 반영: 좋아요 채널들 → "핵심 테마 3가지" 추론 → 추천 가중치. (지금은 단순 제외만)
  - 카테고리 임베딩 클러스터링: sparse 코사인 → (1-α)×sparse + α×임베딩으로 의미 거리 반영, silhouette 개선.

  ---
  아키텍처 원칙
  
  - 모델: 기본 Haiku(설명·요약·분류, 캐싱으로 ~80% 토큰 절감), 정교한 매칭만 Opus.
  - Build-time(배치→DB저장) vs Runtime(온디맨드→캐시) 엄격 분리. 요약·라벨·재랭킹은 배치(지연 0), 비교·설명은 runtime+캐시(6~24h).
  - 저장 확장: AlgoProfile.summaryText/likedChannelThemes, Channel.rerankedScore/confidenceScore/classifiedBy, ChannelCluster.semanticLabel.
  - 비용 통제: 프롬프트 캐싱(taxonomy·프로필 고정), Upstash 캐시, 율 제한, hot-channel 우선.
  - 인프라: lib/cache.ts 키 스키마 확장 → lib/llm-base.ts(SDK+캐싱) → 개별 lib/llm-*.ts 유틸.

  주요 리스크

  환각(few-shot 2~3개 + 사용자 수정권), 레이턴시(Suspense+폴백), 비용 폭증(율 제한·배치 우선순위), 낮은 confidence(<0.7 미적용 + 검수 — 이미 만든
  review-autos.ts 패턴 재사용), 배치 시 신규 필드 초기화 방지.

  ---
  ✅ 추천 시작점 (1단계, 1~2주)
  
  프롬프트 캐싱 인프라 + 설명 생성 3종부터 — 가장 싸고, 즉시 체감되고, 이후 큰 작업의 LLM 호출 패턴(레이턴시·캐시 히트율)을 검증합니다:
  1. lib/llm-base.ts (Claude SDK + 프롬프트 캐싱)
  2. 프로필 요약 (build-time, summaryText)
  3. 비교 코멘트 (runtime, /compare)
  4. 추천 이유 (12개 배치) 
  
  지표: 캐시 히트율 >70%, 캐시 히트 시 <500ms, 월 비용 <$50.

  ---
  이 계획대로 진행하면 됩니다. 원하시면 1단계(프롬프트 캐싱 인프라 + 프로필 요약/비교 코멘트) 부터 바로 구현을 시작하겠습니다 — 이 프로젝트는 Anthropic
  API + 프롬프트 캐싱을 쓰도록 claude-api 스킬도 갖춰져 있어 그 가이드대로 붙이면 됩니다. 어디부터 착수할까요?