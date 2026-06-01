// 비영리·종교(Nonprofits & Activism) 카테고리 전체 재검토.
// lexicon 정밀화(기도/후원/기부/기관/구원/미사 제거, 전도→전도사·신부→신부님) 후,
// 현재 이 카테고리가 붙은 채널만 다시 분류해 categories + subCategories 를 갱신한다.
//
//   npx tsx scripts/review-nonprofits.ts          # dry: 변화 리포트만
//   npx tsx scripts/review-nonprofits.ts --apply  # categories+subCategories 갱신

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { classify } from "../lib/classify";
import { subClassify } from "../lib/subclassify";

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
    select: { id: true, title: true, description: true, keywords: true, categories: true, subCategories: true },
  });
  console.log(`🔎 비영리·종교 재검토: ${rows.length}개 채널  apply=${APPLY}\n`);

  let lostNp = 0, wasTopNowNot = 0, stillNpTop = 0, changedTop = 0;
  const watch = ["쁘허", "책식주의", "책그림"];
  const samples: string[] = [];

  for (const r of rows) {
    let oldCats: Record<string, number> = {};
    try { oldCats = JSON.parse(r.categories || "{}"); } catch {}
    let kw: string[] = [];
    try { kw = JSON.parse(r.keywords || "[]"); } catch {}

    const text = [r.title || "", r.description || "", kw.join(" ")].join("\n");
    const newCats = classify({ text, hintCategory: null }).categories;
    const newSubs = subClassify({ text, parentCategories: newCats });

    const oldTop = topCat(oldCats);
    const newTop = topCat(newCats);
    const hadNp = oldCats[NP] !== undefined;
    const hasNp = newCats[NP] !== undefined;

    if (hadNp && !hasNp) lostNp++;
    if (oldTop === NP && newTop !== NP) wasTopNowNot++;
    if (newTop === NP) stillNpTop++;
    if (oldTop !== newTop) changedTop++;

    if (watch.includes(r.title || "")) {
      samples.push(
        `  ● ${r.title}\n     before: ${JSON.stringify(oldCats).slice(0, 110)}\n     after:  ${JSON.stringify(newCats).slice(0, 110)}`,
      );
    }

    if (APPLY) {
      await prisma.channel.update({
        where: { id: r.id },
        data: { categories: JSON.stringify(newCats), subCategories: JSON.stringify(newSubs) },
      });
    }
  }

  console.log(`Nonprofits 점수 완전 제거: ${lostNp}개`);
  console.log(`Nonprofits 가 1순위였다가 → 아니게 됨: ${wasTopNowNot}개`);
  console.log(`여전히 Nonprofits 1순위(진짜 종교/비영리로 추정): ${stillNpTop}개`);
  console.log(`최상위 카테고리 바뀐 채널: ${changedTop}개\n`);
  if (samples.length) console.log("지목 채널:\n" + samples.join("\n") + "\n");
  console.log(APPLY ? "✅ 적용 완료" : "(dry-run) 적용하려면 --apply");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
