"use client";

import { useEffect, useState } from "react";

export function ExtensionConnectButton() {
  const [status, setStatus] = useState("");

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;

      if (event.data?.type === "JJKC_CONNECT_EXTENSION_DONE") {
        setStatus("확장프로그램 연결 완료");
        alert("JJKC 확장프로그램 로그인 정보 연동 완료");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function connectExtension() {
    try {
      const res = await fetch("/api/auth/session");

      if (!res.ok) {
        alert("세션 정보를 불러오지 못했습니다.");
        return;
      }

      const session = await res.json();
      const userId = session?.user?.id;

      if (!userId) {
        alert("로그인이 필요합니다.");
        return;
      }

      setStatus("확장프로그램 연결 요청 중...");

      window.postMessage(
        {
          type: "JJKC_CONNECT_EXTENSION",
          userId,
        },
        window.location.origin
      );

      setTimeout(() => {
        setStatus((prev) =>
          prev === "확장프로그램 연결 완료"
            ? prev
            : "요청 전송됨. 확장프로그램 설치 후 페이지 새로고침이 필요할 수 있습니다."
        );
      }, 1000);
    } catch {
      alert("확장프로그램 연결 중 오류가 발생했습니다.");
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={connectExtension}
        className="rounded-full border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
      >
        📺 Chrome Extension 연결
      </button>

      {status ? (
        <p className="text-xs text-muted-foreground">{status}</p>
      ) : null}
    </div>
  );
}
