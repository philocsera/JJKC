// LLM 기능 프롬프트 — 프로필 요약(페르소나), 두 알고리즘 비교 코멘트.
// llm.ts(OpenAI 호환, 기본 Gemini)를 사용. 키 없으면 null.

import { llmChat } from "./llm";
import { categoryLabel } from "./categories";
import type { AlgoProfileShape, PublicUser } from "./types";

function topCats(cats: Record<string, number>, n = 4): string {
  return Object.entries(cats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([c, p]) => `${categoryLabel(c)} ${p}%`)
    .join(", ");
}

// 한 문장(40~60자) 페르소나 요약. build-time(저장 시) 1회 생성 → DB 보관.
export async function generateProfileSummary(profile: AlgoProfileShape): Promise<string | null> {
  const cats = topCats(profile.categories);
  if (!cats) return null;
  const kws = profile.topKeywords.slice(0, 8).join(", ");
  const chans = profile.topChannels.slice(0, 5).map((c) => c.name).join(", ");

  const system =
    "너는 한국 유튜브 취향 분석가다. 사용자의 카테고리 분포·키워드·즐겨보는 채널을 보고 " +
    "그 사람의 시청 취향을 40~60자 한국어 한 문장으로 구체적이고 매력적으로 요약한다. " +
    "규칙: 오직 한 문장. 따옴표·별표·머리말·다른 표현 제안·줄바꿈·이모지 없이 문장 본문만 출력.";
  const user = `카테고리: ${cats}\n키워드: ${kws || "(없음)"}\n즐겨보는 채널: ${chans || "(없음)"}`;
  const raw = await llmChat(system, user, { maxTokens: 200, temperature: 0.6 });
  return cleanLine(raw);
}

// 첫 줄만, 마크다운(**·따옴표·불릿) 제거 — 모델이 장황하게 옵션을 붙일 때 대비.
function cleanLine(s: string | null): string | null {
  if (!s) return null;
  const first = s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? s;
  return first.replace(/^[*"'`\s•\-]+|[*"'`\s]+$/g, "").trim() || null;
}

// 두 사람 취향 비교 코멘트(4~6문장). runtime + 캐시.
export async function generateCompareInsight(
  a: { owner: PublicUser; profile: AlgoProfileShape },
  b: { owner: PublicUser; profile: AlgoProfileShape },
  sharedChannelNames: string[],
): Promise<string | null> {
  const system =
    "너는 두 사람의 유튜브 취향을 비교 분석한다. 공통점과 차이를 4~6문장의 자연스러운 한국어로 " +
    "친근하고 구체적으로 설명한다. 이모지·과장·불릿 없이 문단으로.";
  const user =
    `A(${a.owner.name}) 카테고리: ${topCats(a.profile.categories)}\n` +
    `B(${b.owner.name}) 카테고리: ${topCats(b.profile.categories)}\n` +
    `공통 관심 채널: ${sharedChannelNames.length ? sharedChannelNames.join(", ") : "없음"}`;
  const raw = await llmChat(system, user, { maxTokens: 420, temperature: 0.6 });
  return raw ? raw.replace(/\*\*/g, "").trim() || null : null;
}
