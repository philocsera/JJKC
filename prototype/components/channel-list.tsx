import type { Channel } from "@/lib/types";

export function ChannelList({ channels }: { channels: Channel[] }) {
  return (
    <ul className="space-y-2">
      {channels.map((ch) => (
        <li
          key={ch.id}
          className="flex items-center gap-3 rounded-xl border bg-[hsl(var(--card))] p-3"
        >
          <span
            className="h-10 w-10 rounded-full bg-cover"
            style={{ backgroundImage: `url(${ch.thumbnail})` }}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{ch.name}</div>
            <div className="text-xs text-[hsl(var(--foreground))]/60">
              {ch.videoCount?.toLocaleString() ?? "N/A"} videos
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
