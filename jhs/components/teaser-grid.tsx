// 블러 처리된 더미 카드 그리드 위에 안내/로딩 문구를 올리는 "숨겨진 카드" 연출.
// /discover, /watch-as, /compare 의 AI 영상 추천 빈 상태에서 공용.

export function TeaserGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <ul
        aria-hidden
        className="pointer-events-none grid select-none grid-cols-1 gap-6 blur-[6px] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <li key={i} className="space-y-3 opacity-50">
            <div className="aspect-video w-full rounded-xl bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
          </li>
        ))}
      </ul>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-md rounded-2xl border border-border/60 bg-background/75 px-7 py-5 text-center shadow-xl backdrop-blur-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
