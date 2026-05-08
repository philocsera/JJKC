"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function FollowButton({
  targetUserId,
  initialFollowing,
}: {
  targetUserId: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !following;
          const res = await fetch(`/api/follow/${targetUserId}`, {
            method: next ? "POST" : "DELETE",
          });
          if (res.ok) {
            const j = await res.json();
            setFollowing(j.following);
            router.refresh();
          }
        })
      }
      className={
        following
          ? "rounded-full border border-[hsl(var(--accent))] px-4 py-1.5 text-xs font-medium text-[hsl(var(--accent))] disabled:opacity-50"
          : "rounded-full bg-[hsl(var(--accent))] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      }
    >
      {pending ? "…" : following ? "Following" : "Follow"}
    </button>
  );
}
