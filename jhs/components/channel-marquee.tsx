import { prisma } from "@/lib/prisma";

// DB 카탈로그의 채널 프로필 사진을 우→좌로 흐르게 보여주는 시각 자료 (서버 컴포넌트, 외부 호출 0).
export async function ChannelMarquee() {
  const channels = await prisma.channel.findMany({
    where: { isKorean: true, NOT: { thumbnail: "" } },
    orderBy: { subscriberCount: "desc" },
    take: 100,
    select: { id: true, title: true, thumbnail: true },
  });
  if (channels.length === 0) return null;

  // seamless 루프를 위해 2배 복제 (-50% 이동)
  const row = [...channels, ...channels];

  return (
    <section>
      <div className="marquee-wrap relative overflow-hidden py-2">
        <div className="marquee-track flex gap-5">
          {row.map((c, i) => (
            <div key={`${c.id}-${i}`} className="group relative shrink-0" title={c.title}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.thumbnail}
                alt={c.title}
                loading="lazy"
                className="h-16 w-16 rounded-full object-cover ring-1 ring-border transition-all duration-200 group-hover:scale-110 group-hover:ring-accent/60"
              />
              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {c.title}
              </span>
            </div>
          ))}
        </div>
        {/* 양옆 페이드 */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
      </div>
    </section>
  );
}
