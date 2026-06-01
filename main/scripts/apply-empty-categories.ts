// 워크플로우(LLM 판정) 결과를 빈 카테고리 채널에 반영.
// 입력: /tmp/empty-assignments.json = [{ id, category, confidence, reason }]
// high/medium confidence + category!=unknown 만 적용. categories={category:100},
// subCategories 는 subClassify 로 재계산.
//
//   npx tsx scripts/apply-empty-categories.ts          # dry
//   npx tsx scripts/apply-empty-categories.ts --apply

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { subClassify } from "../lib/subclassify";
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
  console.log(`📥 ${assignments.length}개 배정 로드  apply=${APPLY}`);

  let applied = 0, skipLow = 0, skipUnknown = 0, skipInvalid = 0, skipNotEmpty = 0;
  const catTally: Record<string, number> = {};

  for (const a of assignments) {
    if (!a || a.category === "unknown") { skipUnknown++; continue; }
    if (a.confidence === "low") { skipLow++; continue; }
    if (!isCategoryName(a.category)) { skipInvalid++; continue; }

    const ch = await prisma.channel.findUnique({
      where: { id: a.id },
      select: { id: true, title: true, description: true, keywords: true, categories: true, metrics: true },
    });
    if (!ch) { skipInvalid++; continue; }
    // 그 사이 비어있지 않게 됐으면 건너뜀(안전).
    if (ch.categories !== "{}") { skipNotEmpty++; continue; }

    let kw: string[] = [];
    try { kw = JSON.parse(ch.keywords || "[]"); } catch {}
    const text = [ch.title || "", ch.description || "", kw.join(" ")].join("\n");
    const cats = { [a.category]: 100 };
    const subs = subClassify({ text, parentCategories: cats });

    // 마커: LLM(영상제목 의미판정)으로 분류됨 → rss-reclassify 가 재-비움하지 않도록.
    let metrics: Record<string, unknown> = {};
    try { metrics = JSON.parse(ch.metrics || "{}") || {}; } catch {}
    metrics.classifiedBy = "llm";

    catTally[a.category] = (catTally[a.category] || 0) + 1;
    applied++;
    if (APPLY) {
      await prisma.channel.update({
        where: { id: ch.id },
        data: {
          categories: JSON.stringify(cats),
          subCategories: JSON.stringify(subs),
          metrics: JSON.stringify(metrics),
        },
      });
    }
  }

  console.log(`적용: ${applied}  | 스킵(unknown ${skipUnknown}, low ${skipLow}, invalid ${skipInvalid}, 이미채워짐 ${skipNotEmpty})`);
  console.log("카테고리별 배정:", catTally);
  console.log(APPLY ? "✅ 적용 완료" : "(dry-run) 적용하려면 --apply");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
