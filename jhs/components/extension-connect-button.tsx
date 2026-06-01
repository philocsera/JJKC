"use client";

import { useEffect, useState } from "react";
import { Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExtensionConnectButton() {
  const [status, setStatus] = useState("");

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;

      if (event.data?.type === "JJKC_CONNECT_EXTENSION_DONE") {
        setStatus("로그인 정보 연동 완료");
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
        window.location.origin,
      );

      setTimeout(() => {
        setStatus((prev) =>
          prev === "로그인 정보 연동 완료"
            ? prev
            : "요청 전송됨. 확장프로그램 설치 후 페이지 새로고침이 필요할 수 있습니다.",
        );
      }, 1000);
    } catch {
      alert("확장프로그램 연결 중 오류가 발생했습니다.");
    }
  }

  // '내 알고리즘 수정하기'(SyncButton)와 같은 Button 그래픽 — secondary 느낌의 outline 변형.
  // 스택에서 수정 버튼과 폭을 맞추려고 w-full.
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={connectExtension}
        className="w-full"
      >
        <Puzzle className="h-4 w-4" />
        Chrome Extension 연결
      </Button>
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
    </div>
  );
}
