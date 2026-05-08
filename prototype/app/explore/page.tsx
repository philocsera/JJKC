import Link from "next/link";
import { listPublicProfiles } from "@/lib/mock-data";

export default function ExplorePage() {
  const items = listPublicProfiles();

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
        <p className="text-sm text-[hsl(var(--foreground))]/70">
          Public algorithm profiles. Click any to borrow their feed.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ user, profile }) => {
          const top = Object.entries(profile.categories).sort(
            (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
          )[0];
          return (
            <li
              key={user.id}
              className="rounded-2xl border bg-[hsl(var(--card))] p-5"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-12 w-12 rounded-full bg-cover"
                  style={{ backgroundImage: `url(${user.image})` }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{user.name}</div>
                  <div className="line-clamp-2 text-xs text-[hsl(var(--foreground))]/60">
                    {user.bio}
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-[hsl(var(--foreground))]/50">Top category</dt>
                  <dd className="font-medium">
                    {top ? `${top[0]} · ${top[1]}%` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[hsl(var(--foreground))]/50">Channels</dt>
                  <dd className="truncate">
                    {profile.topChannels
                      .slice(0, 2)
                      .map((c) => c.name)
                      .join(", ")}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-1">
                {profile.topKeywords.slice(0, 4).map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px]"
                  >
                    {kw}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs">
                <Link
                  href={`/profile/${user.id}`}
                  className="font-medium text-[hsl(var(--accent))] hover:underline"
                >
                  Open profile →
                </Link>
                <Link
                  href={`/compare?b=${user.id}`}
                  className="text-[hsl(var(--foreground))]/60 hover:underline"
                >
                  Compare
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
