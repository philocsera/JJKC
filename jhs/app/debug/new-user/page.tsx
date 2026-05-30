// 디버그 전용: 이름 + 알고리즘(카테고리 가중치)을 직접 지정해 유저를 즉석 생성.
// 프로덕션(VERCEL_ENV=production)에서는 404 처럼 막는다.

import { notFound } from "next/navigation";
import { Wrench } from "lucide-react";
import { getSubLabels } from "@/lib/sub-taxonomy";
import { DebugUserForm } from "@/components/debug-user-form";

export const dynamic = "force-dynamic";

export default function DebugNewUserPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const subLabels = getSubLabels();

  return (
    <section className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
          <Wrench className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">디버그 — 유저 만들기</h1>
          <p className="text-sm text-muted-foreground">
            로그인 없이 이름과 알고리즘(카테고리 가중치)을 직접 지정해 테스트 유저를 생성합니다.
          </p>
        </div>
      </header>

      <DebugUserForm subLabels={subLabels} />
    </section>
  );
}
