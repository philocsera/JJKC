// POST /api/profile/[userId]/summary — 버튼 클릭 시에만 LLM 페르소나 요약 생성·저장.
// (자동 생성 안 함 → API 호출 횟수 절약). 로그인 필요.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { llmEnabled } from "@/lib/llm";
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
  const text = await generateAndStoreProfileSummary(userId);
  if (!text) return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, summary: text });
}
