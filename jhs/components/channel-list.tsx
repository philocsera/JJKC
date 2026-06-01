"use client";

import { useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { TopChannel } from "@/lib/types";

// 데이터에 가끔 제어문자(U+0000~U+001F, U+007F)가 섞이므로, 코드 포인트로 걸러
// 첫 번째 '보이는' 글자를 이니셜로 쓴다(정규식 문자클래스에 제어문자를 넣지 않음).
function firstVisibleChar(name: string): string {
  for (const ch of name ?? "") {
    if (ch.charCodeAt(0) > 0x20) return ch; // 공백·제어문자(<= U+0020) 건너뜀
  }
  return "?";
}

// 채널 썸네일. yt3.ggpht.com 직접 로딩은 간헐적으로 실패(throttle/핫링크 차단)할 수 있어
// onError 시 채널 이름 이니셜 아바타로 폴백한다 → 어떤 환경에서도 깨진 이미지가 안 보인다.
function ChannelAvatar({ name, thumbnail }: { name: string; thumbnail?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = firstVisibleChar(name);

  if (!thumbnail || failed) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {initial}
      </span>
    );
  }
  return (
    <Image
      src={thumbnail}
      alt={name}
      width={36}
      height={36}
      className="h-9 w-9 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

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
            <ChannelAvatar name={c.name} thumbnail={c.thumbnail} />
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
