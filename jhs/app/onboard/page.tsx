import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getChannelsByIds } from "@/lib/channel-service";
import { getSubLabels } from "@/lib/sub-taxonomy";
import { OnboardForm, type OnboardInitial } from "@/components/onboard-form";

export const dynamic = "force-dynamic";

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export default async function OnboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const row = await prisma.onboardInput.findUnique({ where: { userId } });
  const channelIds = parseJson<string[]>(row?.channelIds, []);
  const categories = parseJson<string[]>(row?.categories, []);
  const subCategories = parseJson<string[]>(row?.subCategories, []);

  const channels = (await getChannelsByIds(channelIds)).map((c) => ({
    id: c.id,
    title: c.title,
    handle: c.handle,
    thumbnail: c.thumbnail,
    subscriberCount: c.subscriberCount,
  }));

  const initial: OnboardInitial = { channels, categories, subCategories };
  const subLabels = getSubLabels();

  return (
    <section className="mx-auto max-w-2xl space-y-8 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">알고리즘 만들기</h1>
        <p className="text-sm text-muted-foreground">
          관심 카테고리를 고르면 그 카테고리의 인기 채널을 보여 드립니다. 거기서 자주 보는
          채널을 선택하면 알고리즘 프로필이 만들어집니다. YouTube 로그인 권한 없이 동작합니다.
        </p>
      </header>
      <OnboardForm initial={initial} subLabels={subLabels} />
    </section>
  );
}
