// LLM 기능 프롬프트 — 프로필 요약(페르소나), 두 알고리즘 비교 코멘트.
// llm.ts(OpenAI 호환, 기본 Gemini)를 사용. 키 없으면 null.

import { llmChat } from "./llm";
import { categoryLabel } from "./categories";
import type { AlgoProfileShape, PublicUser } from "./types";

// 영상 재랭킹은 호출이 잦고 프롬프트가 무거우므로, 요약·비교(기본 모델)와 분리해
// 별도 일일 쿼터를 가진 모델로 라우팅한다(무료 한도가 모델별이라 예산이 배가됨).
const RERANK_MODEL = process.env.LLM_RERANK_MODEL || "gemini-2.5-flash-lite";

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
    "너는 두 사람의 유튜브 취향을 비교 분석한다. 반드시 주어진 두 사람의 실제 이름을 그대로 사용하고, " +
    "'A','B' 같은 익명 표기는 절대 쓰지 마라. 공통점과 차이를 4~6문장의 자연스러운 한국어로 " +
    "친근하고 구체적으로 설명한다. 이모지·과장·불릿 없이 문단으로.";
  const user =
    `${a.owner.name} 의 카테고리: ${topCats(a.profile.categories)}\n` +
    `${b.owner.name} 의 카테고리: ${topCats(b.profile.categories)}\n` +
    `두 사람의 공통 관심 채널: ${sharedChannelNames.length ? sharedChannelNames.join(", ") : "없음"}`;
  const raw = await llmChat(system, user, { maxTokens: 420, temperature: 0.6 });
  return raw ? raw.replace(/\*\*/g, "").trim() || null : null;
}

// ── 영상 재랭킹 ─────────────────────────────────────────────
// 추천 채널들의 최근 영상 후보 풀을 받아, 사용자 취향에 맞는 순으로 top-N 을 고르고
// 영상마다 한 줄 이유를 붙인다. (최신순 → 관련성순). 버튼 온디맨드 + 캐시.

export type VideoCandidate = { videoId: string; title: string; channelName: string; category: string };

export interface RerankTaste {
  categories: Record<string, number>;
  topKeywords: string[];
  summary: string;
  likedNames: string[];
  dislikedNames: string[];
}

export async function rerankVideos(
  taste: RerankTaste,
  candidates: VideoCandidate[],
  topN = 15,
): Promise<{ videoId: string; reason: string }[] | null> {
  if (candidates.length === 0) return null;

  const system =
    "너는 한국 유튜브 취향 큐레이터다. 후보 영상 목록에서 이 사람이 가장 볼 만한 영상을 고른다. " +
    "제목·채널·카테고리와 취향(요약·카테고리·키워드·좋아요/싫어요)을 종합해 관련성이 높은 순으로 " +
    `정확히 ${topN}개(후보가 적으면 가능한 만큼)를 고른다. 같은 영상 중복 금지, 싫어한 채널 성향은 피한다. ` +
    '출력은 오직 JSON 배열: [{"i": 후보번호, "why": "추천 이유(한국어 18자 내외)"}] — 다른 텍스트·마크다운 금지.';

  const list = candidates.map((c, i) => `[${i}] ${c.title} — ${c.channelName} (${c.category})`).join("\n");
  const user =
    `취향 요약: ${taste.summary || "(없음)"}\n` +
    `선호 카테고리: ${topCats(taste.categories, 6)}\n` +
    `키워드: ${taste.topKeywords.slice(0, 10).join(", ") || "(없음)"}\n` +
    `좋아한 채널: ${taste.likedNames.slice(0, 8).join(", ") || "없음"}\n` +
    `싫어한 채널: ${taste.dislikedNames.slice(0, 8).join(", ") || "없음"}\n\n` +
    `후보 영상:\n${list}`;

  const raw = await llmChat(system, user, { maxTokens: 1400, temperature: 0.4, model: RERANK_MODEL });
  const parsed = parseRerank(raw, candidates.length);
  if (!parsed) return null;

  const seen = new Set<number>();
  const out: { videoId: string; reason: string }[] = [];
  for (const { i, why } of parsed) {
    if (!Number.isInteger(i) || i < 0 || i >= candidates.length || seen.has(i)) continue;
    seen.add(i);
    out.push({ videoId: candidates[i].videoId, reason: cleanReason(why) });
    if (out.length >= topN) break;
  }
  return out.length ? out : null;
}

// 코드펜스·잡텍스트를 걷어내고 첫 [ ~ 마지막 ] 사이만 JSON 파싱.
function parseRerank(raw: string | null, n: number): { i: number; why: string }[] | null {
  if (!raw) return null;
  const s = raw.replace(/```(?:json)?/gi, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const arr = JSON.parse(s.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    const out: { i: number; why: string }[] = [];
    for (const it of arr) {
      const i = Number(it?.i ?? it?.index ?? it?.n);
      const why = String(it?.why ?? it?.reason ?? "").trim();
      if (Number.isInteger(i) && i >= 0 && i < n) out.push({ i, why });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function cleanReason(s: string): string {
  return s.replace(/^[*"'`\s•\-]+|[*"'`\s]+$/g, "").trim().slice(0, 40);
}

// 두 사람이 "둘 다 좋아할" 영상 재랭킹 — /compare 용.
export async function rerankSharedVideos(
  a: { name: string; categories: Record<string, number>; topKeywords: string[] },
  b: { name: string; categories: Record<string, number>; topKeywords: string[] },
  candidates: VideoCandidate[],
  topN = 12,
): Promise<{ videoId: string; reason: string }[] | null> {
  if (candidates.length === 0) return null;

  const system =
    "너는 두 사람이 함께 볼 만한 유튜브 영상을 고르는 큐레이터다. 두 사람의 취향을 모두 고려해 " +
    `둘 다 좋아할 가능성이 높은 영상을 관련성 높은 순으로 정확히 ${topN}개(후보가 적으면 가능한 만큼) 고른다. ` +
    "한쪽만 좋아할 영상은 피하고 공통 관심사를 우선한다. 같은 영상 중복 금지. " +
    '출력은 오직 JSON 배열: [{"i": 후보번호, "why": "두 사람에게 추천하는 이유(한국어 18자 내외)"}] — 다른 텍스트·마크다운 금지.';

  const list = candidates.map((c, i) => `[${i}] ${c.title} — ${c.channelName} (${c.category})`).join("\n");
  const user =
    `${a.name} 취향 → 카테고리: ${topCats(a.categories, 5)} / 키워드: ${a.topKeywords.slice(0, 8).join(", ") || "(없음)"}\n` +
    `${b.name} 취향 → 카테고리: ${topCats(b.categories, 5)} / 키워드: ${b.topKeywords.slice(0, 8).join(", ") || "(없음)"}\n\n` +
    `후보 영상:\n${list}`;

  const raw = await llmChat(system, user, { maxTokens: 1200, temperature: 0.4 });
  const parsed = parseRerank(raw, candidates.length);
  if (!parsed) return null;

  const seen = new Set<number>();
  const out: { videoId: string; reason: string }[] = [];
  for (const { i, why } of parsed) {
    if (!Number.isInteger(i) || i < 0 || i >= candidates.length || seen.has(i)) continue;
    seen.add(i);
    out.push({ videoId: candidates[i].videoId, reason: cleanReason(why) });
    if (out.length >= topN) break;
  }
  return out.length ? out : null;
}
