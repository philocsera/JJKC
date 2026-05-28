// 세부 카테고리 분류기 — 채널/사용자 텍스트 → { "Parent/Sub": 0-100 }.
//
// classify.ts 와 동일한 키워드 매칭(짧은 영문은 word-boundary, 한글은 substring).
// 부모 게이팅: 채널의 상위 카테고리(classify 결과)에 해당하는 부모의 세부 사전만
// 매칭한다 → "운동"이 Howto 와 People&Blogs 양쪽에서 오발하는 걸 막는다.

import { classify } from "./classify";
import { normalizeTopN } from "./category-utils";
import { loadSubTaxonomy, subKey } from "./sub-taxonomy";

function matches(textLower: string, kw: string): boolean {
  if (!kw) return false;
  const hasHangul = /[가-힣]/.test(kw);
  const useBoundary = !hasHangul && kw.length <= 4; // "lol"이 "lollipop"에 걸리는 사고 방지
  return useBoundary
    ? new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, "u").test(textLower)
    : textLower.includes(kw);
}

export interface SubClassifyInput {
  text: string; // title + description + keywords 합본
  // 이미 계산된 상위 카테고리가 있으면 재사용(없으면 classify로 산출).
  parentCategories?: Record<string, number>;
}

// { "Gaming/마인크래프트": 0-100, ... } (top 5 정규화). 매칭 없으면 {}.
export function subClassify(input: SubClassifyInput): Record<string, number> {
  const tax = loadSubTaxonomy();
  const lower = input.text.toLowerCase();
  const parents = input.parentCategories ?? classify({ text: input.text }).categories;

  const scores: Record<string, number> = {};
  for (const [parent, subs] of Object.entries(tax)) {
    if (!(parents[parent] > 0)) continue; // 부모 게이팅
    for (const [label, kws] of Object.entries(subs)) {
      let hit = 0;
      for (const kw of kws) if (matches(lower, kw)) hit++;
      if (hit > 0) scores[subKey(parent, label)] = hit;
    }
  }
  return normalizeTopN(scores, 5);
}
