"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import type { User } from "@/lib/types";

export function DemoSignIn({ users }: { users: User[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState<string | null>(null);

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((u) => (
        <li
          key={u.id}
          className="flex items-center gap-3 rounded-xl border bg-[hsl(var(--background))] p-3"
        >
          <span
            className="h-12 w-12 shrink-0 rounded-full bg-cover"
            style={{ backgroundImage: `url(${u.image})` }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate font-medium">{u.name}</div>
              {!u.isPublic ? (
                <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                  private
                </span>
              ) : null}
            </div>
            <div className="line-clamp-2 text-xs text-[hsl(var(--foreground))]/60">
              {u.bio}
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPicking(u.id);
              start(async () => {
                const res = await fetch("/api/auth/demo", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ userId: u.id }),
                });
                if (res.ok) {
                  router.refresh();
                  router.push("/dashboard");
                }
              });
            }}
            className="rounded-full bg-[hsl(var(--accent))] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending && picking === u.id ? "…" : "Sign in"}
          </button>
        </li>
      ))}
    </ul>
  );
}
