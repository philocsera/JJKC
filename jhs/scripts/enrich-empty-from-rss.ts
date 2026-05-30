// 빈 카테고리 채널을 "최근 영상 제목"(RSS, 키 0)으로 재분류.
// 저장된 keywords 가 보일러플레이트(채널명+"비즈니스/문의")라 분류가 안 된 채널들을,
// RSS 의 최근 영상 제목(최대 15개)을 신호로 다시 classify 한다.
//
//   npx tsx scripts/enrich-empty-from-rss.ts            # dry (RSS 는 호출, DB 미기록)
//   npx tsx scripts/enrich-empty-from-rss.ts --apply    # categories/subCategories/keywords 갱신
//   npx tsx scripts/enrich-empty-from-rss.ts --limit 20 # 앞 20개만 (표본 검증)

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

async function main() {
  let rows = await prisma.channel.findMany({
    where: { categories: "{}" },
    select: { id: true, title: true, description: true, keywords: true },
  });
  if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT);
  console.log(`🔎 빈 카테고리 RSS 재분류: ${rows.length}개  apply=${APPLY}\n`);

  let filled = 0, stillEmpty = 0, rss404 = 0, rateLimited = 0;
  const samples: string[] = [];

  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const r = rows[i++];
      let feed;
      try {
        feed = await fetchChannelFeed(r.id, { signal: AbortSignal.timeout(8000), throwOnRateLimit: true });
      } catch (e) {
        if (e instanceof RateLimitError) { rateLimited++; continue; }
        feed = null;
      }
      if (!feed) { rss404++; stillEmpty++; continue; }

      const videoTitles = feed.videos.map((v) => v.title).join("  ");
      let oldKw: string[] = [];
      try { oldKw = JSON.parse(r.keywords || "[]"); } catch {}
      const text = [r.title || "", r.description || "", videoTitles, oldKw.join(" ")].join("\n");

      const { categories, keywords } = classify({ text, hintCategory: null });
      if (Object.keys(categories).length === 0) { stillEmpty++; continue; }
      const subs = subClassify({ text, parentCategories: categories });

      filled++;
      if (samples.length < 25) samples.push(`  ● ${r.title}  →  ${topCat(categories)}  ${JSON.stringify(categories).slice(0, 70)}`);

      if (APPLY) {
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
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  console.log(`채워짐: ${filled}개  /  여전히 빈값: ${stillEmpty}개  (RSS 실패 ${rss404}, 레이트리밋 ${rateLimited})\n`);
  console.log("채워진 표본:\n" + samples.join("\n") + "\n");
  console.log(APPLY ? "✅ 적용 완료" : "(dry-run) 적용하려면 --apply");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
