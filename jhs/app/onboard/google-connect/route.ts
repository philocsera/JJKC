// GET /onboard/google-connect — youtube.readonly 권한으로 재동의(google-youtube provider).
// 동의 후 /onboard/google-sync 로 돌아가 구독을 분석한다.

import { signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await signIn("google-youtube", { redirectTo: "/onboard/google-sync" });
}
