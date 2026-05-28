// Phase 3 onboard: 사용자 폼 입력 → AlgoProfile (ProfileResult).
//
// YouTube Data API 가 주던 구독/좋아요 신호를 두 가지 자기선언 신호로 대체한다:
//   - 자주 보는 채널 (catalog 에 이미 분류·벡터화돼 있음) → 행동 신호 (behavioral)
//   - 직접 체크한 관심 카테고리                              → 선언 신호 (declared)
//
// 두 신호를 같은 카테고리 namespace 에서 blend 해 categories 벡터를 만들고,
// 채널 keywords 를 모아 topKeywords 를, 채널 메타로 metrics 를 채운다.

import type { ProfileResult, ProfileMetrics } from "./profiler";
import type { TopChannel } from "./types";
import { getChannelsByIds } from "./channel-service";
import { entropyScore, normalizeTopN } from "./category-utils";

export interface OnboardForm {
  channelIds: string[];     // 사용자가 고른 채널 (카테고리 그리드에서 선택)
  categories: string[];     // 체크한 관심 카테고리 (CATEGORY_NAMESPACE)
  subCategories?: string[]; // 체크한 세부 카테고리 ("Parent/Sub")
}

// 행동(채널) vs 선언(카테고리) blend 비중. 둘 다 있으면 채널 쪽에 더 무게.
const CHANNEL_BLEND = 0.6;
const CATEGORY_BLEND = 0.4;
const MAX_CHANNELS = 10;
const MAX_KEYWORDS = 12;

const avg = (xs: number[]): number =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

export async function buildOnboardProfile(form: OnboardForm): Promise<{
  result: ProfileResult;
  subscribedChannelIds: string[];
}> {
  const channels = await getChannelsByIds(form.channelIds);

  // ── categories: 채널 벡터 합산(행동) + 체크 카테고리(선언) 을 정규화 후 blend ──
  const channelAgg: Record<string, number> = {};
  for (const ch of channels) {
    for (const [cat, w] of Object.entries(ch.categories)) {
      channelAgg[cat] = (channelAgg[cat] ?? 0) + w;
    }
  }
  const checkedAgg: Record<string, number> = {};
  for (const cat of form.categories) checkedAgg[cat] = 100; // 체크된 카테고리는 동일 가중

  const nChan = normalizeTopN(channelAgg, 15);
  const nChk = normalizeTopN(checkedAgg, 15);
  const haveChan = Object.keys(nChan).length > 0;
  const haveChk = Object.keys(nChk).length > 0;
  // 한쪽만 있으면 그쪽이 100%, 둘 다 있으면 0.6/0.4.
  const wChan = haveChan ? (haveChk ? CHANNEL_BLEND : 1) : 0;
  const wChk = haveChk ? (haveChan ? CATEGORY_BLEND : 1) : 0;

  const blended: Record<string, number> = {};
  for (const [k, v] of Object.entries(nChan)) blended[k] = (blended[k] ?? 0) + v * wChan;
  for (const [k, v] of Object.entries(nChk)) blended[k] = (blended[k] ?? 0) + v * wChk;

  const categories = normalizeTopN(blended, 10);

  // ── subCategories: 채널 세부분류 합산(행동) + 체크 세부카테고리(선언) blend ──
  const subChanAgg: Record<string, number> = {};
  for (const ch of channels) {
    for (const [k, v] of Object.entries(ch.subCategories)) subChanAgg[k] = (subChanAgg[k] ?? 0) + v;
  }
  const subChkAgg: Record<string, number> = {};
  for (const k of form.subCategories ?? []) subChkAgg[k] = 100;
  const nSubChan = normalizeTopN(subChanAgg, 10);
  const nSubChk = normalizeTopN(subChkAgg, 10);
  const haveSubChan = Object.keys(nSubChan).length > 0;
  const haveSubChk = Object.keys(nSubChk).length > 0;
  const wSubChan = haveSubChan ? (haveSubChk ? CHANNEL_BLEND : 1) : 0;
  const wSubChk = haveSubChk ? (haveSubChan ? CATEGORY_BLEND : 1) : 0;
  const subBlended: Record<string, number> = {};
  for (const [k, v] of Object.entries(nSubChan)) subBlended[k] = (subBlended[k] ?? 0) + v * wSubChan;
  for (const [k, v] of Object.entries(nSubChk)) subBlended[k] = (subBlended[k] ?? 0) + v * wSubChk;
  const subCategories = normalizeTopN(subBlended, 8);

  // ── topChannels ──
  const topChannels: TopChannel[] = channels.slice(0, MAX_CHANNELS).map((c) => ({
    id: c.id,
    name: c.title,
    thumbnail: c.thumbnail,
    videoCount: c.videoCount,
  }));

  // ── topKeywords: 선택 채널 keywords 빈도순 ──
  const kwFreq: Record<string, number> = {};
  for (const ch of channels) {
    for (const kw of ch.keywords) {
      const k = kw.trim().toLowerCase();
      if (k) kwFreq[k] = (kwFreq[k] ?? 0) + 1;
    }
  }
  const topKeywords = Object.entries(kwFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KEYWORDS)
    .map(([k]) => k);

  // ── metrics ──
  // shorts/longForm 비율은 영상 길이 신호가 필요한데 카탈로그는 채널 단위라 알 수
  // 없다 → 0. 언어는 카탈로그가 전부 한국 채널이므로 ko 로 둔다.
  const { diversity, concentration } = entropyScore(blended);
  const metrics: ProfileMetrics = {
    diversity,
    concentration,
    shortsRatio: 0,
    longFormRatio: 0,
    languageDistribution: channels.length ? { ko: 100 } : {},
    primaryLanguage: channels.length ? "ko" : null,
    mainstreamScore: avg(channels.map((c) => c.metrics.mainstreamScore).filter((v) => v > 0)),
    nicheChannelScore: avg(channels.map((c) => c.metrics.nicheScore).filter((v) => v > 0)),
  };

  return {
    result: { categories, subCategories, topKeywords, topChannels, sampleVideoIds: [], metrics },
    // 추천 단계의 "이미 보는 채널 제외" 용. 고른 채널 = 본인 시청 채널.
    subscribedChannelIds: form.channelIds,
  };
}
