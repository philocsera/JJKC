// 빈 카테고리 채널들의 최근 영상 제목을 RSS 로 모아 JSON 으로 덤프.
// LLM 에이전트가 영상 제목을 보고 카테고리를 판정하는 워크플로우 입력용.
//   npx tsx scripts/dump-empty-rss.ts > /tmp/empty-channels.json

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

async function main() {
  const rows = await prisma.channel.findMany({
    where: { categories: "{}" },
    select: { id: true, title: true, description: true },
    orderBy: { subscriberCount: "desc" },
  });

  const out: any[] = [];
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const r = rows[i++];
      let vtitles: string[] = [];
      try {
        const feed = await fetchChannelFeed(r.id, { signal: AbortSignal.timeout(8000) });
        vtitles = (feed?.videos ?? []).map((v) => v.title).slice(0, 12);
      } catch {}
      out.push({
        id: r.id,
        title: r.title,
        desc: (r.description || "").slice(0, 120),
        vtitles,
      });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  // stderr 로 진행, stdout 으로 JSON.
  process.stderr.write(`dumped ${out.length} empty channels (with RSS titles)\n`);
  process.stdout.write(JSON.stringify(out));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  process.stderr.write("failed: " + e + "\n");
  await prisma.$disconnect();
  process.exit(1);
});
