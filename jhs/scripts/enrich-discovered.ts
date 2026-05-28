// discovered-channels.json → RSS 보강 → 한국 채널만 분류해서 DB upsert.
//
//   npx tsx scripts/enrich-discovered.ts [../discovered-channels.json] [--conc 5] [--dry]
//
// 동작 (catalog-seed 와 동일한 RSS+classify, 단 구독자수는 발굴값 사용):
//   1) 각 후보 channelId 로 RSS feed (title + 최근영상 title/desc)
//   2) 한글 비율 < 0.3 이면 외국 채널로 보고 버림 (channel-features.isKoreanChannel 기준)
//   3) classify() 로 categories/keywords
//   4) subscriberCount = 발굴 때 파싱한 구독자수, metrics 계산
//   5) upsertChannel(source='yt-search')
//   이후 `npm run channels:cluster` 로 전체 재클러스터 권장.

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { fetchChannelFeed, type RssChannel } from "../lib/sources/rss";
import { classify } from "../lib/classify";
import { mainstreamScoreOf, nicheScoreOf } from "../lib/category-utils";
import { upsertChannel } from "../lib/channel-service";

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
const DRY = process.argv.includes("--dry");
const CONC = parseInt(arg("conc", "5"), 10);
const posArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const INPUT = path.resolve(posArg ?? "../discovered-channels.json");

// channel-features.hangulRatio 와 동일 (private 라 인라인).
function hangulRatio(text: string): number {
  let hangul = 0,
    letters = 0;
  for (const ch of text) {
    if (/[가-힣]/.test(ch)) {
      hangul++;
      letters++;
    } else if (/[a-zA-Z]/.test(ch)) {
      letters++;
    }
  }
  return letters === 0 ? 0 : hangul / letters;
}

function uploadsPerMonth(feed: RssChannel): number {
  const dates = feed.videos.map((v) => Date.parse(v.publishedAt)).filter((t) => Number.isFinite(t));
  if (dates.length < 2) return 0;
  const span = Math.max(...dates) - Math.min(...dates);
  const days = span / 86_400_000;
  if (days <= 0) return 0;
  return +((dates.length / days) * 30).toFixed(1);
}

type Cand = { id: string; title: string; subs: number; handle: string | null };

async function runConcurrent<T>(items: T[], worker: (item: T, idx: number) => Promise<void>, conc: number) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, conc) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        await worker(items[i], i);
      }
    }),
  );
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(INPUT, "utf8")) as { channels: Cand[] };
  // 구독자 1억 초과 = "90억" 류 파싱 가비지/자동생성 채널 → 사전 제외.
  const MAX_SUBS = 100_000_000;
  const garbage = raw.channels.filter((c) => c.subs > MAX_SUBS).length;
  const cands = raw.channels.filter((c) => c.subs <= MAX_SUBS);
  console.log(`📥 후보 ${cands.length}개 (가비지 ${garbage}개 제외)  conc=${CONC}  dry=${DRY}  (${INPUT})`);

  let inserted = 0,
    foreign = 0,
    music = 0,
    fail = 0,
    done = 0;

  await runConcurrent(
    cands,
    async (c) => {
      const feed = await fetchChannelFeed(c.id).catch(() => null);
      done++;
      if (!feed) {
        fail++;
        return;
      }
      const combined = [feed.title, ...feed.videos.map((v) => `${v.title} ${v.description}`)].join("\n");
      if (hangulRatio(combined) < 0.3) {
        foreign++;
        return;
      }
      const { categories, keywords } = classify({ text: combined, hintCategory: null });
      // Music 은 프로젝트에서 제외 — 음악 dominant 채널은 넣지 않는다.
      const catKeys = Object.keys(categories);
      const dom = catKeys.sort((a, b) => categories[b] - categories[a])[0];
      if (dom === "Music") {
        music++;
        return;
      }
      if (!DRY) {
        await upsertChannel(
          {
            id: c.id,
            title: feed.title || c.title || "(untitled)",
            handle: c.handle,
            thumbnail: "",
            description: null,
            subscriberCount: c.subs,
            videoCount: feed.videos.length,
            viewCount: 0,
            country: "KR",
            isKorean: true,
            categories,
            keywords,
            metrics: {
              mainstreamScore: mainstreamScoreOf(0),
              nicheScore: nicheScoreOf(c.subs),
              uploadsPerMonth: uploadsPerMonth(feed),
            },
          },
          "yt-search",
        );
      }
      inserted++;
      if (done % 50 === 0)
        process.stderr.write(
          `[${done}/${cands.length}] inserted=${inserted} foreign=${foreign} music=${music} fail=${fail}\n`,
        );
    },
    CONC,
  );

  console.log(
    `\n✅ done — 삽입(한국,5만+)=${inserted}  외국제외=${foreign}  음악제외=${music}  RSS실패(404등)=${fail}  총=${cands.length}`,
  );
  if (!DRY) {
    const total = await prisma.channel.count();
    console.log(`현재 DB Channel: ${total}`);
    console.log(`\n다음: npm run channels:cluster 로 전체 재클러스터 권장.`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ enrich failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
