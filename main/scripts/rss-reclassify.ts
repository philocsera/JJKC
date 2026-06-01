// lexicon 정밀화 후, 영향받는 채널만 "영상 제목(RSS)" 기준으로 정확히 재분류.
//
// 대상(needsWork): (a) 빈 카테고리 채널, 또는 (b) keyword-only 재분류 시 stored 카테고리
//   중 하나가 사라지는 채널(=노이즈 제거 대상 또는 키워드 빈약). 이들만 RSS 로 영상
//   제목을 가져와 정밀화된 lexicon 으로 재분류 → 진짜 채널은 유지(T1=Gaming), 노이즈는
//   제거(흑백리뷰 S&T). 키워드가 stored 를 충분히 지지하는 채널은 건드리지 않는다.
//
//   npx tsx scripts/rss-reclassify.ts            # dry (RSS 미호출, 대상 수만)
//   npx tsx scripts/rss-reclassify.ts --apply    # RSS 호출 + categories/subCategories/keywords 갱신
//   npx tsx scripts/rss-reclassify.ts --limit 30 # 표본

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { classify } from "../lib/classify";
import { subClassify } from "../lib/subclassify";
import { fetchChannelFeed, RateLimitError } from "../lib/sources/rss";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const limIdx = process.argv.indexOf("--limit");
const LIMIT = limIdx >= 0 ? parseInt(process.argv[limIdx + 1], 10) : Infinity;
const CONCURRENCY = 5;
const topCat = (c: Record<string, number>) =>
  Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

function needsWork(stored: Record<string, number>, kwCats: Record<string, number>): boolean {
  const keys = Object.keys(stored);
  if (keys.length === 0) return true;                       // 빈값
  return keys.some((k) => kwCats[k] === undefined);          // stored 카테고리 중 키워드로 지지 안 되는 게 있음
}

async function main() {
  const all = await prisma.channel.findMany({
    select: { id: true, title: true, description: true, keywords: true, categories: true, metrics: true },
  });

  // 대상 선별 (RSS 없이 classify 만으로).
  const targets = all.filter((r) => {
    // LLM(영상제목 의미판정)으로 분류된 채널은 키워드로 지지 안 돼도 정상이므로 제외
    // — rss-reclassify 가 이들을 재-비움하던 순환을 끊는다.
    let m: any = {};
    try { m = JSON.parse(r.metrics || "{}") || {}; } catch {}
    if (m.classifiedBy === "llm") return false;

    let stored: Record<string, number> = {};
    try { stored = JSON.parse(r.categories || "{}"); } catch {}
    let kw: string[] = [];
    try { kw = JSON.parse(r.keywords || "[]"); } catch {}
    const kwCats = classify({ text: [r.title || "", r.description || "", kw.join(" ")].join("\n") }).categories;
    return needsWork(stored, kwCats);
  });

  const work = Number.isFinite(LIMIT) ? targets.slice(0, LIMIT) : targets;
  console.log(`🔧 RSS 재분류 대상: ${targets.length}개 (전체 ${all.length}) / 이번 실행 ${work.length}  apply=${APPLY}\n`);
  if (!APPLY) {
    console.log("(dry-run) RSS 미호출. 적용하려면 --apply (RSS 호출, 수 분 소요)");
    await prisma.$disconnect();
    return;
  }

  let updated = 0, toEmpty = 0, rss404 = 0, rateLimited = 0, topChanged = 0, keptNonEmpty = 0;
  const samples: string[] = [];

  let i = 0;
  async function worker() {
    while (i < work.length) {
      const r = work[i++];
      let stored: Record<string, number> = {};
      try { stored = JSON.parse(r.categories || "{}"); } catch {}
      let oldKw: string[] = [];
      try { oldKw = JSON.parse(r.keywords || "[]"); } catch {}

      let feed;
      try {
        feed = await fetchChannelFeed(r.id, { signal: AbortSignal.timeout(8000), throwOnRateLimit: true });
      } catch (e) {
        if (e instanceof RateLimitError) { rateLimited++; continue; }
        feed = null;
      }
      if (!feed) { rss404++; continue; }

      const titles = feed.videos.map((v) => v.title).join("  ");
      const text = [r.title || "", r.description || "", titles, oldKw.join(" ")].join("\n");
      const { categories, keywords } = classify({ text, hintCategory: null });

      // Guard: RSS 재분류 결과가 비었는데 기존 카테고리가 있으면 덮어쓰지 않는다
      // (영상제목이 lexicon 과 안 맞는 채널을 빈값으로 강등하는 사고 방지).
      if (Object.keys(categories).length === 0 && Object.keys(stored).length > 0) {
        keptNonEmpty++;
        continue;
      }

      const subs = subClassify({ text, parentCategories: categories });

      if (topCat(stored) !== topCat(categories)) topChanged++;
      if (Object.keys(categories).length === 0) toEmpty++;
      updated++;
      if (samples.length < 18 && topCat(stored) !== topCat(categories)) {
        samples.push(`  ● ${r.title}  ${topCat(stored) ?? "(빈)"} → ${topCat(categories) ?? "(빈)"}`);
      }

      await prisma.channel.update({
        where: { id: r.id },
        data: {
          categories: JSON.stringify(categories),
          subCategories: JSON.stringify(subs),
          keywords: JSON.stringify(keywords),
        },
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));

  console.log(`갱신: ${updated}개 (최상위 바뀜 ${topChanged}, 빈값 ${toEmpty})  보존(비-empty 유지) ${keptNonEmpty}, RSS실패 ${rss404}, 레이트리밋 ${rateLimited}\n`);
  console.log("최상위 바뀐 표본:\n" + samples.join("\n") + "\n✅ 적용 완료");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
