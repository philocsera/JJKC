import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getProfile, getUser, listPublicProfiles } from "@/lib/mock-data";
import { CategoryRadar } from "@/components/category-radar";
import { KeywordCloud } from "@/components/keyword-cloud";
import type { CategoryName } from "@/lib/types";

const ALL_CATEGORIES: CategoryName[] = [
  "Tech", "Music", "Gaming", "Entertainment", "Cooking",
  "Travel", "Beauty", "Sports", "News", "Education",
];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const me = await getCurrentUser();
  const aId = a ?? me?.id;
  const bId = b;

  const others = listPublicProfiles().filter((it) => it.user.id !== aId);

  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Compare</h1>
        <p className="text-sm text-[hsl(var(--foreground))]/70">
          Two algorithm fingerprints, overlaid.
        </p>
      </header>

      {!aId ? (
        <p className="rounded-xl border bg-[hsl(var(--muted))] p-4 text-sm">
          Sign in (any demo user) to compare your profile against someone
          else&rsquo;s. Or pass <code>?a=&amp;b=</code> in the URL.
        </p>
      ) : null}

      {!bId && aId ? (
        <div className="rounded-2xl border bg-[hsl(var(--card))] p-5">
          <h2 className="mb-3 text-sm font-medium">Pick someone to compare with</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {others.map(({ user }) => (
              <li key={user.id}>
                <Link
                  href={`/compare?a=${aId}&b=${user.id}`}
                  className="block rounded-xl border p-3 hover:bg-[hsl(var(--muted))]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-8 w-8 rounded-full bg-cover"
                      style={{ backgroundImage: `url(${user.image})` }}
                      aria-hidden
                    />
                    <span className="text-sm font-medium">{user.name}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {aId && bId ? <CompareView aId={aId} bId={bId} /> : null}
    </section>
  );
}

function CompareView({ aId, bId }: { aId: string; bId: string }) {
  const ua = getUser(aId);
  const ub = getUser(bId);
  const pa = getProfile(aId);
  const pb = getProfile(bId);
  if (!ua || !ub || !pa || !pb) {
    return (
      <p className="text-sm text-[hsl(var(--foreground))]/70">
        One of those users doesn&rsquo;t exist.
      </p>
    );
  }
  if (!ua.isPublic || !ub.isPublic) {
    return (
      <p className="text-sm text-[hsl(var(--foreground))]/70">
        Both profiles must be public to compare.
      </p>
    );
  }

  const rows = ALL_CATEGORIES.map((cat) => ({
    category: cat,
    a: pa.categories[cat] ?? 0,
    b: pb.categories[cat] ?? 0,
  }));
  const shared = pa.topKeywords.filter((k) => pb.topKeywords.includes(k));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card user={ua} />
        <Card user={ub} />
      </div>

      <div className="rounded-2xl border bg-[hsl(var(--card))] p-5">
        <h2 className="mb-2 text-sm font-medium">Category overlay</h2>
        <CategoryRadar rows={rows} aLabel={ua.name} bLabel={ub.name} />
      </div>

      <div className="rounded-2xl border bg-[hsl(var(--card))] p-5">
        <h2 className="mb-3 text-sm font-medium">
          Shared keywords {shared.length ? `(${shared.length})` : ""}
        </h2>
        {shared.length ? (
          <KeywordCloud keywords={shared} />
        ) : (
          <p className="text-sm text-[hsl(var(--foreground))]/60">
            No keyword overlap. These two algorithms barely touch.
          </p>
        )}
      </div>
    </div>
  );
}

function Card({ user }: { user: { id: string; name: string; image: string; bio: string } }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-[hsl(var(--card))] p-4">
      <span
        className="h-12 w-12 rounded-full bg-cover"
        style={{ backgroundImage: `url(${user.image})` }}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="truncate font-medium">{user.name}</div>
        <div className="line-clamp-2 text-xs text-[hsl(var(--foreground))]/60">
          {user.bio}
        </div>
      </div>
    </div>
  );
}
