// Provider-agnostic LLM 클라이언트 (OpenAI 호환 chat completions) — 폴백 체인.
// 1차: Google Gemini(AI Studio 무료 티어). 2차: Groq(무료, 빠름) — Gemini 가 429(한도
// 소진)거나 실패하면 자동으로 다음 제공자로 넘어간다. 모든 제공자가 한도 소진이면
// LlmQuotaError 를 던져 호출부가 "한도 소진" 안내를 보여준다.
//
//   GEMINI_API_KEY=AIza...           (또는 LLM_API_KEY)
//   LLM_BASE_URL / LLM_MODEL         (기본: Gemini OpenAI-compat, gemini-2.5-flash)
//   GROQ_API_KEY=gsk_...             (설정 시 2차 폴백 활성)
//   GROQ_BASE_URL / GROQ_MODEL       (기본: Groq, llama-3.3-70b-versatile)
//
// 키가 하나도 없으면 모든 호출이 null 을 돌려준다(기능은 graceful 하게 비활성).

const BASE_URL =
  process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
const MODEL = process.env.LLM_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || "";

const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export function llmEnabled(): boolean {
  return API_KEY.length > 0 || GROQ_KEY.length > 0;
}

type Provider = {
  kind: "gemini" | "groq";
  baseUrl: string;
  key: string;
  model: string;
};

// 호출 순서대로 제공자 체인 구성. 키가 있는 것만 포함. opts.model 은 Gemini 전용
// 오버라이드(예: 재랭킹용 flash-lite) — 폴백 제공자는 각자 기본 모델을 쓴다.
function providerChain(opts: ChatOpts): Provider[] {
  const chain: Provider[] = [];
  if (API_KEY) chain.push({ kind: "gemini", baseUrl: BASE_URL, key: API_KEY, model: opts.model ?? MODEL });
  if (GROQ_KEY) chain.push({ kind: "groq", baseUrl: GROQ_BASE_URL, key: GROQ_KEY, model: GROQ_MODEL });
  return chain;
}

// 한도 소진 시 사용자에게 보여줄 공통 안내 문구(서버 라우트에서 재사용).
export const LLM_QUOTA_MESSAGE =
  "오늘 AI 무료 사용량을 모두 사용했어요. 내일 다시 시도해 주세요.";

// 무료 티어 한도 소진(429 RESOURCE_EXHAUSTED). 다른 실패(null)와 구분해 호출부가
// "한도 소진" 전용 안내를 보여줄 수 있게 한다.
export class LlmQuotaError extends Error {
  constructor() {
    super("llm_quota_exceeded");
    this.name = "LlmQuotaError";
  }
}

export interface ChatOpts {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  model?: string; // 호출별 모델 오버라이드(예: 무거운 재랭킹은 별도 쿼터의 flash-lite)
}

// 단일 제공자 1회 호출. 성공 텍스트 | "quota"(429) | null(기타 실패).
async function callProvider(
  p: Provider,
  system: string,
  user: string,
  opts: ChatOpts,
): Promise<string | "quota" | null> {
  try {
    const body: Record<string, unknown> = {
      model: p.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: opts.maxTokens ?? 300,
      temperature: opts.temperature ?? 0.5,
    };
    // Gemini 2.5 계열은 thinking 모델 — 끄지 않으면 thinking 이 토큰을 다 먹어 출력이 빔.
    // (Groq 의 llama 등은 모르는 파라미터를 거부할 수 있어 Gemini 에만 붙인다.)
    if (p.kind === "gemini") body.reasoning_effort = "none";

    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    if (!res.ok) {
      console.warn(`[llm:${p.kind}] ${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
      return res.status === 429 ? "quota" : null; // 429 = 한도 소진 → 폴백 신호
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() : null;
  } catch (e) {
    console.warn(`[llm:${p.kind}] request failed:`, (e as Error)?.message);
    return null;
  }
}

// system + user 단발 대화. Gemini → Groq 폴백 체인.
//   - 한 제공자라도 성공하면 그 텍스트 반환.
//   - 모두 실패 + 그중 하나라도 429(한도 소진) → LlmQuotaError(호출부가 한도 안내).
//   - 모두 실패(한도 외 사유) 또는 키 없음 → null (호출부가 graceful 처리).
export async function llmChat(
  system: string,
  user: string,
  opts: ChatOpts = {},
): Promise<string | null> {
  const chain = providerChain(opts);
  if (chain.length === 0) return null;

  let sawQuota = false;
  for (const p of chain) {
    const r = await callProvider(p, system, user, opts);
    if (typeof r === "string") return r; // 성공
    if (r === "quota") sawQuota = true; // 다음 제공자로 폴백
    // null(기타 실패)이면 다음 제공자 시도
  }
  if (sawQuota) throw new LlmQuotaError(); // 가용 제공자 전부 한도 소진
  return null;
}
