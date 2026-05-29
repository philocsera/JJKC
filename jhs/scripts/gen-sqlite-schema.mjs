// prisma/schema.prisma(=프로덕션 Postgres, git 추적) 로부터 로컬 개발용 SQLite
// 스키마(prisma/schema.sqlite.prisma)를 파생 생성한다. datasource 블록만 교체하므로
// 모델/필드가 절대 어긋나지 않는다(= 단일 진실 소스 유지).
//
//   node scripts/gen-sqlite-schema.mjs
//
// 이 프로젝트의 모든 모델 필드는 String/Int/BigInt/Boolean/DateTime 스칼라뿐이라
// (Json·배열 같은 Postgres 전용 타입 없음) SQLite 와 100% 호환된다.
// 생성 파일은 .gitignore 대상(빌드 산출물) — 직접 편집 금지.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath: file:// URL 을 OS 경로로 정확히 디코딩(공백→' ', Windows 드라이브 처리).
// new URL().pathname 직접 사용은 percent-encoding 이 남아 경로에 공백/특수문자가 있으면 깨진다.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "prisma", "schema.prisma");
const OUT = path.join(ROOT, "prisma", "schema.sqlite.prisma");

const src = fs.readFileSync(SRC, "utf8");

// datasource 블록(중첩 중괄호 없음) 전체를 SQLite 용으로 치환.
// url 은 env 가 아닌 리터럴로 고정한다: 이 파일은 로컬 개발 전용이고,
// .env 의 DATABASE_URL 중복/공백에 영향받지 않게 prisma/dev.db 를 직접 가리킨다
// (file: 경로는 schema 파일이 있는 prisma/ 기준 상대경로 → prisma/dev.db).
const SQLITE_DATASOURCE = `datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}`;

const replaced = src.replace(/datasource\s+db\s*\{[^}]*\}/, SQLITE_DATASOURCE);

if (replaced === src) {
  console.error("❌ datasource 블록을 찾지 못했습니다. schema.prisma 구조를 확인하세요.");
  process.exit(1);
}

const header = `// ⚠️ 자동 생성 파일 — 편집 금지. 원본: prisma/schema.prisma
// 생성: node scripts/gen-sqlite-schema.mjs  (npm run dev:sqlite 가 자동 실행)
// 로컬 개발 전용 SQLite 미러. 프로덕션 스키마는 prisma/schema.prisma 입니다.

`;

fs.writeFileSync(OUT, header + replaced);
console.log(`✅ ${path.relative(ROOT, OUT)} 생성 (provider=sqlite, url="file:./dev.db")`);
