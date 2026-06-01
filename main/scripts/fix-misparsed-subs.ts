// 핸들 문자열을 구독자수로 오파싱한 채널 정제.
// 자동생성 핸들 "@모바일게임-k7m" / "@김민석-n8m2s" / "@100mishop" 의 "7m"/"8m"/"100m" 이
// 700만/800만/1억 구독자로 잘못 저장됐다. 옛 parseSubs 의 M/K/B 정규식을 그대로 재현해
// 핸들에서 뽑은 값이 저장된 subscriberCount 와 "정확히 일치"할 때만 오염으로 판정 → 0(미상)으로 리셋.
// 정확 일치 조건이라 실제 대형 채널(@boramtubevlog4821 등)은 건드리지 않는다.
//
//   npx tsx scripts/fix-misparsed-subs.ts          # 미리보기(dry-run)
//   npx tsx scripts/fix-misparsed-subs.ts --apply   # 실제 반영

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

// 옛 버그 정규식 재현: 핸들에서 "<숫자><M|K|B>" 의 값
function subsFromHandleBug(handle: string | null): number | null {
  if (!handle) return null;
  const m = handle.replace(/,/g, "").match(/([\d.]+)\s*([MKB])/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const u = m[2].toUpperCase();
  return u === "B" ? Math.round(n * 1e9) : u === "M" ? Math.round(n * 1e6) : Math.round(n * 1e3);
}

async function main() {
  const channels = await prisma.channel.findMany({
    select: { id: true, title: true, handle: true, subscriberCount: true, source: true },
  });

  const tainted = channels.filter((c) => {
    const v = subsFromHandleBug(c.handle);
    return v != null && v === c.subscriberCount && c.subscriberCount > 0;
  });

  console.log(`총 ${channels.length}개 중 오파싱 ${tainted.length}개:`);
  for (const c of tainted.sort((a, b) => b.subscriberCount - a.subscriberCount)) {
    console.log(`  ${String(c.subscriberCount).padStart(10)} | ${c.handle} | ${c.title}`);
  }

  if (!APPLY) {
    console.log(`\n[dry-run] --apply 를 붙이면 위 ${tainted.length}개의 subscriberCount 를 0(미상)으로 리셋합니다.`);
  } else {
    const ids = tainted.map((c) => c.id);
    const r = await prisma.channel.updateMany({
      where: { id: { in: ids } },
      data: { subscriberCount: 0 },
    });
    console.log(`\n✅ ${r.count}개 채널 subscriberCount → 0 (미상) 리셋 완료.`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
