import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// 서비스 소개 랜딩. 로그인 여부와 무관하게 기능을 설명하고,
// 사용자가 원하는 기능으로 직접 진입하도록 한다. (예전엔 로그인 시 /dashboard 로 강제 이동했음)

const FEATURES = [
  {
    href: "/onboard",
    title: "알고리즘 만들기",
    body: "3단계로 관심 카테고리 → 세부 관심사 → 채널을 골라 내 알고리즘 프로필을 만듭니다. 시청기록·구독 권한은 필요 없습니다.",
    cta: "프로필 만들기",
    auth: true,
  },
  {
    href: "/discover",
    title: "채널 추천받기",
    body: "내 알고리즘과 같은 카테고리·세부 벡터 공간에서 비교해, 취향에 맞는 한국 유튜브 채널을 추천합니다.",
    cta: "추천 보기",
    auth: true,
  },
  {
    href: "/dashboard",
    title: "내 알고리즘 보기",
    body: "카테고리 분포·대표 채널·지표(다양성·니치도 등)를 한 화면에 시각화합니다.",
    cta: "대시보드",
    auth: true,
  },
  {
    href: "/explore",
    title: "다른 알고리즘 탐색",
    body: "다른 사람들의 알고리즘 프로필을 둘러보고, 그 취향으로 만든 영상 피드를 받아 봅니다.",
    cta: "둘러보기",
    auth: false,
  },
  {
    href: "/compare",
    title: "알고리즘 비교",
    body: "두 알고리즘을 레이더 차트로 겹쳐 보고, 나와 닮은 사용자를 찾고 팔로우합니다.",
    cta: "비교하기",
    auth: false,
  },
];

export default async function HomePage() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <section className="space-y-16">
      <header className="space-y-6 pt-8 text-center">
        <h1 className="text-balance text-5xl font-semibold tracking-tight">
          내 취향에 맞는 <span className="text-accent">한국 유튜브 채널</span>을<br />
          찾고, 내 알고리즘을 공유하세요.
        </h1>
        <p className="mx-auto max-w-2xl text-balance text-base text-muted-foreground">
          구독자 5만+ 한국 채널 6,500여 개 카탈로그 위에서, 내 시청 취향으로 채널을 추천받고
          다른 사람의 &ldquo;알고리즘&rdquo;과 비교·탐색하는 서비스. YouTube API 없이 동작합니다.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {signedIn ? (
            <>
              <Button asChild size="lg" variant="accent">
                <Link href="/onboard">알고리즘 만들기</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/dashboard">내 대시보드</Link>
              </Button>
            </>
          ) : (
            <>
              <SignInButton>Google 계정으로 시작하기</SignInButton>
              <Button asChild size="lg" variant="outline">
                <Link href="/explore">로그인 없이 둘러보기</Link>
              </Button>
            </>
          )}
        </div>
        {!signedIn ? (
          <p className="text-xs text-muted-foreground">
            Google 계정은 <strong>로그인 식별용</strong>으로만 사용합니다 — YouTube 데이터 접근 권한은 요청하지 않습니다.
          </p>
        ) : null}
      </header>

      <section className="space-y-6">
        <h2 className="text-center text-sm font-medium uppercase tracking-wide text-muted-foreground">
          무엇을 할 수 있나요
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.href} className="flex flex-col justify-between gap-5 p-6">
              <div className="space-y-2">
                <h3 className="font-medium">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
              {!signedIn && f.auth ? (
                <SignInButton>로그인하고 {f.cta}</SignInButton>
              ) : (
                <Button asChild variant="outline" size="sm" className="self-start">
                  <Link href={f.href}>{f.cta} →</Link>
                </Button>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-center text-sm font-medium uppercase tracking-wide text-muted-foreground">
          어떻게 동작하나요
        </h2>
        <ol className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            { n: "1", t: "관심사 선택", d: "카테고리 → 세부 관심사 → 채널을 골라 알고리즘 프로필을 만듭니다." },
            { n: "2", t: "채널 추천", d: "같은 벡터 공간에서 유사도·다양성·인기도로 채널을 랭킹합니다." },
            { n: "3", t: "공유·비교", d: "내 알고리즘을 공유하고, 닮은 사람을 찾아 비교·팔로우합니다." },
          ].map((s) => (
            <li key={s.n} className="space-y-1 text-center">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                {s.n}
              </div>
              <div className="font-medium">{s.t}</div>
              <p className="text-sm text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
