"use client";

// 디버그용 유저 생성 폼. 이름만 추가로 받고, 알고리즘 선택은 일반 유저와
// 똑같은 온보딩 3단계(OnboardForm)를 그대로 재사용한다.
// 제출 → /api/debug/create-user → User+AlgoProfile 즉석 생성.

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OnboardForm } from "@/components/onboard-form";
import { categoryLabel } from "@/lib/categories";

type Created = { userId: string; name: string; categories: Record<string, number> };

export function DebugUserForm({ subLabels }: { subLabels: Record<string, string[]> }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  if (created) {
    return (
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-accent">
          <Check className="h-5 w-5" />
          <h2 className="text-lg font-semibold">유저 생성 완료</h2>
        </div>
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">이름</dt>
            <dd className="font-medium">{created.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">userId</dt>
            <dd className="font-mono text-xs">{created.userId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">알고리즘</dt>
            <dd className="font-mono text-xs">
              {Object.entries(created.categories ?? {})
                .map(([k, v]) => `${categoryLabel(k)} ${v}`)
                .join(" · ") || "(채널 파생)"}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm">
            <Link href={`/profile/${created.userId}`}>프로필 보기</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/explore">전체 목록</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCreated(null);
              setName("");
            }}
          >
            또 만들기
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 이름 — 디버그에서만 추가로 받는 필드 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 테스트유저 A"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      {/* 알고리즘 선택 — 일반 유저와 동일한 온보딩 3단계 */}
      <OnboardForm
        initial={{ channels: [], categories: [], subCategories: [] }}
        subLabels={subLabels}
        submitUrl="/api/debug/create-user"
        extraBody={{ name }}
        extraValidate={() => (name.trim() ? null : "이름을 입력하세요.")}
        onSuccess={(data) => setCreated(data as Created)}
        submitLabel="유저 만들기"
      />
    </div>
  );
}
