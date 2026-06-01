"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { TopChannel } from "@/lib/types";
import { ChannelAvatar } from "@/components/channel-avatar";

export function ChannelList({
  channels,
  removable = false,
}: {
  channels: TopChannel[];
  removable?: boolean; // true 면 각 채널에 삭제(×) 버튼 노출(본인 대시보드 전용)
}) {
  const [items, setItems] = useState<TopChannel[]>(channels);

  async function remove(id: string) {
    const prev = items;
    setItems((cur) => cur.filter((c) => c.id !== id)); // 낙관적 제거
    try {
      const res = await fetch("/api/profile/favorites/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: id }),
      });
      if (!res.ok) setItems(prev); // 실패 시 되돌림
    } catch {
      setItems(prev);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 채널 데이터가 없습니다.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((c) => (
        <li key={c.id} className="group flex items-center gap-3">
          {/* 프로필 사진 클릭 → 채널 유튜브 페이지(새 탭) */}
          <a
            href={`https://www.youtube.com/channel/${c.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full ring-offset-2 ring-offset-background transition hover:ring-2 hover:ring-accent/60"
            title={`${c.name} 채널 열기`}
          >
            <ChannelAvatar name={c.name} thumbnail={c.thumbnail} optimized />
          </a>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{c.name}</div>
          </div>
          {removable ? (
            <button
              type="button"
              onClick={() => remove(c.id)}
              aria-label={`${c.name} 좋아하는 채널에서 삭제`}
              title="좋아하는 채널에서 삭제"
              className="shrink-0 rounded-full p-1 text-muted-foreground opacity-60 transition-colors hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
