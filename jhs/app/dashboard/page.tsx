import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProfile } from "@/lib/profile-service";
import { CategoryRadar } from "@/components/category-radar";
import { CategoryBar } from "@/components/category-bar";
import { fingerprintGroups, categoryLabel } from "@/lib/categories";
import { ChannelList } from "@/components/channel-list";
import { SimilarUsers } from "@/components/similar-users";
import { SyncButton } from "@/components/sync-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/");

  const profile = await getProfile(userId);
  if (!profile) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {user.name ?? "안녕하세요"} 님, 환영합니다.
          </h1>
          <p className="text-sm text-muted-foreground">
            아직 알고리즘 프로필이 없습니다. 자주 보는 채널과 관심 카테고리를
            입력하면 카테고리 / 채널 / 키워드 카드가 만들어집니다.
          </p>
        </header>
        <Card className="p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            아래 버튼을 누르면 알고리즘 입력 폼으로 이동합니다 (약 1분).
          </p>
          <div className="flex justify-center">
            <SyncButton label="알고리즘 만들기" />
          </div>
        </Card>
      </section>
    );
  }

  // 모든 사용자가 동일한 최상위 카테고리 축을 갖는 fingerprint — 두 도형으로 분할.
  const fp = fingerprintGroups(profile.categories);
  const bars = Object.entries(profile.categories)
    .map(([category, pct]) => ({ category: categoryLabel(category), pct }))
    .sort((a, b) => b.pct - a.pct);

  return (
    // 대시보드 전체를 창 전체 폭(최대 1800px)으로 — compare 화면과 동일.
    <div className="mx-[calc(50%-50vw)] w-screen px-5 sm:px-8">
    <section className="mx-auto max-w-[1800px] space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border/60 pb-8">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-1 ring-border">
            {user.image ? <AvatarImage src={user.image} alt={user.name ?? ""} /> : null}
            <AvatarFallback className="text-lg">
              {(user.name ?? "?").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <h1 className="text-base font-extrabold sm:text-lg">
              {user.name ?? "나"}
            </h1>
          </div>
        </div>
        <span style={{ ["--font-scale" as string]: "1.4" }}>
          <SyncButton label="내 알고리즘 수정하기" size="lg" />
        </span>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Category fingerprint</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-center text-sm font-medium text-muted-foreground">{fp.a.title}</p>
              <CategoryRadar rows={fp.a.rows} aLabel={user.name ?? "Me"} />
            </div>
            <div>
              <p className="mb-2 text-center text-sm font-medium text-muted-foreground">{fp.b.title}</p>
              <CategoryRadar rows={fp.b.rows} aLabel={user.name ?? "Me"} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Top categories</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryBar data={bars} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">좋아하는 채널</CardTitle>
        </CardHeader>
        <CardContent>
          <ChannelList channels={profile.topChannels} />
        </CardContent>
      </Card>

      <SimilarUsers userId={userId} />
    </section>
    </div>
  );
}
