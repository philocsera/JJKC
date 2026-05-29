import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";

const STATS = [
  { v: "6,540", l: "한국 채널" },
  { v: "14", l: "카테고리" },
  { v: "68", l: "세부 분류" },
];

const FEATURES = [
  { idx: "01", href: "/onboard", title: "알고리즘 만들기", body: "3단계로 내 취향 벡터 생성" },
  { idx: "02", href: "/discover", title: "채널 추천", body: "벡터 공간 유사도 랭킹" },
  { idx: "03", href: "/explore", title: "알고리즘 탐색", body: "다른 사람의 알고리즘 둘러보기" },
  { idx: "04", href: "/compare", title: "비교 & 팔로우", body: "두 알고리즘 레이더 비교" },
];

export default async function HomePage() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="space-y-16">
      {/* ── HERO + 기능 (한 화면) ───────────────────────────── */}
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-12 lg:gap-12">
        {/* 좌: 히어로 */}
        <div className="space-y-7 lg:col-span-7">
          <p className="label-mono">한국 유튜브 · 알고리즘 카탈로그</p>
          <h1 className="text-balance text-5xl font-extrabold leading-[0.98] lg:text-6xl">
            내 취향을 읽는
            <br />
            <span className="text-accent">한국 유튜브</span> 알고리즘.
          </h1>
          <p className="max-w-lg text-pretty text-base leading-relaxed text-muted-foreground">
            구독자 5만+ 한국 채널 카탈로그 위에서 내 시청 취향으로 채널을 추천받고,
            내 &ldquo;알고리즘&rdquo;을 공유·비교합니다.
            <span className="text-foreground"> YouTube API 없이</span> 동작합니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
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
        </div>

        {/* 우: 기능 4개 — 첫 화면에 바로 노출 */}
        <div className="space-y-3 lg:col-span-5">
          <div className="flex items-center justify-between px-1">
            <span className="label-mono">무엇을 할 수 있나</span>
            <span className="label-mono">04</span>
          </div>
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="lift group flex items-center gap-4 rounded-xl border border-border/70 bg-card/50 p-4 backdrop-blur-sm"
            >
              <span className="label-mono shrink-0 text-accent">{f.idx}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold leading-tight">{f.title}</div>
                <div className="truncate text-xs text-muted-foreground">{f.body}</div>
              </div>
              <span className="shrink-0 font-mono text-muted-foreground transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 통계 스트립 ─────────────────────────────────────── */}
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/40 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.l} className="bg-card/60 px-5 py-6 backdrop-blur-sm">
            <dt className="label-mono">{s.l}</dt>
            <dd className="mt-1.5 font-display text-3xl font-bold tabular-nums">{s.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
