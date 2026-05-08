import type { Video } from "@/lib/types";

const SOURCE_LABEL: Record<Video["source"], string> = {
  channel: "from channel",
  keyword: "from keyword",
  category: "from category",
};

const SOURCE_TONE: Record<Video["source"], string> = {
  channel:  "bg-emerald-500/15  text-emerald-700  dark:text-emerald-300",
  keyword:  "bg-sky-500/15      text-sky-700      dark:text-sky-300",
  category: "bg-amber-500/15    text-amber-700    dark:text-amber-300",
};

export function VideoGrid({ videos }: { videos: Video[] }) {
  if (videos.length === 0) {
    return (
      <p className="rounded-xl border bg-[hsl(var(--muted))] p-6 text-sm text-[hsl(var(--foreground))]/60">
        No videos to show.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v) => (
        <li
          key={v.id}
          className="overflow-hidden rounded-xl border bg-[hsl(var(--card))]"
        >
          <div
            className="aspect-video w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${v.thumbnail})` }}
            aria-hidden
          />
          <div className="space-y-1.5 p-3">
            <div className="flex items-center gap-2 text-[10px]">
              <span
                className={`rounded px-1.5 py-0.5 font-medium uppercase tracking-wider ${SOURCE_TONE[v.source]}`}
              >
                {SOURCE_LABEL[v.source]}
              </span>
              <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[hsl(var(--foreground))]/70">
                {v.category}
              </span>
            </div>
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">
              {v.title}
            </h3>
            <div className="text-xs text-[hsl(var(--foreground))]/60">
              {v.channelName}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
