// 전 채널 LLM 재분류 결과를 반영.
// 입력: /tmp/all-assignments.json = [{ id, primary, secondary[], confidence }]
//       /tmp/all-channels.json    = [{ id, title, desc, vtitles }] (세부분류용 영상제목)
//
// high/medium 만 적용(low/unknown 은 현재 분류 유지). categories 는 primary(가중2)+
// secondary(각 1) 정규화 분포, subCategories 는 영상제목 포함 텍스트로 subClassify,
// metrics.classifiedBy="llm" 마커.
//
//   npx tsx scripts/apply-all-categories.ts          # dry
//   npx tsx scripts/apply-all-categories.ts --apply

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { subClassify } from "../lib/subclassify";
import { normalizeTopN } from "../lib/category-utils";
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

function buildCats(primary: string, secondary: string[]): Record<string, number> {
  const raw: Record<string, number> = { [primary]: 2 };
  for (const s of (secondary || [])) {
    if (isCategoryName(s) && s !== primary) raw[s] = (raw[s] || 0) + 1;
  }
  return normalizeTopN(raw, 5);
}

async function main() {
  const assignments: any[] = JSON.parse(fs.readFileSync("/tmp/all-assignments.json", "utf8"));
  const channels: any[] = JSON.parse(fs.readFileSync("/tmp/all-channels.json", "utf8"));
  const vById = new Map<string, string[]>();
  for (const c of channels) vById.set(c.id, c.vtitles || []);
  console.log(`📥 배정 ${assignments.length} / 채널 ${channels.length}  apply=${APPLY}`);

  let applied = 0, skipLowUnknown = 0, skipInvalid = 0, changedTop = 0;
  const catTally: Record<string, number> = {};

  for (const a of assignments) {
    if (!a || a.primary === "unknown" || a.confidence === "low") { skipLowUnknown++; continue; }
    if (!isCategoryName(a.primary)) { skipInvalid++; continue; }

    const ch = await prisma.channel.findUnique({
      where: { id: a.id },
      select: { id: true, title: true, description: true, keywords: true, categories: true, metrics: true },
    });
    if (!ch) { skipInvalid++; continue; }

    const cats = buildCats(a.primary, a.secondary || []);
    let kw: string[] = [];
    try { kw = JSON.parse(ch.keywords || "[]"); } catch {}
    const vt = (vById.get(a.id) || []).join("  ");
    const text = [ch.title || "", ch.description || "", vt, kw.join(" ")].join("\n");
    const subs = subClassify({ text, parentCategories: cats });

    let metrics: Record<string, unknown> = {};
    try { metrics = JSON.parse(ch.metrics || "{}") || {}; } catch {}
    metrics.classifiedBy = "llm";

    let oldTop = "";
    try { oldTop = Object.keys(JSON.parse(ch.categories || "{}"))[0] || ""; } catch {}
    if (oldTop !== a.primary) changedTop++;
    catTally[a.primary] = (catTally[a.primary] || 0) + 1;
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

  console.log(`적용: ${applied} (최상위 바뀜 ${changedTop}) | 스킵(low/unknown ${skipLowUnknown}, invalid ${skipInvalid})`);
  console.log("카테고리 분포:", catTally);
  console.log(APPLY ? "✅ 적용 완료" : "(dry-run) 적용하려면 --apply");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
