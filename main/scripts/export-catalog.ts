// 카탈로그(Channel + ChannelCluster)만 JSON 시드로 export → data/catalog-seed.json.
// 사용자/인증 테이블(User·Account·AlgoProfile 등)은 제외 — 토큰·이메일 유출 방지.
// dev.db 는 .gitignore 라, 이 시드 파일이 협업자에게 카탈로그를 전달하는 경로.
//
//   npx tsx scripts/export-catalog.ts

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const OUT = path.resolve("data/catalog-seed.json");

async function main() {
  const channels = await prisma.channel.findMany();
  const clusters = await prisma.channelCluster.findMany();

  const out = {
    generatedAt: new Date().toISOString(),
    channels: channels.map((c) => ({
      ...c,
      viewCount: c.viewCount.toString(), // BigInt → string
      fetchedAt: c.fetchedAt.toISOString(),
      refreshedAt: c.refreshedAt.toISOString(),
    })),
    clusters: clusters.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };

  fs.writeFileSync(OUT, JSON.stringify(out));
  const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
  console.log(`✅ exported ${channels.length} channels, ${clusters.length} clusters → ${OUT} (${mb} MB)`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ export failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
