// DB 모든 채널의 subCategories 를 (title+description+keywords)만으로 재계산.
// RSS 호출 0. sub-taxonomy.ko.yaml 갱신 후 일괄 재분류용.
//
//   npx tsx scripts/reclassify-subcategories.ts
//   npx tsx scripts/reclassify-subcategories.ts --dry

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { subClassify } from "../lib/subclassify";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

async function main() {
  const rows = await prisma.channel.findMany({
    select: { id: true, title: true, description: true, keywords: true },
  });
  console.log(`🔁 reclassify-subcategories: ${rows.length} channels  dry=${DRY}`);

  let assigned = 0,
    empty = 0;
  const dist: Record<string, number> = {}; // 세부 키별 채널 수

  for (const r of rows) {
    let kw: string[] = [];
    try {
      kw = JSON.parse(r.keywords || "[]");
    } catch {}
    const text = [r.title || "", r.description || "", kw.join(" ")].join("\n");
    const sub = subClassify({ text });
    const keys = Object.keys(sub);
    if (keys.length === 0) {
      empty++;
    } else {
      assigned++;
      for (const k of keys) dist[k] = (dist[k] ?? 0) + 1;
    }
    if (!DRY) {
      await prisma.channel.update({ where: { id: r.id }, data: { subCategories: JSON.stringify(sub) } });
    }
  }

  console.log(`\n✅ assigned=${assigned}  empty(미분류)=${empty}`);
  console.log(`\n세부 카테고리별 채널 수 (top 40):`);
  Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ reclassify-subcategories failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
