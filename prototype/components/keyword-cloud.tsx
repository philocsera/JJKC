// Lightweight keyword "cloud": a flexbox of pills, sized by index so the
// first keyword is the biggest. Real product would weight by score from
// TF-IDF / morpheme analysis (plan.md §Step 4).

export function KeywordCloud({
  keywords,
  highlight = [],
}: {
  keywords: string[];
  highlight?: string[];
}) {
  const sizes = ["text-base", "text-sm", "text-sm", "text-xs", "text-xs", "text-xs"];
  return (
    <div className="flex flex-wrap gap-2">
      {keywords.map((kw, i) => {
        const hl = highlight.includes(kw);
        const size = sizes[Math.min(i, sizes.length - 1)];
        return (
          <span
            key={kw}
            className={`rounded-full border px-3 py-1 ${size} ${
              hl
                ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10"
                : "bg-[hsl(var(--muted))]"
            }`}
          >
            {kw}
          </span>
        );
      })}
    </div>
  );
}
