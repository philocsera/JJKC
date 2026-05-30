// 워크맨 패턴 탐지: 설명글의 "나열(enumeration)" 이 카테고리 분류를 좌우한
// 오분류 후보를 찾는다.
//
// 원리: 채널 설명에 `청소.인력.식당.요리.철거` 처럼 짧은 토큰을 구분자(. · / , |)로
//   이어붙인 나열이 있으면, 그 안의 단어가 엉뚱한 카테고리 키워드로 잡힌다.
//   → 나열 구간을 제거하고 classify() 를 다시 돌려, 최상위 카테고리가 "바뀌면"
//     그 나열이 분류를 좌우한 것이므로 오분류 후보로 플래그.
//
//   npx tsx scripts/detect-enum-misclassify.ts          # dry: 후보 리포트만
//   npx tsx scripts/detect-enum-misclassify.ts --apply  # categories 를 정제 결과로 갱신
//   npx tsx scripts/detect-enum-misclassify.ts --json out.json
//
// --apply 후 세부카테고리도 맞추려면: npx tsx scripts/reclassify-subcategories.ts

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
const flag = (n: string) => process.argv.includes(`--${n}`);
const APPLY = flag("apply");
const jsonIdx = process.argv.indexOf("--json");
const JSON_OUT = jsonIdx >= 0 ? process.argv[jsonIdx + 1] : null;

// 나열 구간: 짧은 토큰(한/영/숫자 1~6자)을 구분자(. · / , |)로 4개 이상 이어붙인 런.
// 구분자 사이에 공백이 없어야 함 — 일반 문장(공백 있음)은 잡히지 않는다.
const ENUM_RE = /[가-힣A-Za-z0-9]{1,6}(?:[./·,|][가-힣A-Za-z0-9]{1,6}){3,}/g;

const topCat = (cats: Record<string, number>): string | null => {
  const e = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  return e ? e[0] : null;
};

async function main() {
  const rows = await prisma.channel.findMany({
    select: { id: true, title: true, description: true, keywords: true, categories: true },
  });
  console.log(`🔎 detect-enum-misclassify: ${rows.length} channels  apply=${APPLY}\n`);

  const hits: any[] = [];
  let withEnum = 0;

  for (const r of rows) {
    const desc = r.description || "";
    const runs = desc.match(ENUM_RE);
    if (!runs) continue;
    withEnum++;

    let kw: string[] = [];
    try { kw = JSON.parse(r.keywords || "[]"); } catch {}

    const buildText = (d: string) => [r.title || "", d, kw.join(" ")].join("\n");
    const cleanedDesc = desc.replace(ENUM_RE, " ");

    const orig = classify({ text: buildText(desc), hintCategory: null }).categories;
    const cleaned = classify({ text: buildText(cleanedDesc), hintCategory: null }).categories;

    const tOrig = topCat(orig);
    const tClean = topCat(cleaned);

    // 최상위 카테고리가 나열 제거로 바뀐 경우만 = 나열이 분류를 좌우.
    if (tOrig && tClean && tOrig !== tClean) {
      hits.push({
        id: r.id,
        title: r.title,
        enumRuns: runs,
        topBefore: tOrig,
        topAfter: tClean,
        before: orig,
        after: cleaned,
      });
    }
  }

  hits.sort((a, b) => (a.topBefore < b.topBefore ? -1 : 1));

  console.log(`나열 포함 채널: ${withEnum}개 / 오분류 후보(최상위 카테고리 뒤바뀜): ${hits.length}개\n`);
  for (const h of hits) {
    console.log(`● ${h.title}  (${h.id})`);
    console.log(`   나열: ${h.enumRuns.join("  |  ").slice(0, 100)}`);
    console.log(`   ${h.topBefore}  →  ${h.topAfter}`);
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify(hits, null, 2));
    console.log(`\n📄 ${JSON_OUT} 저장 (${hits.length}건)`);
  }

  if (APPLY) {
    for (const h of hits) {
      await prisma.channel.update({
        where: { id: h.id },
        data: { categories: JSON.stringify(h.after) },
      });
    }
    console.log(`\n✅ ${hits.length}개 채널 categories 갱신 완료 (세부카테고리는 reclassify-subcategories.ts 로 후속)`);
  } else {
    console.log(`\n(dry-run) 적용하려면 --apply`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
