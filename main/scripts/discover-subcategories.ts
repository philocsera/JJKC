// 세부 카테고리 자동 발견 (오프라인 분석 도구).
//
//   npx tsx scripts/discover-subcategories.ts [--min 30] [--out ../data/sub-taxonomy.proposed.json]
//
// 동작 (하이브리드의 "자동 발견" 단계):
//   1) 각 채널의 (title+description+keywords) 로 classify() 인메모리 호출 →
//      깨끗한 15표준 dominant 카테고리로 그룹핑 (DB의 옛 택소노미 잔재 회피, DB 무변경).
//   2) 카테고리별로 멤버들의 keywords 를 TF-IDF 벡터화(흔한 단어 억제, 변별 타이틀 강조).
//   3) lib/kmeans 의 pickBestK 로 하위 클러스터링.
//   4) 클러스터별 [대표 키워드, 크기, 예시 채널] 을 proposed.json 으로 출력 → 사람이 라벨링.
//
// 재사용: lib/classify(classify), lib/kmeans(pickBestK, l2normalize), lib/categories(CATEGORY_NAMESPACE).

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { classify } from "../lib/classify";
import { pickBestK, l2normalize } from "../lib/kmeans";
import { CATEGORY_NAMESPACE } from "../lib/categories";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const MIN_CHANNELS = parseInt(arg("min", "30"), 10); // 카테고리당 최소 멤버
const OUT = path.resolve(arg("out", "../data/sub-taxonomy.proposed.json"));

type Ch = { id: string; title: string; subscriberCount: number; keywords: string[] };

async function main() {
  const rows = await prisma.channel.findMany({
    where: { isKorean: true },
    select: { id: true, title: true, description: true, keywords: true, subscriberCount: true, categories: true },
  });
  await prisma.$disconnect();

  // 1) 인메모리 classify → 깨끗한 15표준 dominant 로 그룹핑.
  const byCat = new Map<string, Ch[]>();
  for (const c of CATEGORY_NAMESPACE) byCat.set(c, []);
  for (const r of rows) {
    let kw: string[] = [];
    try {
      kw = JSON.parse(r.keywords || "[]");
    } catch {}
    const text = [r.title || "", r.description || "", kw.join(" ")].join("\n");
    const { categories } = classify({ text, hintCategory: null });
    const keys = Object.keys(categories);
    if (keys.length === 0) continue;
    const dom = keys.sort((a, b) => categories[b] - categories[a])[0];
    if (!byCat.has(dom)) continue; // dom 은 항상 15표준 (classify 출력)
    byCat.get(dom)!.push({ id: r.id, title: r.title, subscriberCount: r.subscriberCount, keywords: kw });
  }

  const proposed: Record<string, any> = {};

  for (const cat of CATEGORY_NAMESPACE) {
    const members = byCat.get(cat)!;
    if (members.length < MIN_CHANNELS) {
      proposed[cat] = { note: `멤버 ${members.length}개 (<${MIN_CHANNELS}) — 자동 발견 생략`, clusters: [] };
      continue;
    }

    // 2) keyword DF → 변별 vocab.
    const N = members.length;
    const df: Record<string, number> = {};
    for (const m of members) for (const k of new Set(m.keywords)) df[k] = (df[k] ?? 0) + 1;
    const minDf = Math.max(3, Math.round(N * 0.01));
    const maxDf = Math.max(minDf + 1, Math.round(N * 0.5)); // 카테고리-제네릭 단어 제거
    const vocab = Object.entries(df)
      .filter(([, d]) => d >= minDf && d <= maxDf)
      .map(([k]) => k);
    if (vocab.length < 4) {
      proposed[cat] = { note: `변별 vocab ${vocab.length}개 — 부족`, clusters: [] };
      continue;
    }
    const vIndex = new Map(vocab.map((t, i) => [t, i]));
    const idf = vocab.map((t) => Math.log(N / df[t]));

    // 3) TF-IDF 벡터 (tf=0/1), L2 정규화. 빈 벡터 멤버 제외.
    const vecRows: number[][] = [];
    const vecMembers: Ch[] = [];
    for (const m of members) {
      const v = new Array(vocab.length).fill(0);
      let nz = 0;
      for (const k of new Set(m.keywords)) {
        const i = vIndex.get(k);
        if (i != null) {
          v[i] = idf[i];
          nz++;
        }
      }
      if (nz === 0) continue;
      vecRows.push(l2normalize(v));
      vecMembers.push(m);
    }
    if (vecRows.length < MIN_CHANNELS) {
      proposed[cat] = { note: `유효 벡터 ${vecRows.length}개 — 부족`, clusters: [] };
      continue;
    }

    // 4) kmeans pickBestK (k 후보 2..8, 데이터 크기 제한).
    const maxK = Math.max(2, Math.min(8, Math.floor(vecRows.length / 20)));
    const cand = [];
    for (let k = 2; k <= maxK; k++) cand.push(k);
    const { k, result, silhouette } = pickBestK(vecRows, cand, { seed: 42 });

    const clusters = [];
    for (let c = 0; c < result.centroids.length; c++) {
      const idxs = result.labels.map((l, i) => (l === c ? i : -1)).filter((i) => i >= 0);
      if (idxs.length === 0) continue;
      const centroid = result.centroids[c];
      const topKeywords = centroid
        .map((w, i) => ({ term: vocab[i], w }))
        .sort((a, b) => b.w - a.w)
        .slice(0, 10)
        .filter((x) => x.w > 0)
        .map((x) => x.term);
      const examples = idxs
        .map((i) => vecMembers[i])
        .sort((a, b) => b.subscriberCount - a.subscriberCount)
        .slice(0, 6)
        .map((m) => ({ title: m.title, subs: m.subscriberCount }));
      clusters.push({ label: "", size: idxs.length, topKeywords, examples });
    }
    clusters.sort((a, b) => b.size - a.size);
    proposed[cat] = { memberCount: N, k, silhouette: +silhouette.toFixed(3), clusters };
  }

  fs.writeFileSync(OUT, JSON.stringify(proposed, null, 2));
  console.log(`✅ proposed → ${OUT}`);
  for (const cat of CATEGORY_NAMESPACE) {
    const p = proposed[cat];
    if (!p.clusters || p.clusters.length === 0) {
      console.log(`\n[${cat}] ${p.note ?? "—"}`);
      continue;
    }
    console.log(`\n[${cat}] members=${p.memberCount} k=${p.k} sil=${p.silhouette}`);
    for (const cl of p.clusters) {
      console.log(`  · (${String(cl.size).padStart(3)}) ${cl.topKeywords.slice(0, 8).join(", ")}`);
      console.log(`      ex: ${cl.examples.slice(0, 3).map((e: any) => e.title).join(" / ")}`);
    }
  }
}

main().catch(async (e) => {
  console.error("❌ discover-subcategories failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
