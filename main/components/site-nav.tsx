import Link from "next/link";
import { auth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SignOutButton } from "./sign-out-button";
import { prisma } from "@/lib/prisma";

const NAV_DASHBOARD = { href: "/dashboard", label: "내 알고리즘" };

// 알고리즘 프로필이 있어야 노출되는 메뉴
const NAV_AFTER_PROFILE = [
  { href: "/discover", label: "추천" },
  { href: "/explore", label: "다른 사람들의 알고리즘" },
];

export async function SiteNav() {
  const session = await auth();
  const user = session?.user as
    | {
        id: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
      }
    | undefined;

  // 로그인 안 했으면 메뉴 숨김. 로그인했어도 아직 알고리즘 프로필이 없으면
  // '내 알고리즘'(대시보드)만 노출하고 추천·다른 사람들의 알고리즘은 숨긴다.
  let links: { href: string; label: string }[] = [];

  if (user?.id) {
    const hasProfile = !!(await prisma.algoProfile.findUnique({
      where: { userId: user.id },
      select: { userId: true },
    }));

    links = hasProfile
      ? [NAV_DASHBOARD, ...NAV_AFTER_PROFILE]
      : [NAV_DASHBOARD];
  }

  return (
    <header
      className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl"
      // 상단바만 전역 폰트보다 작게 (--font-scale 0.9 — 기본 rem 보다도 작은 컴팩트 네비)
      style={{ ["--font-scale" as string]: "0.9" }}
    >
      <div className="flex w-full items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        {/* 워드마크 — 레드 인덱스 + 모노 */}
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent font-display text-sm font-extrabold text-accent-foreground shadow-[0_0_20px_-4px_hsl(var(--accent)/0.7)]">
            J
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-accent">
            JJKC
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}

          {user?.id ? (
            <span className="ml-2 flex items-center gap-2.5 border-l border-border/60 pl-3">
              <Avatar className="h-7 w-7 ring-1 ring-border">
                {user.image ? (
                  <AvatarImage src={user.image} alt={user.name ?? ""} />
                ) : null}
                <AvatarFallback className="text-xs">
                  {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[8rem] truncate text-xs text-muted-foreground sm:inline">
                {user.name ?? user.email}
              </span>
              <SignOutButton />
            </span>
          ) : (
            <a
              href="/login"
              className="ml-2 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground transition-transform hover:scale-[1.03]"
            >
              로그인
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
