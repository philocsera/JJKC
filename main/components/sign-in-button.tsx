// Google 로그인 — Auth.js v5 권장 방식인 서버 액션 form.
// (클라이언트 next-auth/react signIn 은 v5 에서 조용히 실패하는 경우가 있어 서버 액션으로 전환)

import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function SignInButton({ children }: { children?: React.ReactNode }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/dashboard" });
      }}
    >
      <Button size="lg" variant="accent" type="submit">
        {children ?? "Google 계정으로 계속하기"}
      </Button>
    </form>
  );
}
