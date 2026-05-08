"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SyncButton({ initialSyncedAt }: { initialSyncedAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lastSyncedAt, setLastSyncedAt] = useState(initialSyncedAt);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await fetch("/api/sync", { method: "POST" });
            if (res.ok) {
              const j = await res.json();
              setLastSyncedAt(j.lastSyncedAt);
              router.refresh();
            }
          })
        }
        className="rounded-full bg-[hsl(var(--accent))] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      <span className="text-xs text-[hsl(var(--foreground))]/60">
        Last synced {new Date(lastSyncedAt).toLocaleString()}
      </span>
    </div>
  );
}
