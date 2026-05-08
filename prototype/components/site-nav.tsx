import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

export async function SiteNav() {
  const user = await getCurrentUser();
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-base font-semibold tracking-tight">
          yt-algo-share
          <span className="ml-2 rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--foreground))]/70">
            prototype
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          {user ? (
            <>
              <Link href="/dashboard" className="hover:underline">
                Dashboard
              </Link>
              <Link href="/explore" className="hover:underline">
                Explore
              </Link>
              <Link href="/compare" className="hover:underline">
                Compare
              </Link>
              <span className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                <span
                  className="inline-block h-5 w-5 rounded-full bg-cover"
                  style={{ backgroundImage: `url(${user.image})` }}
                  aria-hidden
                />
                {user.name}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/explore" className="hover:underline">
                Explore
              </Link>
              <Link
                href="/"
                className="rounded-full bg-[hsl(var(--accent))] px-3 py-1 text-white"
              >
                Sign in (demo)
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
