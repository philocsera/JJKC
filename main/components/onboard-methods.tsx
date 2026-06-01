"use client";

// 알고리즘 만들기 방법 선택:
//  - 직접 고르기 (기존 폼)
//  - 파일로 분석하기 (Google Takeout 업로드)
//  - Google 연동 (YouTube 구독 자동 분석, youtube.readonly)
// 세 방법 모두 최종적으로 AlgoProfile 을 저장한다.

import { useState, useEffect } from "react";
import { ListChecks, Upload, Youtube } from "lucide-react";
import { OnboardForm } from "@/components/onboard-form";
import { TakeoutUpload } from "@/components/takeout-upload";

type Method = "manual" | "takeout" | "google";

const METHODS: { key: Method; label: string; desc: string; Icon: typeof ListChecks }[] = [
  { key: "manual", label: "직접 고르기", desc: "관심 카테고리·채널을 직접 선택", Icon: ListChecks },
  { key: "takeout", label: "파일로 분석하기", desc: "Google Takeout 시청 기록 업로드", Icon: Upload },
  { key: "google", label: "Google 연동", desc: "내 YouTube 구독으로 자동 분석", Icon: Youtube },
];

const GOOGLE_ERR: Record<string, string> = {
  reconnect: "YouTube 권한을 확인하지 못했습니다. 다시 연동해 주세요.",
  no_subs: "구독 채널을 가져오지 못했습니다. (구독이 없거나 권한 거부)",
  no_match: "구독 채널 중 분석 카탈로그(한국 채널)와 일치하는 것이 없습니다.",
};

function GoogleConnectPanel() {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("google");
    if (g) setErr(GOOGLE_ERR[g] ?? "연동 중 문제가 발생했습니다.");
  }, []);
  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-card/40 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold">Google 연동으로 분석</h2>
        <p className="text-sm text-muted-foreground">
          내 YouTube 구독 채널을 가져와 자동으로 알고리즘을 만듭니다.
          <br />
          현재 테스트 사용자 등록을 받으신 계정에서만 사용 가능합니다.
        </p>
      </div>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      <a
        href="/onboard/google-connect"
        className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-transform hover:scale-[1.02]"
      >
        <Youtube className="h-4 w-4" />
        Google 계정 연동하고 분석
      </a>
    </div>
  );
}

export function OnboardMethods(props: React.ComponentProps<typeof OnboardForm>) {
  const [method, setMethod] = useState<Method>("manual");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {METHODS.map((m) => {
          const active = method === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMethod(m.key)}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                active
                  ? "border-accent/60 bg-accent/10"
                  : "border-border/70 hover:border-accent/40 hover:bg-muted"
              }`}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  active ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                }`}
              >
                <m.Icon className="h-5 w-5" />
              </span>
              <span className="space-y-0.5">
                <span className={`block text-sm font-bold ${active ? "text-accent" : ""}`}>{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {method === "manual" ? (
        <OnboardForm {...props} />
      ) : method === "takeout" ? (
        <TakeoutUpload />
      ) : (
        <GoogleConnectPanel />
      )}
    </div>
  );
}
