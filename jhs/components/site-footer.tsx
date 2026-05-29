import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <div className="h-px hairline" />
      <div className="flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="font-mono text-sm font-semibold tracking-tight">
            JJKC<span className="text-muted-foreground">/algo</span>
          </div>
          <p className="text-xs text-muted-foreground">
            구독자 5만+ 한국 채널 카탈로그 · YouTube API 0 · 서빙 시 외부 호출 0
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <Link href="/explore" className="transition-colors hover:text-foreground">Explore</Link>
          <Link href="/discover" className="transition-colors hover:text-foreground">Discover</Link>
          <Link href="/compare" className="transition-colors hover:text-foreground">Compare</Link>
          <Link href="/onboard" className="transition-colors hover:text-foreground">Onboard</Link>
        </nav>
      </div>
    </footer>
  );
}
