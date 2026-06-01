// 채널↔채널 유사도 사전계산. 외부 호출 0 — DB 의 categories/subCategories/keywords 만 사용.
// 사용자↔채널 추천과 같은 척도(profileSimilarity)를 채널 두 개에 그대로 적용한다.
//
// 후보 좁히기: 같은 클러스터 안에서만 비교(전체 N² 대신 Σ 클러스터크기²).
// 클러스터가 없는(clusterId=null) 채널은 dominant 카테고리가 같은 채널끼리 비교.
//
//   npx tsx scripts/compute-channel-similarity.ts [--topk 12] [--dry]

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { profileSimilarity } from "../lib/profiler";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");
const argN = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : dflt;
};
const TOPK = argN("topk", 12);

type Ch = {
  id: string;
  clusterId: number | null;
  categories: Record<string, number>;
  subCategories: Record<string, number>;
  keywords: string[];
};

function parse<T>(s: string | null, d: T): T {
  if (!s) return d;
  try { return JSON.parse(s) as T; } catch { return d; }
}

function dominant(cats: Record<string, number>): string {
  const e = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  return e ? e[0] : "(none)";
}

async function main() {
  const rows = await prisma.channel.findMany({
    where: { isKorean: true },
    select: { id: true, clusterId: true, categories: true, subCategories: true, keywords: true },
  });
  const channels: Ch[] = rows.map((r) => ({
    id: r.id,
    clusterId: r.clusterId,
    categories: parse(r.categories, {}),
    subCategories: parse(r.subCategories, {}),
    keywords: parse(r.keywords, []),
  }));
  console.log(`채널 ${channels.length}개 — 유사도 사전계산 (topK=${TOPK}, ${DRY ? "dry-run" : "APPLY"})`);

  // 후보 버킷: 클러스터 있으면 클러스터, 없으면 dominant 카테고리.
  const buckets = new Map<string, Ch[]>();
  for (const c of channels) {
    const key = c.clusterId != null ? `c${c.clusterId}` : `d:${dominant(c.categories)}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(c);
  }
  console.log(`후보 버킷 ${buckets.size}개 (최대 ${Math.max(...[...buckets.values()].map((b) => b.length))}개)`);

  const sim = (a: Ch, b: Ch) =>
    profileSimilarity(
      { categories: a.categories, topKeywords: a.keywords, subCategories: a.subCategories },
      { categories: b.categories, topKeywords: b.keywords, subCategories: b.subCategories },
    );

  const result = new Map<string, { id: string; score: number }[]>();
  let pairs = 0;
  for (const bucket of buckets.values()) {
    for (const a of bucket) {
      const scored: { id: string; score: number }[] = [];
      for (const b of bucket) {
        if (a.id === b.id) continue;
        const s = sim(a, b);
        pairs++;
        if (s > 0) scored.push({ id: b.id, score: s });
      }
      scored.sort((x, y) => y.score - x.score);
      result.set(a.id, scored.slice(0, TOPK));
    }
  }
  console.log(`비교 쌍 ${pairs.toLocaleString()}개 — ${result.size}개 채널에 유사목록 산출`);

  // 분포 미리보기
  const sizes = [...result.values()].map((v) => v.length);
  const withSome = sizes.filter((n) => n > 0).length;
  console.log(`유사 채널 1개 이상 있는 채널: ${withSome} / ${result.size}`);

  if (DRY) {
    const sample = [...result.entries()].find(([, v]) => v.length >= 3);
    if (sample) console.log(`예시 ${sample[0]}: ${JSON.stringify(sample[1].slice(0, 3))}`);
    console.log("--apply 없이 dry-run — 저장 안 함.");
    await prisma.$disconnect();
    return;
  }

  let n = 0;
  for (const [id, sims] of result) {
    await prisma.channel.update({ where: { id }, data: { similarChannelIds: JSON.stringify(sims) } });
    if (++n % 1000 === 0) process.stderr.write(`  …${n}/${result.size}\n`);
  }
  console.log(`✅ ${n}개 채널 similarChannelIds 저장 완료.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
