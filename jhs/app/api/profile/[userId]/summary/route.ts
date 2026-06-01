// POST /api/profile/[userId]/summary — 버튼 클릭 시에만 LLM 페르소나 요약 생성·저장.
// (자동 생성 안 함 → API 호출 횟수 절약). 로그인 필요.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { llmEnabled, LlmQuotaError, LLM_QUOTA_MESSAGE } from "@/lib/llm";
import { generateAndStoreProfileSummary } from "@/lib/profile-service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!llmEnabled()) {
    return NextResponse.json({ error: "llm_disabled", message: "GEMINI_API_KEY 가 설정되지 않았습니다." }, { status: 503 });
  }
  const { userId } = await params;
  let text: string | null;
  try {
    text = await generateAndStoreProfileSummary(userId);
  } catch (e) {
    if (e instanceof LlmQuotaError) {
      return NextResponse.json({ error: "quota_exceeded", message: LLM_QUOTA_MESSAGE }, { status: 429 });
    }
    throw e;
  }
  if (!text) return NextResponse.json({ error: "generation_failed", message: "요약 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  return NextResponse.json({ ok: true, summary: text });
}
