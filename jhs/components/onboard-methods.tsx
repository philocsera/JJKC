"use client";

// 알고리즘 만들기 방법 선택 — 직접 고르기(기존 폼) / 파일로 분석하기(Takeout 업로드).
// 두 방법 모두 최종적으로 AlgoProfile 을 저장한다.

import { useState } from "react";
import { ListChecks, Upload } from "lucide-react";
import { OnboardForm } from "@/components/onboard-form";
import { TakeoutUpload } from "@/components/takeout-upload";

type Method = "manual" | "takeout";

const METHODS: { key: Method; label: string; desc: string; Icon: typeof ListChecks }[] = [
  { key: "manual", label: "직접 고르기", desc: "관심 카테고리·채널을 직접 선택", Icon: ListChecks },
  { key: "takeout", label: "파일로 분석하기", desc: "Google Takeout 시청 기록 업로드", Icon: Upload },
];

export function OnboardMethods(props: React.ComponentProps<typeof OnboardForm>) {
  const [method, setMethod] = useState<Method>("manual");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      {method === "manual" ? <OnboardForm {...props} /> : <TakeoutUpload />}
    </div>
  );
}
