// 비한국어(외국 문자) 채널을 카탈로그에서 제거하고, 모든 프로필/채널의
// 참조(topChannels, subscribed/liked/dislikedChannelIds, similarChannelIds)를 정리한다.
// 탐지: 한글이 없고 베트남어/CJK/키릴/태국/아랍/데바나가리 문자가 있는 제목.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const hasHangul = (s: string) => /[가-힣]/.test(s);
const FOREIGN: Record<string, RegExp> = {
  Vietnamese: /[ăâđêôơưĂÂĐÊÔƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệịỉọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/,
  CJK: /[぀-ヿ㐀-䶿一-鿿]/,
  Thai: /[฀-๿]/,
  Cyrillic: /[Ѐ-ӿ]/,
  Arabic: /[؀-ۿ]/,
  Devanagari: /[ऀ-ॿ]/,
};
const isForeign = (title: string) =>
  !hasHangul(title) && Object.values(FOREIGN).some((re) => re.test(title));

function parseArr(s: string | null | undefined): any[] {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function main() {
  const all = await db.channel.findMany({ select: { id: true, title: true } });
  const targets = all.filter((c) => isForeign(c.title));
  const removeIds = new Set(targets.map((c) => c.id));

  console.log(`제거 대상 ${targets.length}개:`);
  for (const t of targets) console.log(`  - ${t.title}  (${t.id})`);
  if (targets.length === 0) { console.log("제거할 채널 없음."); return; }

  // 1) 프로필 참조 정리
  const profiles = await db.algoProfile.findMany();
  let touchedProfiles = 0;
  for (const p of profiles) {
    const topChannels = parseArr(p.topChannels);
    const subs = parseArr(p.subscribedChannelIds);
    const liked = parseArr(p.likedChannelIds);
    const disliked = parseArr(p.dislikedChannelIds);

    const nTop = topChannels.filter((c) => !removeIds.has(c?.id));
    const nSubs = subs.filter((id) => !removeIds.has(id));
    const nLiked = liked.filter((id) => !removeIds.has(id));
    const nDisliked = disliked.filter((id) => !removeIds.has(id));

    const changed =
      nTop.length !== topChannels.length ||
      nSubs.length !== subs.length ||
      nLiked.length !== liked.length ||
      nDisliked.length !== disliked.length;
    if (!changed) continue;

    await db.algoProfile.update({
      where: { id: p.id },
      data: {
        topChannels: JSON.stringify(nTop),
        subscribedChannelIds: JSON.stringify(nSubs),
        likedChannelIds: JSON.stringify(nLiked),
        dislikedChannelIds: JSON.stringify(nDisliked),
      },
    });
    touchedProfiles++;
  }

  // 2) 남은 채널의 similarChannelIds 참조 정리
  const others = await db.channel.findMany({
    where: { id: { notIn: [...removeIds] } },
    select: { id: true, similarChannelIds: true },
  });
  let touchedChannels = 0;
  for (const c of others) {
    const sims = parseArr(c.similarChannelIds);
    const nSims = sims.filter((id) => !removeIds.has(id));
    if (nSims.length === sims.length) continue;
    await db.channel.update({ where: { id: c.id }, data: { similarChannelIds: JSON.stringify(nSims) } });
    touchedChannels++;
  }

  // 3) 채널 삭제
  const del = await db.channel.deleteMany({ where: { id: { in: [...removeIds] } } });

  console.log(`\n완료:`);
  console.log(`  삭제된 채널: ${del.count}`);
  console.log(`  참조 정리된 프로필: ${touchedProfiles}`);
  console.log(`  similarChannelIds 정리된 채널: ${touchedChannels}`);
  const total = await db.channel.count();
  console.log(`  남은 채널 총수: ${total}`);
}
main().finally(() => db.$disconnect());
