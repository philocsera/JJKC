"use client";

import { useState } from "react";
import Image from "next/image";

// 데이터에 가끔 제어문자(U+0000~U+001F)가 섞이므로 코드 포인트로 걸러 첫 '보이는' 글자.
function firstVisibleChar(name: string): string {
  for (const ch of name ?? "") {
    if (ch.charCodeAt(0) > 0x20) return ch;
  }
  return "?";
}

// 채널 썸네일 + 로드 실패 폴백(이니셜). yt3.ggpht.com 아바타는 다량 로딩 시
// 간헐적으로 실패(throttle/만료)할 수 있어, onError 시 깨진 이미지 대신 이니셜을 보여준다.
// optimized=true 면 Next 이미지 옵티마이저 경유(소수 이미지·서버 캐시), 기본은 unoptimized
// 직접 로딩(대량 그리드에서 옵티마이저 비용 회피).
export function ChannelAvatar({
  name,
  thumbnail,
  className = "h-9 w-9",
  optimized = false,
}: {
  name: string;
  thumbnail?: string;
  className?: string; // 크기/모양(Tailwind). 예: "h-5 w-5", "h-9 w-9".
  optimized?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initial = firstVisibleChar(name);

  if (!thumbnail || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ${className}`}
      >
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
      className={`shrink-0 rounded-full object-cover ${className}`}
      unoptimized={!optimized}
      onError={() => setFailed(true)}
    />
  );
}
