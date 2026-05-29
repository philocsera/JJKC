// 더미 사용자 10명 생성 — 각자 다른 관심사(2~3개 카테고리)에서 실제 카탈로그 채널을
// 임의로 골라 현실적인 AlgoProfile 을 구성한다. 기존 테스트 사용자(test_*)는 제거.
// 모든 프로필은 공개(public). 인증 토큰은 만들지 않음(읽기 경로 테스트/데모용).
//
//   npx tsx scripts/seed-dummy-users.ts

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  entropyScore,
  normalizeTopN,
  mainstreamScoreOf,
  nicheScoreOf,
  median,
  bump,
} from "../lib/category-utils";
import { saveProfile } from "../lib/profile-service";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();

// 키워드 클라우드 노이즈(채널 운영 토큰)는 더미 topKeywords 에서도 빼 둔다.
const KW_STOP = new Set([
  "문의", "비즈니스", "광고문의", "후원", "구독", "채널", "채널입니다", "안녕하세요",
  "감사합니다", "있습니다", "입니다", "영상을", "영상은", "유튜브", "유튜버", "shorts",
  "com", "www", "https", "http", "naver", "instagram", "youtu", "blog", "co", "kr",
  "net", "tv", "차", "모든", "많은", "라이브", "by", "link", "of", "to", "in", "me",
]);

type Persona = { id: string; name: string; email: string; cats: string[] };

// 각자 여러 카테고리를 골고루 — 첫 카테고리가 주(主), 뒤는 보조.
const PERSONAS: Persona[] = [
  { id: "dummy_01", name: "겜창 민준", email: "minjun@demo.local", cats: ["Gaming", "Comedy", "Entertainment"] },
  { id: "dummy_02", name: "먹방러 지우", email: "jiwoo@demo.local", cats: ["Howto & Style", "People & Blogs", "Travel & Events"] },
  { id: "dummy_03", name: "주식하는 서연", email: "seoyeon@demo.local", cats: ["News & Politics", "Education", "Science & Technology"] },
  { id: "dummy_04", name: "뷰티덕후 하은", email: "haeun@demo.local", cats: ["Howto & Style", "People & Blogs", "Entertainment"] },
  { id: "dummy_05", name: "여행가 도윤", email: "doyoon@demo.local", cats: ["Travel & Events", "People & Blogs", "Howto & Style"] },
  { id: "dummy_06", name: "스포츠광 준호", email: "junho@demo.local", cats: ["Sports", "Entertainment", "News & Politics"] },
  { id: "dummy_07", name: "개발자 현우", email: "hyunwoo@demo.local", cats: ["Science & Technology", "Education", "News & Politics"] },
  { id: "dummy_08", name: "집사 수아", email: "sua@demo.local", cats: ["Pets & Animals", "People & Blogs", "Howto & Style"] },
  { id: "dummy_09", name: "시네필 예준", email: "yejun@demo.local", cats: ["Film & Animation", "Entertainment", "Comedy"] },
  { id: "dummy_10", name: "육아맘 채원", email: "chaewon@demo.local", cats: ["Education", "Comedy", "Pets & Animals"] },
];

function dominant(catJson: string): string | null {
  let c: Record<string, number> = {};
  try { c = JSON.parse(catJson || "{}"); } catch {}
  const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return e ? e[0] : null;
}

function shuffleTake<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

async function main() {
  // 1) 기존 테스트 사용자 제거 (Follow → User; AlgoProfile/OnboardInput 은 cascade)
  const stale = ["test_alice", "test_bob", "test_carol_private"];
  await prisma.follow.deleteMany({
    where: { OR: [{ followerId: { in: stale } }, { followingId: { in: stale } }] },
  });
  const del = await prisma.user.deleteMany({ where: { id: { in: stale } } });
  console.log(`기존 테스트 사용자 삭제: ${del.count}`);

  // 2) 채널을 dominant 카테고리별로 그룹화 (구독자 5천~1천만 사이만 — 메가/마이너 제외해 현실감)
  const channels = await prisma.channel.findMany({
    select: {
      id: true, title: true, thumbnail: true, categories: true,
      subCategories: true, keywords: true, subscriberCount: true,
      viewCount: true, videoCount: true,
    },
  });
  const byCat: Record<string, typeof channels> = {};
  for (const c of channels) {
    const dom = dominant(c.categories);
    if (!dom) continue;
    (byCat[dom] ??= []).push(c);
  }

  // 3) 페르소나별 프로필 구성
  for (const p of PERSONAS) {
    const picked: typeof channels = [];
    const seen = new Set<string>();
    p.cats.forEach((cat, i) => {
      const pool = byCat[cat] ?? [];
      const take = i === 0 ? 6 : 2; // 주 카테고리 6개, 보조 각 2개 → 최대 10
      for (const c of shuffleTake(pool, take)) {
        if (!seen.has(c.id)) { seen.add(c.id); picked.push(c); }
      }
    });
    if (picked.length === 0) { console.log(`⚠️ ${p.name}: 채널 못 찾음, 건너뜀`); continue; }

    const catScore: Record<string, number> = {};
    const subScore: Record<string, number> = {};
    const kwScore: Record<string, number> = {};
    const subs: number[] = [];
    const views: number[] = [];
    for (const c of picked) {
      try { for (const [k, v] of Object.entries(JSON.parse(c.categories || "{}"))) bump(catScore, k, v as number); } catch {}
      try { for (const [k, v] of Object.entries(JSON.parse(c.subCategories || "{}"))) bump(subScore, k, v as number); } catch {}
      try { for (const kw of JSON.parse(c.keywords || "[]") as string[]) if (kw.length >= 2 && !KW_STOP.has(kw)) bump(kwScore, kw, 1); } catch {}
      if (c.subscriberCount > 0) subs.push(c.subscriberCount);
      const v = Number(c.viewCount) || 0;
      if (v > 0) views.push(v);
    }

    const categories = normalizeTopN(catScore, 10);
    const subCategories = normalizeTopN(subScore, 5);
    const topKeywords = Object.entries(kwScore).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k);
    const topChannels = picked.slice(0, 10).map((c) => ({
      id: c.id, name: c.title, thumbnail: c.thumbnail, videoCount: c.videoCount,
    }));
    const { diversity, concentration } = entropyScore(catScore);
    const metrics = {
      diversity,
      concentration,
      shortsRatio: 0,
      longFormRatio: 100,
      languageDistribution: { ko: 100 },
      primaryLanguage: "ko",
      mainstreamScore: mainstreamScoreOf(median(views)),
      nicheChannelScore: nicheScoreOf(median(subs)),
    };

    await prisma.user.upsert({
      where: { id: p.id },
      create: { id: p.id, name: p.name, email: p.email, isPublic: true },
      update: { name: p.name, email: p.email, isPublic: true },
    });
    await saveProfile(p.id, {
      categories,
      subCategories,
      topChannels,
      topKeywords,
      sampleVideoIds: [],
      metrics,
    });
    const topCat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
    console.log(`✅ ${p.name.padEnd(12)} 채널 ${picked.length}개  주카테고리 ${topCat?.[0]} ${topCat?.[1]}%  키워드 ${topKeywords.slice(0, 4).join(", ")}`);
  }

  // 4) 더미끼리 팔로우 몇 개 — 닮은 취향 위주
  const follows: [string, string][] = [
    ["dummy_02", "dummy_04"], ["dummy_04", "dummy_05"], ["dummy_03", "dummy_07"],
    ["dummy_01", "dummy_09"], ["dummy_08", "dummy_02"], ["dummy_06", "dummy_01"],
  ];
  for (const [f, t] of follows) {
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: f, followingId: t } },
      update: {},
      create: { followerId: f, followingId: t },
    });
  }
  console.log(`팔로우 ${follows.length}건 생성`);

  console.log(`\n총 User: ${await prisma.user.count()}  AlgoProfile: ${await prisma.algoProfile.count()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
