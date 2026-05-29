import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";

const STATS = [
  { v: "6,540", l: "한국 채널" },
  { v: "14", l: "카테고리" },
  { v: "68", l: "세부 분류" },
  { v: "0", l: "API 키" },
];

const FEATURES = [
  {
    idx: "01",
    href: "/onboard",
    title: "알고리즘 만들기",
    body: "카테고리 → 세부 관심사 → 채널, 3단계로 내 취향 벡터를 만듭니다. 시청기록·구독 권한 불필요.",
    cta: "프로필 만들기",
    auth: true,
    span: true,
  },
  {
    idx: "02",
    href: "/discover",
    title: "채널 추천",
    body: "같은 벡터 공간에서 유사도·다양성·인기도로 랭킹.",
    cta: "추천 보기",
    auth: true,
  },
  {
    idx: "03",
    href: "/explore",
    title: "알고리즘 탐색",
    body: "다른 사람의 알고리즘을 둘러보고 그 취향으로 채널을 받아 봅니다.",
    cta: "둘러보기",
    auth: false,
  },
  {
    idx: "04",
    href: "/compare",
    title: "비교 & 팔로우",
    body: "두 알고리즘을 레이더로 겹쳐 보고 닮은 사람을 찾습니다.",
    cta: "비교하기",
    auth: false,
  },
];

export default async function HomePage() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="space-y-28">
      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="relative pt-6">
        <p className="label-mono mb-6">한국 유튜브 · 알고리즘 카탈로그</p>
        <h1 className="max-w-4xl text-balance text-5xl font-extrabold leading-[0.98] sm:text-6xl lg:text-7xl">
          내 취향을 읽는
          <br />
          <span className="text-accent">한국 유튜브</span> 알고리즘.
        </h1>
        <p className="mt-7 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
          구독자 5만+ 한국 채널 카탈로그 위에서 내 시청 취향으로 채널을 추천받고,
          내 &ldquo;알고리즘&rdquo;을 다른 사람과 공유·비교합니다.
          <span className="text-foreground"> YouTube API 없이</span> 동작합니다.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
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
              <SignInButton>Google로 시작하기</SignInButton>
              <Button asChild size="lg" variant="outline">
                <Link href="/explore">로그인 없이 둘러보기</Link>
              </Button>
            </>
          )}
        </div>

        {/* 통계 스트립 */}
        <dl className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/40 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.l} className="bg-card/60 px-5 py-6 backdrop-blur-sm">
              <dt className="label-mono">{s.l}</dt>
              <dd className="mt-1.5 font-display text-3xl font-bold tabular-nums">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── FEATURES (bento) ───────────────────────────────── */}
      <section className="space-y-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold sm:text-3xl">무엇을 할 수 있나</h2>
          <span className="label-mono hidden sm:block">04 modules</span>
        </div>
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.href}
              className={`lift group flex flex-col justify-between gap-6 rounded-2xl border border-border/70 bg-card/50 p-6 backdrop-blur-sm ${
                f.span ? "lg:col-span-2 lg:row-span-1" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="label-mono text-accent">{f.idx}</span>
                <span className="font-mono text-xs text-muted-foreground transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </div>
              <div className="space-y-2">
                <h3 className={`font-bold ${f.span ? "text-2xl" : "text-lg"}`}>{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
              {!signedIn && f.auth ? (
                <SignInButton>로그인하고 {f.cta}</SignInButton>
              ) : (
                <Button asChild variant="outline" size="sm" className="self-start">
                  <Link href={f.href}>{f.cta}</Link>
                </Button>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────── */}
      <section className="space-y-10">
        <h2 className="text-2xl font-bold sm:text-3xl">어떻게 동작하나</h2>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/40 md:grid-cols-3">
          {[
            { n: "01", t: "관심사 선택", d: "카테고리 → 세부 → 채널을 골라 알고리즘 프로필을 만듭니다." },
            { n: "02", t: "벡터 매칭", d: "프로필과 채널을 같은 공간에서 유사도·다양성·인기도로 랭킹합니다." },
            { n: "03", t: "공유 · 비교", d: "내 알고리즘을 공유하고 닮은 사람을 찾아 비교·팔로우합니다." },
          ].map((s) => (
            <li key={s.n} className="space-y-3 bg-card/60 p-7 backdrop-blur-sm">
              <span className="font-display text-4xl font-bold text-accent/80">{s.n}</span>
              <div className="font-semibold">{s.t}</div>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
