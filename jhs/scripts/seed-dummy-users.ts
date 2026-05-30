// 더미 사용자 90명 생성 — 17개 부모 카테고리에 주(主)관심사를 고르게 분배(각 5~6명).
// 각자 주 카테고리 1 + 친화도 기반 보조 카테고리 2 에서 실제 카탈로그 채널을 임의로
// 골라 현실적인 AlgoProfile 을 구성한다. 기존 더미(dummy_*)·테스트(test_*) 사용자는 제거.
// 모든 프로필 공개(public). 인증 토큰·요약(LLM)은 만들지 않음 — 요약은 버튼 온디맨드.
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
import { CATEGORY_NAMESPACE, categoryLabel } from "../lib/categories";
import { saveProfile } from "../lib/profile-service";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const TOTAL = 90;

// 키워드 클라우드 노이즈(채널 운영 토큰)는 더미 topKeywords 에서도 빼 둔다.
const KW_STOP = new Set([
  "문의", "비즈니스", "광고문의", "후원", "구독", "채널", "채널입니다", "안녕하세요",
  "감사합니다", "있습니다", "입니다", "영상을", "영상은", "유튜브", "유튜버", "shorts",
  "com", "www", "https", "http", "naver", "instagram", "youtu", "blog", "co", "kr",
  "net", "tv", "차", "모든", "많은", "라이브", "by", "link", "of", "to", "in", "me",
]);

// 보조 카테고리 친화도 — 주 카테고리와 자연스럽게 어울리는 분야(현실감).
const AFFINITY: Record<string, string[]> = {
  Gaming: ["Comedy", "Entertainment", "Science & Technology", "애니메이션"],
  Comedy: ["Entertainment", "Gaming", "People & Blogs", "요리·먹방"],
  Entertainment: ["Comedy", "요리·먹방", "People & Blogs", "Sports"],
  "요리·먹방": ["생활·하우투", "Travel & Events", "People & Blogs", "뷰티·패션"],
  "뷰티·패션": ["People & Blogs", "생활·하우투", "요리·먹방", "Entertainment"],
  "생활·하우투": ["요리·먹방", "People & Blogs", "뷰티·패션", "Education"],
  "Science & Technology": ["Education", "News & Politics", "Gaming", "Autos & Vehicles"],
  Education: ["Science & Technology", "News & Politics", "People & Blogs", "영화"],
  "News & Politics": ["Education", "Science & Technology", "Sports", "People & Blogs"],
  Sports: ["Entertainment", "News & Politics", "Autos & Vehicles", "People & Blogs"],
  "People & Blogs": ["요리·먹방", "Travel & Events", "뷰티·패션", "생활·하우투"],
  "Travel & Events": ["People & Blogs", "요리·먹방", "생활·하우투", "Pets & Animals"],
  영화: ["애니메이션", "Entertainment", "Comedy", "Education"],
  애니메이션: ["영화", "Gaming", "Comedy", "Entertainment"],
  "Autos & Vehicles": ["Science & Technology", "Sports", "Travel & Events", "News & Politics"],
  "Pets & Animals": ["People & Blogs", "생활·하우투", "Travel & Events", "Education"],
  "Nonprofits & Activism": ["News & Politics", "Education", "People & Blogs", "Pets & Animals"],
};

const SURNAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권",
  "황", "안", "송", "전", "홍", "고", "문", "양", "손", "배", "백", "허", "남", "심", "노",
];
const GIVEN = [
  "민준", "서연", "도윤", "예준", "시우", "하준", "지호", "주원", "준우", "건우", "현우", "우진",
  "선우", "연우", "정우", "승현", "시윤", "준서", "도현", "지환", "승우", "유준", "은우", "현준",
  "서윤", "지우", "하은", "하윤", "윤서", "지유", "채원", "지민", "수아", "다은", "은서", "예은",
  "수빈", "소율", "예린", "지아", "시아", "유나", "채은", "가은", "윤아", "서아", "하린", "다윤",
  "시은", "예나", "나윤", "지안", "라온", "아윤", "리아", "한결", "도경", "재민", "태경", "현서",
];

function rng() {
  return Math.random();
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function shuffleTake<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

// 90개의 고유한 한국어 이름 생성.
function makeNames(n: number): string[] {
  const combos: string[] = [];
  for (const s of SURNAMES) for (const g of GIVEN) combos.push(s + g);
  return shuffle(combos).slice(0, n);
}

// 주 카테고리를 17개에 고르게 분배(각 5~6명), 그 뒤 순서를 섞어 연속 쏠림 방지.
function makePrimaries(n: number): string[] {
  const cats = [...CATEGORY_NAMESPACE];
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(cats[i % cats.length]);
  return shuffle(out);
}

function dominant(catJson: string): string | null {
  let c: Record<string, number> = {};
  try { c = JSON.parse(catJson || "{}"); } catch {}
  const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return e ? e[0] : null;
}

async function main() {
  // 1) 기존 더미/테스트 사용자 제거 (Follow 먼저 → User; AlgoProfile/OnboardInput cascade)
  const staleUsers = await prisma.user.findMany({
    where: { OR: [{ id: { startsWith: "dummy_" } }, { id: { startsWith: "test_" } }] },
    select: { id: true },
  });
  const staleIds = staleUsers.map((u) => u.id);
  if (staleIds.length) {
    await prisma.follow.deleteMany({
      where: { OR: [{ followerId: { in: staleIds } }, { followingId: { in: staleIds } }] },
    });
    const del = await prisma.user.deleteMany({ where: { id: { in: staleIds } } });
    console.log(`기존 더미/테스트 사용자 삭제: ${del.count}`);
  }

  // 2) 채널을 dominant 카테고리별로 그룹화 (구독자 5천~1천만만 — 메가/마이너 제외해 현실감)
  const channels = await prisma.channel.findMany({
    select: {
      id: true, title: true, thumbnail: true, categories: true,
      subCategories: true, keywords: true, subscriberCount: true,
      viewCount: true, videoCount: true,
    },
  });
  const byCat: Record<string, typeof channels> = {};
  for (const c of channels) {
    if (c.subscriberCount < 5000 || c.subscriberCount > 10_000_000) continue;
    const dom = dominant(c.categories);
    if (!dom) continue;
    (byCat[dom] ??= []).push(c);
  }

  // 3) 90 페르소나 구성
  const names = makeNames(TOTAL);
  const primaries = makePrimaries(TOTAL);
  const primaryCount: Record<string, number> = {};
  const userPrimary: { id: string; primary: string }[] = [];

  for (let i = 0; i < TOTAL; i++) {
    const id = `dummy_${String(i + 1).padStart(3, "0")}`;
    const name = names[i];
    const email = `${id}@demo.local`;
    const primary = primaries[i];
    primaryCount[primary] = (primaryCount[primary] || 0) + 1;
    userPrimary.push({ id, primary });

    // 보조 2개 — 친화도 목록에서 섞어 2개, 채널 풀이 있는 것만.
    const secondaries = shuffleTake(AFFINITY[primary] ?? [], (AFFINITY[primary] ?? []).length)
      .filter((c) => c !== primary && (byCat[c]?.length ?? 0) > 0)
      .slice(0, 2);
    const cats = [primary, ...secondaries];

    // 채널 pick — 주 6 + 보조 각 2 (최대 10)
    const picked: typeof channels = [];
    const seen = new Set<string>();
    cats.forEach((cat, idx) => {
      const pool = byCat[cat] ?? [];
      const take = idx === 0 ? 6 : 2;
      for (const c of shuffleTake(pool, take)) {
        if (!seen.has(c.id)) { seen.add(c.id); picked.push(c); }
      }
    });
    if (picked.length === 0) { console.log(`⚠️ ${name}(${primary}): 채널 못 찾음, 건너뜀`); continue; }

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
    const subscribedChannelIds = picked.map((c) => c.id);
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
      where: { id },
      create: { id, name, email, isPublic: true },
      update: { name, email, isPublic: true },
    });
    await saveProfile(id, {
      categories, subCategories, topChannels, topKeywords, sampleVideoIds: [], metrics,
    }, subscribedChannelIds);
  }

  // 4) 팔로우 — 같은 주 카테고리끼리 링 형태로 연결(각자 다음 사람을 팔로우) + 약간의 교차.
  const byPrimary: Record<string, string[]> = {};
  for (const u of userPrimary) (byPrimary[u.primary] ??= []).push(u.id);
  let followCount = 0;
  for (const ids of Object.values(byPrimary)) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      const target = ids[(i + 1) % ids.length];
      if (target === ids[i]) continue;
      await prisma.follow.upsert({
        where: { followerId_followingId: { followerId: ids[i], followingId: target } },
        update: {},
        create: { followerId: ids[i], followingId: target },
      });
      followCount++;
    }
  }

  // 5) 분포 요약
  console.log(`\n=== 주 카테고리 분포 (총 ${TOTAL}명) ===`);
  for (const k of CATEGORY_NAMESPACE) {
    console.log(`  ${categoryLabel(k).padEnd(10)} ${primaryCount[k] || 0}명`);
  }
  console.log(`팔로우 ${followCount}건 생성`);
  console.log(`총 User: ${await prisma.user.count()}  AlgoProfile: ${await prisma.algoProfile.count()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
