// Autos & Vehicles 의 "차"(출발/차이/절차/핵잠+차…) substring 오탐 정리.
// lexicon 에서 차/현대/기아 를 제거(현대자동차/전기차/SUV 등으로 대체)한 뒤,
// 현재 Autos 가 붙은 채널을 점검: 정밀화된 lexicon 으로 다시 분류했을 때 Autos 가
// 살아있으면(진짜 자동차/테슬라/시승/오토바이/모터스…) 유지, 사라지면 → "차" 노이즈
// 였던 것이므로 stored 벡터에서 Autos 제거 후 재정규화, subCategories 재계산.
//
//   npx tsx scripts/review-autos.ts          # dry
//   npx tsx scripts/review-autos.ts --apply

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
const AU = "Autos & Vehicles";
const topCat = (c: Record<string, number>) =>
  Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

async function main() {
  const rows = await prisma.channel.findMany({
    where: { categories: { contains: AU } },
    select: { id: true, title: true, description: true, keywords: true, categories: true },
  });
  console.log(`🔎 Autos & Vehicles 정리: ${rows.length}개 (벡터에 Autos 포함)  apply=${APPLY}\n`);

  let genuine = 0, demoted = 0, demotedTop = 0, nowEmpty = 0;
  const keptSamples: string[] = [];
  const demotedSamples: string[] = [];

  for (const r of rows) {
    let stored: Record<string, number> = {};
    try { stored = JSON.parse(r.categories || "{}"); } catch {}
    let kw: string[] = [];
    try { kw = JSON.parse(r.keywords || "[]"); } catch {}

    // 정밀화된 lexicon 으로 재분류 — Autos 가 살아있으면 진짜 자동차 신호가 있는 것.
    const text = [r.title || "", r.description || "", kw.join(" ")].join("\n");
    const reCats = classify({ text, hintCategory: null }).categories;

    if (reCats[AU] !== undefined) {
      genuine++;
      if (keptSamples.length < 14) keptSamples.push(r.title || "");
      continue;
    }

    const wasTop = topCat(stored) === AU;
    const { [AU]: _drop, ...rest } = stored;
    const newCats = normalizeTopN(rest, 10);
    const newSubs = subClassify({ text, parentCategories: newCats });

    demoted++;
    if (wasTop) demotedTop++;
    if (Object.keys(newCats).length === 0) nowEmpty++;
    if (wasTop && demotedSamples.length < 20) {
      demotedSamples.push(`  ● ${r.title}  →  ${topCat(newCats) ?? "(빈값)"}`);
    }

    if (APPLY) {
      await prisma.channel.update({
        where: { id: r.id },
        data: { categories: JSON.stringify(newCats), subCategories: JSON.stringify(newSubs) },
      });
    }
  }

  console.log(`진짜 자동차(유지): ${genuine}개`);
  console.log(`"차" 노이즈 강등: ${demoted}개 (그중 Autos 1순위였던 것: ${demotedTop}개, 강등 후 빈값: ${nowEmpty}개)\n`);
  console.log("유지 표본: " + keptSamples.join(" · ") + "\n");
  console.log("강등 표본(1순위였던 것):\n" + demotedSamples.join("\n") + "\n");
  console.log(APPLY ? "✅ 적용 완료" : "(dry-run) 적용하려면 --apply");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
