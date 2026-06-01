// AlgoProfile.topChannels(JSON 스냅샷) 안의 빈 thumbnail 을 Channel 테이블(보강 완료) 값으로 채운다.
// 대시보드 "좋아하는 채널"은 온보딩 당시의 topChannels 스냅샷을 쓰므로, 카탈로그를 보강해도
// 이 스냅샷이 비어 있으면 여전히 빈칸으로 보인다. id 로 현재 Channel.thumbnail 을 찾아 메운다.
//
//   npx tsx scripts/backfill-profile-thumbnails.ts            # 미리보기
//   npx tsx scripts/backfill-profile-thumbnails.ts --apply    # DB 반영

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type TopChannel = { id: string; name?: string; thumbnail?: string; videoCount?: number };

async function main() {
  // id → thumbnail 맵(비어있지 않은 것만).
  const channels = await prisma.channel.findMany({
    where: { NOT: { thumbnail: "" } },
    select: { id: true, thumbnail: true },
  });
  const thumbById = new Map(channels.map((c) => [c.id, c.thumbnail]));

  const profs = await prisma.algoProfile.findMany({ select: { userId: true, topChannels: true } });
  let profilesTouched = 0;
  let entriesFilled = 0;
  let stillEmpty = 0;
  for (const p of profs) {
    let arr: TopChannel[] = [];
    try {
      arr = JSON.parse(p.topChannels);
    } catch {
      continue;
    }
    let changed = false;
    for (const c of arr) {
      if (c.thumbnail) continue;
      const t = thumbById.get(c.id);
      if (t) {
        c.thumbnail = t;
        entriesFilled++;
        changed = true;
      } else {
        stillEmpty++; // Channel 에도 없음(삭제 채널 등)
      }
    }
    if (changed) {
      profilesTouched++;
      if (APPLY) {
        await prisma.algoProfile.update({
          where: { userId: p.userId },
          data: { topChannels: JSON.stringify(arr) },
        });
      }
    }
  }
  console.log(
    `${APPLY ? "반영" : "미리보기"} — 프로필 ${profilesTouched}개, 항목 ${entriesFilled}개 보강, 남은 빈칸 ${stillEmpty}개.` +
      (APPLY ? "" : "  실제 반영하려면 --apply 를 붙이세요."),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
