"use client";

// 파일로 분석하기 — Google Takeout 시청 기록(.json/.html)을 업로드해 알고리즘 생성.
// API 할당량 걱정 없이(YouTube API 미사용) 파일만으로 분석. 클라이언트에서 파싱 후
// channelId 만 추려 /api/onboard/takeout 으로 전송.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileJson } from "lucide-react";
import { parseTakeout } from "@/lib/takeout-parser";

export function TakeoutUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function start() {
    if (!file) return;
    setStatus("working");
    setError(null);
    setInfo(null);
    try {
      const entries = await parseTakeout(file);
      if (entries.length === 0) {
        throw new Error("파일에서 시청 기록을 찾을 수 없습니다. 올바른 파일인지 확인해 주세요.");
      }
      // 페이로드 절감 — channelId 만, 최근 3000개까지.
      const payload = entries.slice(0, 3000).map((e) => ({ channelId: e.channelId }));
      const res = await fetch("/api/onboard/takeout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "분석 중 오류가 발생했습니다.");
      setInfo(`시청 채널 ${data.totalWatchedChannels}개 중 ${data.matchedChannels}개로 알고리즘을 만들었어요.`);
      setStatus("success");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e) {
      setError((e as Error)?.message ?? "알 수 없는 오류가 발생했습니다.");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border/70 bg-card/40 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold">파일로 분석하기</h2>
        <p className="text-sm text-muted-foreground">
          API 할당량 걱정 없이 Google Takeout 시청 기록 파일을 업로드해 분석합니다.
          <br />
          구글에서 내보낸 시청 기록(<code className="text-foreground">.json</code> 또는{" "}
          <code className="text-foreground">.html</code>) 파일이 필요합니다.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 px-6 py-10 text-center transition-colors hover:border-accent/60 hover:bg-accent/5">
        <FileJson className="h-8 w-8 text-muted-foreground" />
        <span className="text-sm font-medium">
          {file ? file.name : "클릭해서 시청 기록 파일 선택"}
        </span>
        <span className="text-xs text-muted-foreground">watch-history.json / watch-history.html</span>
        <input
          type="file"
          accept=".json,.html"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setStatus("idle");
            setError(null);
            setInfo(null);
          }}
        />
      </label>

      <button
        type="button"
        onClick={start}
        disabled={!file || status === "working" || status === "success"}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
      >
        {status === "working" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === "success" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {status === "working" ? "분석 중…" : status === "success" ? "완료! 이동 중…" : "시작하기"}
      </button>

      {info ? <p className="flex items-center gap-1.5 text-sm text-accent"><CheckCircle2 className="h-4 w-4" />{info}</p> : null}
      {error ? <p className="flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p> : null}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">시청 기록 파일은 어떻게 받나요?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li><a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-4 hover:underline">Google Takeout</a> 접속</li>
          <li>"YouTube 및 YouTube Music"만 선택 → 콘텐츠에서 "시청 기록"만 포함</li>
          <li>형식을 JSON 으로 선택 후 내보내기 → 받은 zip 안의 watch-history 파일 업로드</li>
        </ol>
      </details>
    </div>
  );
}
