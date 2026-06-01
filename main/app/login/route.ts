// GET /login — 평범한 링크로 진입해 서버에서 Google OAuth 를 시작한다.
// (클라이언트 폼/하이드레이션에 의존하지 않는 가장 견고한 로그인 진입점)

import { signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  // signIn 은 인증 URL 로의 redirect 를 throw 한다(Next 가 응답으로 변환).
  await signIn("google", { redirectTo: "/dashboard" });
}
