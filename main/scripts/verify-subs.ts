// 특정 source 채널들의 구독자수를 채널 페이지 실제값과 대조해 정정.
// seed-enrich(외부 SQL 덤프) 등 RSS 로 못 받는 메타데이터 보강 소스는 값이 부풀려졌을 수 있어
// (예: 보겸TV DB 1820만 vs 실제 220만) 채널 ID 로 공개 페이지를 직접 조회해 검증한다. API 키 0.
//   - 실제값 파싱 성공 & DB값과 다름 → 실제값으로 정정(--apply)
//   - 미표시(파싱 실패) → 건드리지 않고 리포트만 (일시적 차단/지역 이슈 가능)
//
//   npx tsx scripts/verify-subs.ts                         # seed-enrich, dry-run
//   npx tsx scripts/verify-subs.ts --source seed-enrich --apply
//   옵션: --conc 6  --min-ratio 1.3 (이 배수 이상 괴리만 정정 표시)

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
const argS = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const SOURCE = argS("source", "seed-enrich");
const CONC = parseInt(argS("conc", "6"), 10);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function parseKoSubs(t: string): number | null {
  const m = t.match(/구독자\s?([\d.,]+)\s?(억|만|천)?명/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (isNaN(n)) return null;
  const u = m[2];
  if (u === "억") return Math.round(n * 1e8);
  if (u === "만") return Math.round(n * 1e4);
  if (u === "천") return Math.round(n * 1e3);
  return Math.round(n);
}

// 채널 페이지엔 추천/관련 채널 구독자수가 섞여 있어 단순 첫-매칭은 본 채널이 아닐 수 있다(핑크퐁→7810 오파싱 사례).
// 본 채널 구독자수는 ytInitialData.header(pageHeaderRenderer) 서브트리에만 있으므로 거기서만 찾는다.
function parseSubsFromPage(html: string): number | null {
  const m = html.match(/ytInitialData = (\{.+?\});<\/script>/s);
  if (!m) return null;
  let data: any;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!data.header) return null;
  let found: number | null = null;
  (function walk(node: any) {
    if (found != null || !node || typeof node !== "object") return;
    if (typeof node.content === "string" && node.content.includes("구독자")) {
      const v = parseKoSubs(node.content);
      if (v != null) found = v;
      return;
    }
    for (const k in node) walk(node[k]);
  })(data.header);
  return found;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 400 + Math.random() * 600;

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
  const targets = await prisma.channel.findMany({
    where: { source: SOURCE, subscriberCount: { gt: 0 } },
    select: { id: true, title: true, handle: true, subscriberCount: true },
  });
  console.log(`검증 대상 ${targets.length}개 (source=${SOURCE}, 동시성 ${CONC}${APPLY ? ", APPLY" : ", dry-run"})\n`);

  type R = { id: string; title: string; handle: string | null; db: number; real: number | null };
  const results: R[] = [];
  for (let i = 0; i < targets.length; i += CONC) {
    const batch = targets.slice(i, i + CONC);
    const subs = await Promise.all(batch.map((t) => fetchSubs(t.id)));
    batch.forEach((t, j) => results.push({ id: t.id, title: t.title, handle: t.handle, db: t.subscriberCount, real: subs[j] }));
    await sleep(jitter());
    if ((i / CONC) % 10 === 0) process.stderr.write(`  …${Math.min(i + CONC, targets.length)}/${targets.length}\n`);
  }

  // 괴리 큰 순 정렬 (실제값 있는 것만 정정 대상)
  const corrected = results.filter((r) => r.real != null && r.real !== r.db);
  const hidden = results.filter((r) => r.real == null);
  corrected.sort((a, b) => Math.abs(b.real! - b.db) - Math.abs(a.real! - a.db));

  console.log(`=== 정정 대상 ${corrected.length}개 (DB값 → 실제값) ===`);
  for (const r of corrected) {
    const ratio = (r.db / Math.max(r.real!, 1)).toFixed(1);
    console.log(`  ${String(r.db).padStart(10)} → ${String(r.real).padStart(9)}  (x${ratio})  ${r.handle} | ${r.title}`);
  }
  console.log(`\n미표시(파싱 실패, 미정정) ${hidden.length}개`);
  if (hidden.length) hidden.slice(0, 20).forEach((r) => console.log(`  [미표시] ${String(r.db).padStart(9)} | ${r.handle} | ${r.title}`));

  if (APPLY) {
    for (const r of corrected) {
      await prisma.channel.update({ where: { id: r.id }, data: { subscriberCount: r.real! } });
    }
    console.log(`\n✅ ${corrected.length}개 정정 완료. (미표시 ${hidden.length}개는 DB값 유지)`);
  } else {
    console.log(`\n--apply 를 붙이면 위 ${corrected.length}개를 실제값으로 정정합니다.`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
