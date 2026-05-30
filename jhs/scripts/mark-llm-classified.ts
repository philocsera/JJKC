// 백필: 이미 LLM(영상제목 의미판정)으로 분류된 채널에 metrics.classifiedBy="llm" 마커를 단다.
// classify-empty 워크플로우 배정 결과(/tmp/empty-assignments.json)의 적용된 채널 대상.
// 이후 rss-reclassify 가 이들을 재-비움하지 않는다.
//
//   npx tsx scripts/mark-llm-classified.ts            # dry
//   npx tsx scripts/mark-llm-classified.ts --apply

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { isCategoryName } from "../lib/categories";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const INPUT = "/tmp/empty-assignments.json";

async function main() {
  const assignments: any[] = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  // 적용 대상이었던 것(category 유효 + low/unknown 아님)만.
  const ids = assignments
    .filter((a) => a && a.category !== "unknown" && a.confidence !== "low" && isCategoryName(a.category))
    .map((a) => a.id);
  console.log(`📥 후보 ${ids.length}개  apply=${APPLY}`);

  let marked = 0, skipEmpty = 0, already = 0;
  for (const id of ids) {
    const ch = await prisma.channel.findUnique({ where: { id }, select: { categories: true, metrics: true } });
    if (!ch) continue;
    if (ch.categories === "{}") { skipEmpty++; continue; } // 적용 안 된 것
    let m: any = {};
    try { m = JSON.parse(ch.metrics || "{}") || {}; } catch {}
    if (m.classifiedBy === "llm") { already++; continue; }
    m.classifiedBy = "llm";
    marked++;
    if (APPLY) {
      await prisma.channel.update({ where: { id }, data: { metrics: JSON.stringify(m) } });
    }
  }
  console.log(`마킹: ${marked}  (이미 마킹됨 ${already}, 빈값이라 스킵 ${skipEmpty})`);
  console.log(APPLY ? "✅ 적용 완료" : "(dry-run) 적용하려면 --apply");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
