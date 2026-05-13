import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginButton } from "@/components/login-button";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <section className="space-y-12">
      <header className="space-y-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          See the world through someone else&rsquo;s YouTube algorithm.
        </h1>
        <p className="mx-auto max-w-2xl text-[hsl(var(--foreground))]/70">
          내 유튜브 구독 정보와 활동을 분석하여 나만의 알고리즘 카드를 만들고 공유해보세요.
          다른 사람의 알고리즘으로 구성된 새로운 영상 피드를 탐험할 수 있습니다.
        </p>
      </header>

      <div className="flex flex-col items-center justify-center rounded-2xl border bg-[hsl(var(--card))] p-12 text-center shadow-sm">
        <h2 className="mb-6 text-xl font-medium">서비스 시작하기</h2>
        <LoginButton />
        <p className="mt-6 text-sm text-[hsl(var(--foreground))]/60">
          Google 계정으로 로그인하면 유튜브 데이터를 안전하게 분석하여 프로필을 생성합니다.
        </p>
      </div>
    </section>
  );
}
