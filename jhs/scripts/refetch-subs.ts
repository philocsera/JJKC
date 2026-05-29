// subscriberCount=0(미상)인 채널의 진짜 구독자수 재수집.
// 채널 ID 로 공개 채널 페이지(youtube.com/channel/UC…?hl=ko&gl=KR)를 직접 조회해
// "구독자 N만명" 텍스트를 파싱한다. API 키 불필요.
//   - 파싱 성공 → 그 값으로 업데이트
//   - 구독자수 미표시(YouTube 가 숨기는 초소형 채널) → 0 유지 (5만 미만으로 확정)
//
//   npx tsx scripts/refetch-subs.ts            # 미리보기
//   npx tsx scripts/refetch-subs.ts --apply     # DB 반영
//   옵션: --conc 4 (동시성)  --limit N (앞 N개만)

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
const CONC = argN("conc", 4);
const LIMIT = argN("limit", 0);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// 채널 페이지 HTML 에서 "구독자 220만명" / "구독자 1.2천명" 형태 파싱.
function parseSubsFromPage(html: string): number | null {
  const m = html.match(/구독자\s?([\d.,]+)\s?(억|만|천)?명/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (isNaN(n)) return null;
  const u = m[2];
  if (u === "억") return Math.round(n * 1e8);
  if (u === "만") return Math.round(n * 1e4);
  if (u === "천") return Math.round(n * 1e3);
  return Math.round(n); // 단위 없음: "구독자 980명"
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 800 + Math.random() * 1200;

async function fetchSubs(id: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${id}?hl=ko&gl=KR`, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
    });
    if (!res.ok) return null;
    return parseSubsFromPage(await res.text());
  } catch {
    return null;
  }
}

async function main() {
  let targets = await prisma.channel.findMany({
    where: { subscriberCount: 0 },
    select: { id: true, title: true, handle: true },
  });
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);
  console.log(`재수집 대상 ${targets.length}개 (동시성 ${CONC}${APPLY ? ", APPLY" : ", dry-run"})\n`);

  const results: { id: string; title: string; handle: string | null; subs: number | null }[] = [];
  for (let i = 0; i < targets.length; i += CONC) {
    const batch = targets.slice(i, i + CONC);
    const subs = await Promise.all(batch.map((t) => fetchSubs(t.id)));
    batch.forEach((t, j) => results.push({ ...t, subs: subs[j] }));
    await sleep(jitter());
    process.stderr.write(`  …${Math.min(i + CONC, targets.length)}/${targets.length}\n`);
  }

  const FLOOR = 50000;
  let updated = 0,
    belowFloor = 0,
    hidden = 0;
  for (const r of results.sort((a, b) => (b.subs ?? -1) - (a.subs ?? -1))) {
    if (r.subs == null) {
      hidden++;
      console.log(`  [미표시] ${r.handle} | ${r.title}`);
    } else {
      if (r.subs < FLOOR) belowFloor++;
      else updated++;
      console.log(`  ${String(r.subs).padStart(9)} | ${r.handle} | ${r.title}${r.subs < FLOOR ? "  ⚠️5만미만" : ""}`);
      if (APPLY) {
        await prisma.channel.update({ where: { id: r.id }, data: { subscriberCount: r.subs } });
      }
    }
  }

  console.log(
    `\n요약: 구독자수 확인 ${updated + belowFloor}개 (그중 5만미만 ${belowFloor}) · 미표시(초소형) ${hidden}개`,
  );
  if (!APPLY) console.log("--apply 를 붙이면 파싱된 값으로 DB 업데이트(미표시는 0 유지).");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
