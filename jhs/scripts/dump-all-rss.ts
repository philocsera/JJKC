// 전 채널의 최근 영상 제목을 RSS 로 수집 → JSON 덤프.
// 전 카탈로그 LLM 재분류(채널 하나하나 재검토) 워크플로우 입력용.
//   npx tsx scripts/dump-all-rss.ts > /tmp/all-channels.json

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { fetchChannelFeed } from "../lib/sources/rss";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const CONCURRENCY = 8;

async function main() {
  const rows = await prisma.channel.findMany({
    select: { id: true, title: true, description: true, categories: true, subscriberCount: true },
    orderBy: { subscriberCount: "desc" },
  });

  const out: any[] = new Array(rows.length);
  let done = 0, i = 0;
  async function worker() {
    while (i < rows.length) {
      const idx = i++;
      const r = rows[idx];
      let vtitles: string[] = [];
      try {
        const feed = await fetchChannelFeed(r.id, { signal: AbortSignal.timeout(8000) });
        vtitles = (feed?.videos ?? []).map((v) => v.title).slice(0, 12);
      } catch {}
      out[idx] = {
        id: r.id,
        title: r.title,
        desc: (r.description || "").slice(0, 120),
        cur: Object.keys((() => { try { return JSON.parse(r.categories || "{}"); } catch { return {}; } })())[0] || "",
        vtitles,
      };
      if (++done % 500 === 0) process.stderr.write(`  ...${done}/${rows.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  process.stderr.write(`dumped ${out.length} channels (with RSS titles)\n`);
  process.stdout.write(JSON.stringify(out));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  process.stderr.write("failed: " + e + "\n");
  await prisma.$disconnect();
  process.exit(1);
});
