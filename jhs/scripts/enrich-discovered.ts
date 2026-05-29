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
import { fetchChannelFeed, RateLimitError, type RssChannel } from "../lib/sources/rss";
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
// 기본 동시성 2 + 요청 간 지연으로 공개 RSS 를 부드럽게 두드린다(IP throttle 회피).
const CONC = parseInt(arg("conc", "2"), 10);
// 정상 요청 사이 최소 지연(ms). 워커당 적용 → 실효 요청률 ≈ CONC / (REQ_DELAY/1000) req/s.
const REQ_DELAY = parseInt(arg("delay", "500"), 10);
const posArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const INPUT = path.resolve(posArg ?? "../discovered-channels.json");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number) => base + Math.floor(Math.random() * base);

// RateLimitError 시 지수 백오프 재시도. 재시도까지 모두 throttle 이면 RateLimitError 를 그대로 던진다.
async function fetchFeedWithBackoff(id: string): Promise<RssChannel | null> {
  const waits = [4000, 15000, 45000]; // 4s → 15s → 45s
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchChannelFeed(id, { throwOnRateLimit: true });
    } catch (e) {
      if (e instanceof RateLimitError && attempt < waits.length) {
        process.stderr.write(`  ⏳ RSS rate-limit(${e.status}) — ${waits[attempt] / 1000}s 백오프 후 재시도\n`);
        await sleep(jitter(waits[attempt]));
        continue;
      }
      throw e; // 비-rate-limit 에러이거나 재시도 소진 → 상위에서 처리
    }
  }
}

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

  // circuit-breaker: 백오프까지 소진된 지속적 rate-limit 을 만나면 더 이상 요청하지 않고
  // 남은 후보를 보관한다(차단당하는 중에 계속 두드리지 않기 위함).
  let aborted = false;
  const skipped: Cand[] = [];

  await runConcurrent(
    cands,
    async (c) => {
      if (aborted) {
        skipped.push(c);
        return;
      }
      let feed: RssChannel | null;
      try {
        feed = await fetchFeedWithBackoff(c.id);
      } catch (e) {
        if (e instanceof RateLimitError) {
          if (!aborted) {
            aborted = true;
            process.stderr.write(`⛔ 지속적 RSS rate-limit — 수집 중단하고 남은 후보를 보관합니다.\n`);
          }
          skipped.push(c);
        } else {
          fail++;
        }
        return;
      }
      done++;
      if (!feed) {
        fail++;
        return;
      }
      await sleep(jitter(REQ_DELAY)); // 다음 요청까지 간격 — IP throttle 회피
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

  if (aborted) {
    const out = path.resolve("discovered-pending-remaining.json");
    fs.writeFileSync(out, JSON.stringify({ channels: skipped }));
    console.log(
      `\n⛔ RSS rate-limit 으로 중단 — 미처리 ${skipped.length}개를 ${out} 에 보관했습니다.` +
        `\n   throttle 이 풀리도록 한참(수 시간) 쉰 뒤 재실행: npx tsx scripts/enrich-discovered.ts discovered-pending-remaining.json`,
    );
  }
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
