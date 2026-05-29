// data/catalog-seed.json → 현재 @prisma/client 가 가리키는 DB 의 Channel + ChannelCluster 복원.
// 협업자가 clone 후 카탈로그를 채울 때 사용. 사용자/인증 데이터는 건드리지 않음.
//
//   # 로컬 SQLite(dev.db): 스키마+SQLite client 생성 후 복원
//   npm run sqlite:push
//   npm run catalog:restore          # = npx tsx scripts/restore-catalog.ts
//
//   # 프로덕션 Neon: .env 에 POSTGRES_PRISMA_URL·POSTGRES_URL_NON_POOLING 채운 뒤
//   npm run db:push                  # 정본 Postgres 스키마로 테이블 생성/동기화
//   npm run catalog:restore
//
// (주의: prisma/migrations 는 레거시 SQLite 산출물 — 운영은 db push 가 정본. migrate 계열 사용 금지.)
// 기존 Channel/ChannelCluster 를 비우고 시드로 교체(멱등). cluster id 는 그대로 보존.

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
const IN = path.resolve(arg() ?? "data/catalog-seed.json");
function arg(): string | undefined {
  return process.argv.slice(2).find((a) => !a.startsWith("--"));
}

async function main() {
  if (!fs.existsSync(IN)) {
    console.error(`❌ seed 파일 없음: ${IN}`);
    process.exit(1);
  }
  const seed = JSON.parse(fs.readFileSync(IN, "utf8")) as { channels: any[]; clusters: any[] };
  console.log(`📥 ${seed.channels.length} channels, ${seed.clusters.length} clusters (${IN})`);

  await prisma.$transaction(
    async (tx) => {
      await tx.channel.deleteMany({});
      await tx.channelCluster.deleteMany({});

      // 클러스터 먼저 (Channel.clusterId FK 대상). id 그대로 보존.
      await tx.channelCluster.createMany({
        data: seed.clusters.map((c) => ({
          id: c.id,
          label: c.label,
          centroid: c.centroid,
          topCategories: c.topCategories,
          topKeywords: c.topKeywords,
          size: c.size,
          color: c.color ?? null,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt),
        })),
      });

      const rows = seed.channels.map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle ?? null,
        thumbnail: c.thumbnail ?? "",
        description: c.description ?? null,
        subscriberCount: c.subscriberCount ?? 0,
        videoCount: c.videoCount ?? 0,
        viewCount: BigInt(c.viewCount ?? "0"),
        country: c.country ?? null,
        isKorean: c.isKorean !== false,
        categories: c.categories ?? "{}",
        subCategories: c.subCategories ?? "{}",
        keywords: c.keywords ?? "[]",
        metrics: c.metrics ?? null,
        clusterId: c.clusterId ?? null,
        similarChannelIds: c.similarChannelIds ?? "[]",
        source: c.source ?? "seed",
        fetchedAt: new Date(c.fetchedAt),
        refreshedAt: new Date(c.refreshedAt),
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await tx.channel.createMany({ data: rows.slice(i, i + 500) });
      }
    },
    { timeout: 120000 },
  );

  const ch = await prisma.channel.count();
  const cl = await prisma.channelCluster.count();
  console.log(`✅ 복원 완료 — Channel: ${ch}  ChannelCluster: ${cl}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ restore failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
