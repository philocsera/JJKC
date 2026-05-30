import { Fingerprint } from "lucide-react";
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
    <section className="mx-auto max-w-5xl space-y-8 py-4">
      <header className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Fingerprint className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">당신의 알고리즘을 알려주세요</h1>
      </header>
      <OnboardForm initial={initial} subLabels={subLabels} />
    </section>
  );
}
