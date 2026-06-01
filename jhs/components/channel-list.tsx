import Image from "next/image";
import type { TopChannel } from "@/lib/types";

export function ChannelList({ channels }: { channels: TopChannel[] }) {
  if (channels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">아직 채널 데이터가 없습니다.</p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {channels.map((c) => (
        <li key={c.id} className="flex items-center gap-3">
          {/* 프로필 사진 클릭 → 채널 유튜브 페이지(새 탭) */}
          <a
            href={`https://www.youtube.com/channel/${c.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full ring-offset-2 ring-offset-background transition hover:ring-2 hover:ring-accent/60"
            title={`${c.name} 채널 열기`}
          >
            {c.thumbnail ? (
              <Image
                src={c.thumbnail}
                alt={c.name}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <span className="block h-9 w-9 rounded-full bg-muted" />
            )}
          </a>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{c.name}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
