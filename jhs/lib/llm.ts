// Provider-agnostic LLM 클라이언트 (OpenAI 호환 chat completions).
// 기본값: Google Gemini(AI Studio 무료 티어)의 OpenAI 호환 엔드포인트.
// 다른 제공자(Groq/Upstage/OpenRouter 등)로 바꾸려면 env 3개만 교체.
//
//   GEMINI_API_KEY=AIza...           (또는 LLM_API_KEY)
//   LLM_BASE_URL=...                 (기본: Gemini OpenAI-compat)
//   LLM_MODEL=gemini-2.5-flash       (기본)
//
// 키가 없으면 모든 호출이 null 을 돌려준다(기능은 graceful 하게 비활성).

const BASE_URL =
  process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
const MODEL = process.env.LLM_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || "";

export function llmEnabled(): boolean {
  return API_KEY.length > 0;
}

export interface ChatOpts {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

// system + user 단발 대화. 실패/키없음 → null (호출부가 graceful 처리).
export async function llmChat(
  system: string,
  user: string,
  opts: ChatOpts = {},
): Promise<string | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: opts.maxTokens ?? 300,
        temperature: opts.temperature ?? 0.5,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    if (!res.ok) {
      console.warn(`[llm] ${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() : null;
  } catch (e) {
    console.warn("[llm] request failed:", (e as Error)?.message);
    return null;
  }
}
