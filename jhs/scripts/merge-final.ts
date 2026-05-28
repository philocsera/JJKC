// channels-final.json (외부에서 보강한 카탈로그 스냅샷) → dev.db 머지.
//
//   npx tsx scripts/merge-final.ts [../channels-final.json]
//
// 정책 (통째 덮어쓰기 ❌ — 후퇴/누락을 막는 머지):
//   - JSON 을 베이스로 채널/메트릭/구독자수/클러스터를 보강한다.
//   - 분류 후퇴 방지: JSON 의 categories 가 비었는데('{}') DB 에 분류가 있으면
//     DB 값을 보존한다. 이렇게 복원한 채널은 새 클러스터 centroid 에 최근접 배정.
//   - 누락 보호: DB 엔 있고 JSON 엔 없는 채널 중 subscriberCount>0 인 것은
//     DB 레코드로 다시 추가한다 (구독자 0 인 정크는 버린다).
//   - source 손상 보정: source 가 허용값이 아니면 DB 의 source(있으면)로 복원.
//   - 클러스터는 JSON 의 20 개를 그대로 채택하되, 복원/재추가 채널을 최근접
//     centroid 로 추가 배정한다 (기존 kmeans 배정은 보존).

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const prisma = new PrismaClient();

const VALID_SOURCES = new Set([
  "seed",
  "trending",
  "search",
  "snowball",
  "mock",
  "seed-enrich",
  "playboard-scrape",
  "external-dump",
]);

type JsonChannel = {
  id: string;
  title: string;
  handle: string | null;
  thumbnail: string;
  description: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: string;
  country: string | null;
  isKorean: boolean;
  categories: string;
  keywords: string;
  metrics: string | null;
  clusterId: number | null;
  source: string;
  fetchedAt: string;
  refreshedAt: string;
};

type JsonCluster = {
  id: number;
  label: string;
  centroid: string;
  topCategories: string;
  topKeywords: string;
  size: number;
  color: string | null;
};

// lib/profiler.ts 의 cosineSimilarity 와 동일 (import 부작용 피하려고 인라인).
function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0,
    na = 0,
    nb = 0;
  keys.forEach((k) => {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  });
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function parseObj(s: string | null | undefined): Record<string, number> {
  if (!s) return {};
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}
function isEmptyCat(s: string | null | undefined): boolean {
  return Object.keys(parseObj(s)).length === 0;
}

type FinalChannel = {
  id: string;
  title: string;
  handle: string | null;
  thumbnail: string;
  description: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: bigint;
  country: string | null;
  isKorean: boolean;
  categories: string;
  keywords: string;
  metrics: string | null;
  source: string;
  fetchedAt: Date;
  refreshedAt: Date;
  // 머지 단계의 그룹핑 키 (JSON 클러스터 id). DB 작성 시 새 id 로 매핑된다.
  clusterJsonId: number | null;
};

async function main() {
  const posArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const jsonPath = posArg ?? path.resolve("..", "channels-final.json");
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
    channels: JsonChannel[];
    clusters: JsonCluster[];
  };
  console.log(`📥 JSON: ${raw.channels.length} channels, ${raw.clusters.length} clusters (${jsonPath})`);

  // DB 현재 상태.
  const dbRows = await prisma.channel.findMany();
  const dbMap = new Map(dbRows.map((c) => [c.id, c]));
  const jsonIds = new Set(raw.channels.map((c) => c.id));

  // 클러스터 centroid 파싱 (최근접 배정용).
  const clusterCentroids = raw.clusters.map((c) => ({
    jsonId: c.id,
    centroid: parseObj(c.centroid),
  }));
  function nearestCluster(cat: Record<string, number>): number | null {
    let best: number | null = null;
    let bestScore = 0;
    for (const c of clusterCentroids) {
      const s = cosineSimilarity(cat, c.centroid);
      if (s > bestScore) {
        bestScore = s;
        best = c.jsonId;
      }
    }
    return best; // 모든 점수 0 이면 null (배정 불가)
  }

  const stats = {
    catRestored: 0,
    reassignedAfterRestore: 0,
    sourceFixed: 0,
    readded: 0,
    readdedAssigned: 0,
    keptNull: 0,
  };

  const finals: FinalChannel[] = [];

  // 1) JSON 채널 처리 (베이스).
  for (const j of raw.channels) {
    const db = dbMap.get(j.id);
    let categories = j.categories;
    let clusterJsonId = j.clusterId;

    // 분류 후퇴 복원: JSON 비었고 DB 에 분류 있으면 DB 채택 + 최근접 재배정.
    if (isEmptyCat(categories) && db && !isEmptyCat(db.categories)) {
      categories = db.categories;
      stats.catRestored++;
      clusterJsonId = nearestCluster(parseObj(categories));
      if (clusterJsonId != null) stats.reassignedAfterRestore++;
      else stats.keptNull++;
    } else if (isEmptyCat(categories)) {
      // 진짜 미분류 — clusterId 그대로 null.
      stats.keptNull++;
    }

    // source 손상 보정.
    let source = j.source;
    if (!VALID_SOURCES.has(source)) {
      source = db && VALID_SOURCES.has(db.source) ? db.source : "search";
      stats.sourceFixed++;
    }

    finals.push({
      id: j.id,
      title: j.title || "(untitled)",
      handle: j.handle ?? null,
      thumbnail: j.thumbnail || "",
      description: j.description ?? null,
      subscriberCount: j.subscriberCount || 0,
      videoCount: j.videoCount || 0,
      viewCount: BigInt(j.viewCount || "0"),
      country: j.country ?? null,
      isKorean: j.isKorean !== false,
      categories,
      keywords: j.keywords || "[]",
      metrics: j.metrics ?? null,
      source,
      fetchedAt: new Date(j.fetchedAt),
      refreshedAt: new Date(j.refreshedAt),
      clusterJsonId,
    });
  }

  // 2) 누락 보호: DB 에만 있고 subscriberCount>0 인 채널 재추가.
  for (const db of dbRows) {
    if (jsonIds.has(db.id)) continue;
    if ((db.subscriberCount || 0) <= 0) continue; // 정크(구독자 0) 는 버림
    let clusterJsonId: number | null = null;
    if (!isEmptyCat(db.categories)) {
      clusterJsonId = nearestCluster(parseObj(db.categories));
      if (clusterJsonId != null) stats.readdedAssigned++;
    }
    finals.push({
      id: db.id,
      title: db.title || "(untitled)",
      handle: db.handle,
      thumbnail: db.thumbnail || "",
      description: db.description,
      subscriberCount: db.subscriberCount || 0,
      videoCount: db.videoCount || 0,
      viewCount: db.viewCount,
      country: db.country,
      isKorean: db.isKorean,
      categories: db.categories,
      keywords: db.keywords,
      metrics: db.metrics,
      source: VALID_SOURCES.has(db.source) ? db.source : "search",
      fetchedAt: db.fetchedAt,
      refreshedAt: db.refreshedAt,
      clusterJsonId,
    });
    stats.readded++;
  }

  // 3) 클러스터별 최종 size 계산.
  const sizeByJsonId = new Map<number, number>();
  for (const f of finals) {
    if (f.clusterJsonId != null)
      sizeByJsonId.set(f.clusterJsonId, (sizeByJsonId.get(f.clusterJsonId) ?? 0) + 1);
  }

  console.log("\n--- merge plan ---");
  console.log(`최종 채널 수: ${finals.length}`);
  console.log(`분류 복원(후퇴 방지): ${stats.catRestored} (그중 클러스터 재배정 ${stats.reassignedAfterRestore})`);
  console.log(`source 보정: ${stats.sourceFixed}`);
  console.log(`누락 재추가(구독자>0): ${stats.readded} (그중 클러스터 배정 ${stats.readdedAssigned})`);
  console.log(`미분류로 남김(clusterId null): ${finals.filter((f) => f.clusterJsonId == null).length}`);

  if (process.argv.includes("--dry")) {
    console.log("\n[--dry] DB 미수정 — 계획만 출력하고 종료.");
    await prisma.$disconnect();
    return;
  }

  // 4) DB 쓰기 (트랜잭션): 채널/클러스터 비우고 재구성.
  await prisma.$transaction(
    async (tx) => {
      await tx.channel.deleteMany({});
      await tx.channelCluster.deleteMany({});

      // 클러스터 생성 → jsonId→newId 매핑.
      const idMap = new Map<number, number>();
      for (const c of raw.clusters) {
        const created = await tx.channelCluster.create({
          data: {
            label: c.label,
            centroid: c.centroid,
            topCategories: c.topCategories,
            topKeywords: c.topKeywords,
            size: sizeByJsonId.get(c.id) ?? 0,
            color: c.color ?? null,
          },
        });
        idMap.set(c.id, created.id);
      }

      // 채널 createMany (청크).
      const rows = finals.map((f) => ({
        id: f.id,
        title: f.title,
        handle: f.handle,
        thumbnail: f.thumbnail,
        description: f.description,
        subscriberCount: f.subscriberCount,
        videoCount: f.videoCount,
        viewCount: f.viewCount,
        country: f.country,
        isKorean: f.isKorean,
        categories: f.categories,
        keywords: f.keywords,
        metrics: f.metrics,
        clusterId: f.clusterJsonId != null ? (idMap.get(f.clusterJsonId) ?? null) : null,
        source: f.source,
        fetchedAt: f.fetchedAt,
        refreshedAt: f.refreshedAt,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await tx.channel.createMany({ data: rows.slice(i, i + 500) });
      }
    },
    { timeout: 120000 },
  );

  // 5) 검증 요약.
  const total = await prisma.channel.count();
  const clusters = await prisma.channelCluster.count();
  const nullCluster = await prisma.channel.count({ where: { clusterId: null } });
  const zeroSubs = await prisma.channel.count({ where: { subscriberCount: 0 } });
  console.log("\n✅ done");
  console.log(`  Channel: ${total}  ChannelCluster: ${clusters}`);
  console.log(`  clusterId null: ${nullCluster}  subscriberCount=0: ${zeroSubs}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ merge failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
