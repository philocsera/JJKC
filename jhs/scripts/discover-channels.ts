// 한국 5만+ 채널 발굴 — YouTube 공개 검색(채널 필터) 스크래핑. API 키 불필요.
//
//   npx tsx scripts/discover-channels.ts [--depth 5] [--conc 2] [--queries extra.txt] [--out discovered-channels.json]
//
// 동작:
//   1) 각 쿼리로 youtube.com/results?...&sp=채널필터&hl=ko&gl=KR 검색
//   2) ytInitialData 에서 channelRenderer 추출 (id, title, 구독자수 텍스트, handle)
//   3) continuation 토큰으로 youtubei/v1/search 페이지네이션 (롱테일까지 --depth 만큼)
//   4) 구독자 텍스트(만/억/천) 파싱 → 5만 이상만, 기존 DB id 와 중복 제거
//   5) 신규 채널을 out JSON 으로 저장 (DB 직접수정 X — 이후 분류·머지 단계에서 반영)
//
// resolve-channel-ids.ts 와 동일한 공개 검색 방식. rate-limit 회피: 동시성 낮춤 +
// jitter + 429 백오프.

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

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CHANNEL_FILTER = "EgIQAg%3D%3D"; // sp= : 검색 타입=채널

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const DEPTH = parseInt(arg("--depth", "5"), 10); // 쿼리당 continuation 페이지 수
const CONC = parseInt(arg("--conc", "2"), 10);
const OUT = path.resolve(arg("--out", "../discovered-channels.json"));
const FLOOR = 50000;

// 광범위 한국 버티컬 쿼리. continuation 깊이가 롱테일을 끌어올린다.
const BASE_QUERIES = `
먹방 ASMR 요리 베이킹 홈쿡 자취요리 백종원 레시피
브이로그 일상 직장인브이로그 자취 살림 미니멀
게임 롤 리그오브레전드 배틀그라운드 발로란트 오버워치 메이플스토리 로블록스 마인크래프트 피파 스팀게임 인디게임 모바일게임 스타크래프트 디아블로 원신
뷰티 메이크업 화장법 스킨케어 네일 헤어 다이어트 운동 홈트 헬스 요가 필라테스 러닝 클라이밍
패션 코디 하울 명품 스트릿패션
여행 국내여행 해외여행 캠핑 차박 백패킹 등산 낚시 캠핑요리
주식 부동산 재테크 경제 코인 비트코인 투자 부업 창업 마케팅
IT 코딩 프로그래밍 개발자 인공지능 ai 챗gpt 리뷰 it리뷰 테크 스마트폰 노트북 애플 갤럭시
자동차 자동차리뷰 모터스포츠 바이크 캠핑카
운동 축구 야구 농구 골프 배구 테니스 격투기 ufc 복싱 클라이밍
교육 영어 영어회화 토익 수학 과학 코딩교육 역사 한국사 세계사 강의 인강
시사 정치 뉴스 경제뉴스 사회 토론 다큐
키즈 육아 장난감 키즈송 동요 어린이
반려견 강아지 반려묘 고양이 동물 펫 앵무새 수족관
코미디 예능 웃긴영상 몰래카메라 개그 스케치코미디
드라마 영화 영화리뷰 결말포함 애니메이션 웹툰 만화 리뷰
음악 커버 노래 작곡 보컬 기타 피아노 드럼 버스킹 인디음악 힙합 랩 트로트 발라드 케이팝 댄스 안무
asmr 수면 백색소음 빗소리
미술 그림 드로잉 디지털드로잉 캘리그라피 사진 영상편집 프리미어
인테리어 자취방 집꾸미기 diy 목공 가드닝 식물
과학 우주 물리 화학 생물 공학 건축 의학 건강 의학정보 한의학
심리 자기계발 동기부여 독서 책리뷰 글쓰기
종교 기독교 불교 명상
역사 미스터리 사건사고 범죄 미제사건
수능 공무원 자격증 취업 면접 이직 직업
캠핑 등산 백패킹 트레킹 서바이벌
바둑 체스 보드게임 마술 큐브
패러글라이딩 스카이다이빙 서핑 스쿠버다이빙 스키 스노보드
원예 분재 다육 비건 채식 술 와인 위스키 칵테일 커피 카페 디저트 베이커리
태권도 검도 주짓수 요리연구가 푸드파이터
지리 여행유튜버 세계여행 배낭여행 유럽여행 일본여행 미국여행
드론 항공 기차 지하철 대중교통 철도
경마 카지노 포커 홀덤 복권
육아맘 워킹맘 신생아 임신 출산 태교
노인 실버 시니어 귀농 전원생활 시골
장애 수어 봉사 환경 기후 동물보호
법률 변호사 세무 회계 부동산경매 임대
간호사 의사 약사 병원 다이어트한의원
`.trim();

function loadQueries(): string[] {
  const set = new Set<string>();
  const onlyFile = process.argv.includes("--queries-only");
  // --queries-only 면 BASE 를 건너뛰고 파일 쿼리만 (이미 돈 BASE 재실행 방지).
  if (!onlyFile) for (const w of BASE_QUERIES.split(/\s+/)) if (w.trim()) set.add(w.trim());
  const qf = arg("--queries", "");
  if (qf && fs.existsSync(qf)) {
    for (const line of fs.readFileSync(qf, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith("#")) set.add(t);
    }
  }
  return [...set];
}

// "구독자 67.6만명" / "1100만" / "3.08만" / "1.2억" / "980명" / "1.2M" / "850K" → 정수
function parseSubs(text: string | undefined): number | null {
  if (!text) return null;
  const t = text.replace(/,/g, "").trim();
  // 핸들(@xxx)이 구독자 텍스트 자리에 들어온 경우 즉시 거부.
  // 자동생성 핸들 "@김민석-n8m2s" / "@모바일게임-k7m" / "@100mishop" 의 "8m"/"7m"/"100m"을
  // 아래 M/K/B 분기가 "8M/7M/100M 구독자"로 오파싱하던 버그 방지.
  if (t.startsWith("@")) return null;
  let m = t.match(/([\d.]+)\s*(억|만|천)?/);
  if (m) {
    const n = parseFloat(m[1]);
    if (!isNaN(n)) {
      const unit = m[2];
      if (unit === "억") return Math.round(n * 1e8);
      if (unit === "만") return Math.round(n * 1e4);
      if (unit === "천") return Math.round(n * 1e3);
      // 단위 없음: "구독자 980명" 같은 경우. 단 "구독자" 의 숫자 오인 방지 위해 명 포함 확인
      if (/명/.test(t)) return Math.round(n);
    }
  }
  // 영문 약식(1.2M/850K) — 숫자 앞이 단어문자가 아니고(핸들 "k7m"의 7m 배제),
  // 뒤가 단어경계여야 함(핸들 "8m2s"의 8m 배제). YouTube hl=ko 응답에선 드물지만 방어.
  m = t.match(/(?:^|[^A-Za-z0-9.])([\d.]+)\s*([MKB])\b/i);
  if (m) {
    const n = parseFloat(m[1]);
    const u = m[2].toUpperCase();
    if (u === "B") return Math.round(n * 1e9);
    if (u === "M") return Math.round(n * 1e6);
    if (u === "K") return Math.round(n * 1e3);
  }
  return null;
}

type Found = { id: string; title: string; subs: number; handle: string | null; query: string };

function walkRenderers(node: any, out: any[], tokenRef: { t: string | null }) {
  if (!node || typeof node !== "object") return;
  if (node.channelRenderer) out.push(node.channelRenderer);
  if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
    tokenRef.t = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
  }
  for (const k in node) walkRenderers(node[k], out, tokenRef);
}

function extractChannels(renderers: any[], query: string): Found[] {
  const res: Found[] = [];
  for (const c of renderers) {
    const id = c.channelId;
    if (typeof id !== "string" || !id.startsWith("UC")) continue;
    const title = c.title?.simpleText ?? "";
    // videoCountText / subscriberCountText 는 응답에 따라 구독자수·핸들이 뒤섞여 온다.
    // parseSubs 가 핸들(@…)을 거부하므로, 두 필드를 모두 시도해 실제 구독자 텍스트만 통과시킨다.
    const subs = parseSubs(c.videoCountText?.simpleText) ?? parseSubs(c.subscriberCountText?.simpleText);
    if (subs == null) continue;
    const handleText = [c.subscriberCountText?.simpleText, c.videoCountText?.simpleText].find((s) =>
      s?.startsWith("@"),
    );
    const handle = handleText ?? c.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ?? null;
    res.push({ id, title, subs, handle: handle && handle.startsWith("/@") ? handle.slice(1) : handle, query });
  }
  return res;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 1500 + Math.random() * 1500;

let innertubeKey = "";
let clientVersion = "";

async function getFirstPage(query: string): Promise<{ found: Found[]; token: string | null } | null> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${CHANNEL_FILTER}&hl=ko&gl=KR`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" } });
  if (res.status === 429) return null;
  const html = await res.text();
  if (!innertubeKey) {
    innertubeKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ?? "";
    clientVersion = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? html.match(/"clientVersion":"([0-9.]+)"/)?.[1] ?? "";
  }
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return null;
  let data: any;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const renderers: any[] = [];
  const tokenRef = { t: null as string | null };
  walkRenderers(data, renderers, tokenRef);
  return { found: extractChannels(renderers, query), token: tokenRef.t };
}

async function getContinuation(token: string, query: string): Promise<{ found: Found[]; token: string | null } | null> {
  if (!innertubeKey) return null;
  const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${innertubeKey}&prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
    body: JSON.stringify({
      context: { client: { hl: "ko", gl: "KR", clientName: "WEB", clientVersion: clientVersion || "2.20260526.08.00" } },
      continuation: token,
    }),
  });
  if (res.status === 429) return null;
  let data: any;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const renderers: any[] = [];
  const tokenRef = { t: null as string | null };
  walkRenderers(data, renderers, tokenRef);
  return { found: extractChannels(renderers, query), token: tokenRef.t };
}

async function main() {
  let queries = loadQueries();
  const limit = parseInt(arg("--limit", "0"), 10);
  if (limit > 0) queries = queries.slice(0, limit);
  console.log(`🔎 queries=${queries.length}  depth=${DEPTH}  conc=${CONC}  floor=${FLOOR}  out=${OUT}`);

  const prisma = new PrismaClient();
  const dbIds = new Set((await prisma.channel.findMany({ select: { id: true } })).map((c) => c.id));
  await prisma.$disconnect();
  console.log(`기존 DB id: ${dbIds.size}`);

  const seen = new Map<string, Found>(); // id → best record
  const stats = { reqs: 0, rateLimited: 0, queriesDone: 0, raw: 0 };

  function record(f: Found) {
    stats.raw++;
    const prev = seen.get(f.id);
    if (!prev || f.subs > prev.subs) seen.set(f.id, f);
  }

  let consecutive429 = 0;
  async function backoff() {
    stats.rateLimited++;
    consecutive429++;
    const wait = Math.min(60000, 8000 * 2 ** (consecutive429 - 1));
    process.stderr.write(`  ⏳ 429 backoff ${Math.round(wait / 1000)}s (consec=${consecutive429})\n`);
    await sleep(wait);
  }

  async function runQuery(q: string) {
    try {
      stats.reqs++;
      let page = await getFirstPage(q);
      while (page === null) {
        await backoff();
        if (consecutive429 > 5) return; // 포기
        stats.reqs++;
        page = await getFirstPage(q);
      }
      consecutive429 = 0;
      page.found.forEach(record);
      let token = page.token;
      for (let d = 0; d < DEPTH && token; d++) {
        await sleep(jitter());
        stats.reqs++;
        let cont = await getContinuation(token, q);
        while (cont === null) {
          await backoff();
          if (consecutive429 > 5) return;
          stats.reqs++;
          cont = await getContinuation(token, q);
        }
        consecutive429 = 0;
        cont.found.forEach(record);
        token = cont.token;
      }
    } catch (e: any) {
      process.stderr.write(`  ! query "${q}" failed: ${e.message}\n`);
    } finally {
      stats.queriesDone++;
      const newCount = [...seen.values()].filter((f) => f.subs >= FLOOR && !dbIds.has(f.id)).length;
      process.stderr.write(
        `[${stats.queriesDone}/${queries.length}] "${q}" | seen=${seen.size} new≥50k=${newCount} reqs=${stats.reqs} 429=${stats.rateLimited}\n`,
      );
    }
  }

  // 동시성 풀.
  let idx = 0;
  async function worker() {
    while (idx < queries.length) {
      const q = queries[idx++];
      await runQuery(q);
      await sleep(jitter());
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));

  // 결과 집계.
  const all = [...seen.values()];
  const newOnes = all.filter((f) => f.subs >= FLOOR && !dbIds.has(f.id)).sort((a, b) => b.subs - a.subs);
  const inDbButSeen = all.filter((f) => dbIds.has(f.id)).length;

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), floor: FLOOR, queries: queries.length, channels: newOnes },
      null,
      2,
    ),
  );

  console.log(`\n===== 발굴 결과 =====`);
  console.log(`총 본 채널(중복제거): ${seen.size}  (raw hits ${stats.raw})`);
  console.log(`그중 5만+ : ${all.filter((f) => f.subs >= FLOOR).length}`);
  console.log(`이미 DB에 있음: ${inDbButSeen}`);
  console.log(`✅ 신규(5만+ & DB에 없음): ${newOnes.length}  → ${OUT}`);
  console.log(`요청수=${stats.reqs} 429=${stats.rateLimited}`);
  console.log(`\n신규 상위 15:`);
  newOnes.slice(0, 15).forEach((f) => console.log(`  ${(f.subs + "").padStart(9)} | ${f.title} | ${f.handle ?? ""}`));
}

main().catch((e) => {
  console.error("❌ discover failed:", e);
  process.exit(1);
});
