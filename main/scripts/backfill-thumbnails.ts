// thumbnail="" 인 채널의 프로필 사진을 YouTube Data API 로 보강한다.
// channels.list?part=snippet&id=...(50개씩) 로 snippet.thumbnails 를 받아 high>medium>default 순 선택.
// 쿼터: 50개당 1유닛(=batch 수만큼). 일 쿼터(10000) 대비 매우 저렴.
//
//   npx tsx scripts/backfill-thumbnails.ts            # 미리보기(앞 몇 개만 출력)
//   npx tsx scripts/backfill-thumbnails.ts --apply    # DB 반영
//   옵션: --limit N (빈 썸네일 중 앞 N개만)

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
const argN = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : dflt;
};
const LIMIT = argN("limit", 0);
const KEY = process.env.YOUTUBE_API_KEY;

type Thumbs = Record<string, { url?: string } | undefined>;

// high(800) > medium(240) > default(88). 프로필은 정사각형이라 medium 이면 충분.
function pickThumb(t: Thumbs | undefined): string {
  return t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? "";
}

// id 50개 → channelId→thumbnail url. API 가 빠뜨린 id(삭제/정지 채널)는 결과에 없음.
async function fetchThumbs(ids: string[]): Promise<Map<string, string>> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", KEY!);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res) throw new Error("network error");
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const out = new Map<string, string>();
  for (const it of data.items ?? []) {
    const thumb = pickThumb(it?.snippet?.thumbnails);
    if (it?.id && thumb) out.set(it.id, thumb);
  }
  return out;
}

async function main() {
  if (!KEY) throw new Error("YOUTUBE_API_KEY 가 .env 에 없습니다.");

  const rows = await prisma.channel.findMany({
    where: { thumbnail: "" },
    select: { id: true, title: true },
    orderBy: { subscriberCount: "desc" }, // 큰 채널부터(눈에 잘 띄는 것 우선)
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });
  console.log(`빈 썸네일 채널 ${rows.length}개 대상. mode=${APPLY ? "APPLY" : "PREVIEW"}`);

  let updated = 0;
  let missing = 0;
  let previewed = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    let thumbs: Map<string, string>;
    try {
      thumbs = await fetchThumbs(batch.map((r) => r.id));
    } catch (e) {
      console.error(`batch ${i / 50} 실패:`, (e as Error).message);
      break; // 쿼터 초과/키 오류 등 — 중단(이미 처리한 건 유지)
    }
    for (const r of batch) {
      const url = thumbs.get(r.id);
      if (!url) {
        missing++;
        continue;
      }
      if (APPLY) {
        await prisma.channel.update({ where: { id: r.id }, data: { thumbnail: url } });
        updated++;
      } else if (previewed < 10) {
        console.log(`  ${r.title}  →  ${url}`);
        previewed++;
      } else {
        updated++; // 미리보기에서도 "보강 가능" 카운트
      }
    }
    process.stdout.write(`\r진행 ${Math.min(i + 50, rows.length)}/${rows.length} (보강 ${updated}, 누락 ${missing})`);
  }
  console.log(
    `\n완료 — ${APPLY ? "업데이트" : "보강 가능"} ${updated}개, 누락(삭제/정지/비공개) ${missing}개.` +
      (APPLY ? "" : "  실제 반영하려면 --apply 를 붙이세요."),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
