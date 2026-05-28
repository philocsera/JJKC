// Music 카테고리 제거 1단계: classify() dominant 가 "Music" 인 채널을 DB에서 삭제.
// ※ category-lexicon 에서 Music 을 빼기 "전에" 실행해야 한다 (그래야 음악 채널을 식별).
//
//   npx tsx scripts/remove-music.ts --dry
//   npx tsx scripts/remove-music.ts

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { classify } from "../lib/classify";

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
    select: { id: true, title: true, description: true, keywords: true, subscriberCount: true },
  });
  console.log(`🎵 remove-music: ${rows.length} channels  dry=${DRY}`);

  const toDelete: { id: string; title: string; subs: number }[] = [];
  for (const r of rows) {
    let kw: string[] = [];
    try {
      kw = JSON.parse(r.keywords || "[]");
    } catch {}
    const text = [r.title || "", r.description || "", kw.join(" ")].join("\n");
    const { categories } = classify({ text, hintCategory: null });
    const keys = Object.keys(categories);
    if (keys.length === 0) continue;
    const dom = keys.sort((a, b) => categories[b] - categories[a])[0];
    if (dom === "Music") toDelete.push({ id: r.id, title: r.title, subs: r.subscriberCount });
  }

  console.log(`\n삭제 대상(music dominant): ${toDelete.length}`);
  toDelete
    .sort((a, b) => b.subs - a.subs)
    .slice(0, 15)
    .forEach((c) => console.log(`  ${String(c.subs).padStart(9)} | ${c.title}`));

  if (!DRY && toDelete.length > 0) {
    const ids = toDelete.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 200) {
      await prisma.channel.deleteMany({ where: { id: { in: ids.slice(i, i + 200) } } });
    }
    const total = await prisma.channel.count();
    console.log(`\n✅ 삭제 완료 — 남은 Channel: ${total}`);
  } else if (DRY) {
    console.log(`\n[--dry] 삭제 안 함.`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ remove-music failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
