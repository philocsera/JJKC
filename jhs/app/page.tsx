import Link from "next/link";
import { Sparkles, Radar, Telescope, GitCompareArrows } from "lucide-react";
import { auth } from "@/lib/auth";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";
import { ChannelMarquee } from "@/components/channel-marquee";

const STATS = [
  { v: "6,540", l: "한국 채널" },
  { v: "14", l: "카테고리" },
  { v: "68", l: "세부 분류" },
];

const FEATURES = [
  { idx: "01", href: "/onboard", title: "알고리즘 만들기", body: "내 취향으로 프로필 만들기", Icon: Sparkles },
  { idx: "02", href: "/discover", title: "채널 추천", body: "취향에 맞는 채널 찾기", Icon: Radar },
  { idx: "03", href: "/explore", title: "알고리즘 탐색", body: "남들은 뭘 보는지 구경하기", Icon: Telescope },
  { idx: "04", href: "/compare", title: "비교 & 팔로우", body: "내 취향과 닮았는지 비교하기", Icon: GitCompareArrows },
];

export default async function HomePage() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="space-y-14">
      {/* ── HERO + 기능 (한 화면) ───────────────────────────── */}
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-2 lg:gap-14">
        {/* 좌: 히어로 */}
        <div className="space-y-7">
          <h1 className="text-balance text-5xl font-extrabold leading-[1.32] lg:text-6xl">
            내 취향을 읽는
            <br />
            <span className="text-accent">한국 유튜브</span>
            <br />
            알고리즘.
          </h1>
          <p className="max-w-lg text-pretty text-base leading-relaxed text-muted-foreground">
            구독자 5만명 이상의 한국 유튜브 채널 중에서 내 알고리즘을 분석하고,
            채널을 추천받고, 다른 사람들의 알고리즘을 구경할 수 있습니다.
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

        {/* 우: 기능 2×2 — 아이콘 카드로 한눈에 */}
        <div className="grid auto-rows-fr grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="lift group relative flex flex-col justify-between gap-7 overflow-hidden rounded-2xl border border-border/70 bg-card/50 p-6 backdrop-blur-sm"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/20">
                  <f.Icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <span className="label-mono opacity-60">{f.idx}</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-lg font-bold leading-tight">
                  {f.title}
                  <span className="font-mono text-sm text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100">
                    →
                  </span>
                </div>
                <p className="text-sm leading-snug text-muted-foreground">{f.body}</p>
              </div>
              {/* 호버 시 은은한 레드 글로우 */}
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>

      {/* ── 통계 + 채널 마퀴 ──────────────────────────────── */}
      <div className="space-y-3">
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/40 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.l} className="bg-card/60 px-5 py-6 backdrop-blur-sm">
              <dt className="label-mono">{s.l}</dt>
              <dd className="mt-1.5 font-display text-3xl font-bold tabular-nums">{s.v}</dd>
            </div>
          ))}
        </dl>
        <ChannelMarquee />
      </div>
    </div>
  );
}
