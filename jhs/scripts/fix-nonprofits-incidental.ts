// 비영리·종교 단발성 오탐 강등.
// 원리: 채널 "제목+설명"(채널 본인이 쓴 텍스트)만으로 재분류했을 때 Nonprofits 가
//   살아있으면 진짜(스스로 종교/공익이라 밝힘). 사라지면 → Nonprofits 신호가
//   "영상 키워드"(최근 영상 제목들)에서만 우연히 온 것이므로 단발성 오탐 →
//   stored categories 에서 Nonprofits 제거 후 나머지로 재정규화, subCategories 재계산.
//
//   npx tsx scripts/fix-nonprofits-incidental.ts          # dry
//   npx tsx scripts/fix-nonprofits-incidental.ts --apply

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { classify } from "../lib/classify";
import { subClassify } from "../lib/subclassify";
import { normalizeTopN } from "../lib/category-utils";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const NP = "Nonprofits & Activism";
const topCat = (c: Record<string, number>) =>
  Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

async function main() {
  const rows = await prisma.channel.findMany({
    where: { categories: { contains: NP } },
    select: { id: true, title: true, description: true, keywords: true, categories: true },
  });
  console.log(`🔎 비영리·종교 단발성 오탐 점검: ${rows.length}개 (벡터에 NP 포함)  apply=${APPLY}\n`);

  let genuine = 0, demoted = 0, demotedTop = 0;
  const demotedSamples: string[] = [];
  const keptSamples: string[] = [];

  for (const r of rows) {
    let stored: Record<string, number> = {};
    try { stored = JSON.parse(r.categories || "{}"); } catch {}
    let kw: string[] = [];
    try { kw = JSON.parse(r.keywords || "[]"); } catch {}

    // 제목+설명만 (채널 본인 텍스트) — 영상 키워드 제외.
    const coreText = [r.title || "", r.description || ""].join("\n");
    const coreCats = classify({ text: coreText, hintCategory: null }).categories;

    if (coreCats[NP] !== undefined) {
      genuine++;
      if (keptSamples.length < 12) keptSamples.push(r.title || "");
      continue; // 본문에 종교/공익 신호 있음 → 진짜, 유지
    }

    // 강등: stored 에서 NP 제거 후 재정규화.
    const wasTop = topCat(stored) === NP;
    const { [NP]: _drop, ...rest } = stored;
    const newCats = normalizeTopN(rest, 10);
    const fullText = [r.title || "", r.description || "", kw.join(" ")].join("\n");
    const newSubs = subClassify({ text: fullText, parentCategories: newCats });

    demoted++;
    if (wasTop) demotedTop++;
    if (demotedSamples.length < 18) {
      demotedSamples.push(`  ● ${r.title}  →  top: ${topCat(newCats) ?? "(빈값)"}`);
    }

    if (APPLY) {
      await prisma.channel.update({
        where: { id: r.id },
        data: { categories: JSON.stringify(newCats), subCategories: JSON.stringify(newSubs) },
      });
    }
  }

  console.log(`진짜(제목/설명에 종교·공익 신호) 유지: ${genuine}개`);
  console.log(`단발성 오탐 강등: ${demoted}개 (그중 NP 가 1순위였던 것: ${demotedTop}개)\n`);
  console.log("유지 표본: " + keptSamples.join(" · ") + "\n");
  console.log("강등 표본:\n" + demotedSamples.join("\n") + "\n");
  console.log(APPLY ? "✅ 적용 완료" : "(dry-run) 적용하려면 --apply");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
