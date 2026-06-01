// 기존 프로필들의 페르소나 요약(summaryText) 일괄 생성 — GEMINI_API_KEY 필요.
//   npx tsx scripts/backfill-profile-summaries.ts            # 빈 것만
//   npx tsx scripts/backfill-profile-summaries.ts --all      # 전부 재생성

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
const ALL = process.argv.includes("--all");

async function main() {
  const { llmEnabled } = await import("../lib/llm");
  if (!llmEnabled()) {
    console.log("❌ GEMINI_API_KEY(또는 LLM_API_KEY) 가 없습니다. .env 에 키를 넣어 주세요.");
    await prisma.$disconnect();
    return;
  }
  const { generateAndStoreProfileSummary } = await import("../lib/profile-service");

  const rows = await prisma.algoProfile.findMany({ select: { userId: true, summaryText: true } });
  const targets = rows.filter((r) => ALL || !r.summaryText);
  console.log(`🔁 프로필 요약 생성: ${targets.length}개 (전체 ${rows.length})`);

  let ok = 0;
  for (const r of targets) {
    await generateAndStoreProfileSummary(r.userId);
    const after = await prisma.algoProfile.findUnique({ where: { userId: r.userId }, select: { summaryText: true } });
    if (after?.summaryText) ok++;
  }
  console.log(`✅ 생성 완료: ${ok}/${targets.length}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
