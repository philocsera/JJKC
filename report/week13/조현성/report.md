# week13 — 로컬 개발 환경 복구 · 빌드 검증 · 변경 적대적 리뷰

> 프로덕션을 Neon Postgres 로 올린(week12 말) 직후 발생한 **로컬 개발 단절**을 복구하고,
> 그 과정에서 만든 변경이 **프로덕션 배포를 깨지 않음**을 다층(typecheck → build →
> 멀티에이전트 리뷰)으로 검증한 운영 작업 기록입니다. "기능 추가" 가 아니라
> "정본(Postgres) 을 건드리지 않고 로컬(SQLite) 을 되살리는 비대칭 설계" 가 핵심입니다.

---

## 1. 작업 개요

| 항목 | 결과 | 검증 |
|---|---|---|
| 로컬 SQLite 개발 복구 | ✅ `npm run dev:sqlite` 로 dev.db(6,540채널) 기동 | 홈 HTTP 200 · `/api/explore` JSON · `next build` ✓ |
| 빌드/타입 건강성 | ✅ `tsc --noEmit` 0 · `next build` 0 | 전 라우트 dynamic(ƒ) |
| 오프라인 데이터 품질 | ⚠️ 진단만 — 재분류 효과 0(no-op)으로 **미변경** | read-only diff `변경=0` |
| 문서 현행화 | ✅ README · .env.example · TODO | — |
| 멀티에이전트 리뷰(ultracode) | ✅ 14건 중 confirmed 5(전부 low/nit), **blocker 0** | 9건 실측 반증 · 2건 즉시 수정 |

전제 발견: 로컬 `.env` 의 `POSTGRES_PRISMA_URL`·`POSTGRES_URL_NON_POOLING` 이 **빈 문자열** →
이 머신에서는 프로덕션 Neon 에 접근 불가. 즉 **모든 DB 작업이 자동으로 로컬 SQLite 한정(안전)**
이고, 동시에 그래서 `npm run dev`(Postgres 스키마, 빈 자격증명)가 깨져 있던 상태였다.

---

## 2. 로컬 SQLite 개발 복구 — 핵심

### 2.1 문제

week12 에 `prisma/schema.prisma` 의 `provider` 가 `sqlite → postgresql` 로 바뀌면서
정본 스키마가 Neon 을 가리키게 됨. 그러나:

- 로컬 `.env` 의 Postgres 자격증명은 비어 있음 → `npm run dev` 가 DB 연결 실패.
- 기존 `prisma/dev.db`(SQLite, 채널 6,540 · 클러스터 15 · 유저 11)는 **온전히 보존**돼 있음.
- Prisma 는 `provider` 를 `env()` 로 못 받음(리터럴 고정) → 단일 스키마로 두 DB 토글 불가.

### 2.2 설계 — "datasource 만 갈아끼우는 파생 스키마"

정본 스키마는 그대로 두고, **로컬 전용 SQLite 미러를 자동 생성**한다.

```
prisma/schema.prisma          (정본, git 추적, provider=postgresql)
        │  scripts/gen-sqlite-schema.mjs  (datasource 블록만 치환)
        ▼
prisma/schema.sqlite.prisma   (파생, .gitignore, provider=sqlite, url="file:./dev.db")
```

- 이 프로젝트의 모델 필드가 **전부 스칼라**(String/Int/BigInt/Boolean/DateTime)이고
  Postgres 전용 타입(Json·배열·Decimal·enum·`@db.*`)이 0개라, datasource 블록만
  바꾸면 SQLite 와 100% 호환된다(모델/필드는 단일 진실 소스로 유지 → 드리프트 없음).
- 치환은 정규식 한 방: `src.replace(/datasource\s+db\s*\{[^}]*\}/, SQLITE_DATASOURCE)`.
- SQLite `url` 은 `env()` 가 아니라 **리터럴 `"file:./dev.db"`** 로 고정 — `.env` 의
  `DATABASE_URL` 중복/공백에 영향받지 않고 항상 `prisma/dev.db` 를 가리킨다(파일 경로는
  스키마 파일 위치 `prisma/` 기준 상대해석).

### 2.3 추가 npm 스크립트

| 스크립트 | 동작 |
|---|---|
| `dev:sqlite` | predev 가 SQLite client 재생성 → `next dev` (로컬 개발 기본 진입점) |
| `sqlite:push` | 파생 스키마로 `prisma db push` (빈 dev.db 스키마 생성/동기화 + client) |
| `sqlite:generate` | 파생 스키마로 `prisma generate` 만 (tsx 스크립트를 dev.db 대상으로) |
| `sqlite:studio` | Prisma Studio 를 dev.db 로 열기 |
| `postgres:generate` | 정본 Postgres 클라이언트로 되돌리기 |

### 2.4 검증(end-to-end)

```
$ PORT=3137 npm run dev:sqlite      → ✓ Ready in 1820ms
$ curl localhost:3137/              → HTTP 200 | 656,041 bytes | <title>JJKC …</title>
$ curl localhost:3137/api/explore   → {"items":[{"owner":{"id":"dummy_10",…}, profile{categories,subCategories…}}]}
$ npm run build                     → exit 0 (전 라우트 ƒ dynamic)
```

SQLite client 가 dev.db 에 정상 연결: `Channel 6540 · ChannelCluster 15 · User 11`.

---

## 3. 빌드/타입 건강성

- `tsc --noEmit` → exit 0.
- `next build` → exit 0. 모든 라우트가 `ƒ (Dynamic)` 이라 **빌드타임 DB 의존 없음**
  (정적 prerender 가 Neon 을 안 침 → 배포 빌드가 자격증명 누락으로 깨질 일 없음).
- ESLint: 이 프로젝트에 설정·의존성 자체가 없음 → 자율 도입하지 않음(프로젝트 변경 회피).

---

## 4. 오프라인 데이터 품질 — 진단 후 "건드리지 않기" 로 결론

TODO 의 "빈 subCategories(~1,400) 해소" 를 오프라인으로 가능한지 측정.

| 지표 | 값 |
|---|---|
| 전체 채널 | 6,540 |
| subCategories 빈 채널 | 1,436 |
| categories 빈 채널 | 188 |

read-only diff(현재 저장값 vs `subClassify()` 재계산):

```
동일(비어있지않음)=5104   동일(둘다빈)=1436   변경=0
  빈→채움=0   채움→빈=0   재배치=0
```

`reclassify-catalog --only-empty --dry` 도 `changed=0`.

**결론**: 현재 데이터가 이미 이 분류기 출력과 정확히 일치 → 오프라인 재분류는 **완전 no-op**.
빈 1,436개는 *텍스트가 빈약해 키워드 매칭이 안 되는* 채널이므로, **RSS/oEmbed enrich(네트워크)로
description·keywords 를 채운 뒤에만** subCategories 가 생긴다. 따라서 dev.db / `catalog-seed.json`
을 건드리지 않았다(무의미한 ~10MB diff 방지). 이 항목은 RSS throttle 해제 + enrich 가 선행돼야 진행 가능.

---

## 5. 문서 현행화

- `README.md` — "DB 구성(Postgres 정본 / SQLite 로컬)" 절 신설, 깨져 있던 "처음 설정"
  흐름을 `sqlite:push → catalog:restore → dev:sqlite` 로 교체, 스크립트 표 추가.
- `.env.example` — 로컬 SQLite 는 DB url 불필요(리터럴 고정), Neon 직접 작업 시에만
  `POSTGRES_PRISMA_URL`·`POSTGRES_URL_NON_POOLING` 필요함을 명시.
- `TODO.md`(git 미추적, 로컬 전용) — 완료 항목 이동, Upstash 캐시는 **코드 이미 완성**
  (env 주입만 남음)임을 명시, 데이터 품질 진단 결과 기록.

---

## 6. 멀티에이전트 적대적 리뷰 (ultracode)

변경이 빌드/배포 설정을 건드리므로, 4개 차원으로 병렬 리뷰 → **발견별 적대적 검증** 워크플로 실행.

```
Review(병렬 4)              Verify(발견별 병렬, 적대적)
 ├ deploy-safety      ─┐
 ├ script-correctness ─┼─►  각 발견을 "오탐/이미가드/진짜" 로 반증 시도
 ├ docs-accuracy      ─┤     (불확실하면 isReal=false 로 기울임)
 └ clone-flow         ─┘
```

결과: **14건 발견 → confirmed 5 (전부 low/nit), rejected 9, blocker/high 0.**

| # | 차원 | 등급 | 발견 | 조치 |
|---|---|---|---|---|
| 1 | deploy-safety | low | `migrations/` 가 레거시 SQLite 인데 정본은 Postgres → `migrate` 계열 쓰면 P3019 | **선재 부채** — 보고만(아래 7) |
| 2 | script-correctness | low | `new URL().pathname` 미디코딩 → 공백/특수문자 경로서 깨짐 | ✅ `fileURLToPath` 로 수정 |
| 3 | clone-flow | low | `restore-catalog.ts` 주석이 깨지는 `migrate deploy` 안내 | ✅ SQLite 정본 흐름으로 정정 |
| 4 | deploy-safety | nit | (2와 동일 — Windows 경로 각도) | ✅ 2로 해소 |
| 5 | docs-accuracy | nit | README 이력 배너 수치(6,592/16) vs 실제(6,540/15) | 이력 서술이라 보존(보고만) |

기각된 9건은 모두 실측으로 반증됨. 대표적으로:
- "schema.sqlite.prisma 가 기본 스키마 탐색을 가로챈다" → 인자 없는 `prisma validate/generate`
  는 항상 `schema.prisma`(Postgres) 로드 확인. 단일파일 모드라 자동 머지 없음.
- "잘못된 client 상태서 catalog:restore 가 Neon 을 덮어쓴다" → `.env` 의 Postgres url 이
  빈 문자열이라 연결 자체가 실패. 파괴 경로 없음.
- "Postgres 전용 타입 추가 시 SQLite 가 조용히 깨진다" → `String[]` 등은 `prisma generate`
  가 P1012/exit 1 로 **시끄럽게** 실패(`dev:sqlite` 의 predev 가 게이트). 무음 붕괴 아님.

---

## 7. 함께 발견된 선재 부채 (이번 변경 밖 — 후속 권장)

> 리뷰어가 "이 PR 이 만든 문제가 아니므로 막지 말 것" 으로 명시. 별도 정리 대상.

- `prisma/migrations/` = **레거시 SQLite** 산출물(`migration_lock.toml` provider=sqlite,
  SQL 이 `TEXT PRIMARY KEY`/`DATETIME` 방언). 정본 스키마는 postgresql.
  현재 운영은 `db push` 라 무해하지만:
  - `package.json` 의 `db:migrate`(=`prisma migrate dev`)는 실행 즉시 P3019 로 깨짐.
  - `restore-catalog.ts` 주석의 `migrate deploy` 유도(→ #3 에서 SQLite 흐름으로 정정 완료).
  - 권장: ① `migrations/` 정리 또는 "레거시" 명시 ② `db:migrate` 제거/대체 ③ `db push` 정본화 유지.

---

## 8. 배포 안전성 논증

```
vercel-build = "prisma generate && prisma db push --skip-generate && next build"
                       │ (인자 없음 → schema.prisma = Postgres)
                       └─ 매 배포 Postgres 클라이언트 재생성
```

- 추가한 `*:sqlite` 스크립트 / `gen-sqlite-schema.mjs` 는 `vercel-build` 가 **호출하지 않음**.
- `prisma/schema.sqlite.prisma` 는 `.gitignore` 대상 → Vercel 클린 체크아웃에 **존재조차 안 함**.
- 변경 파일은 전부 가산적(스크립트·문서·주석) — `app/`·빌드 경로 코드 무수정.
- 작업 종료 시 기본 `@prisma/client` 를 Postgres 로 복원(`provider="postgresql"` 확인).
- git 변경분: `.env.example` · `.gitignore` · `README.md` · `package.json` ·
  `scripts/restore-catalog.ts` (수정), `scripts/gen-sqlite-schema.mjs` (신규).
  `dev.db` · `catalog-seed.json` **무변경**.

---

## 9. 다음 할 일

**🔴 대시보드/콘솔 (개발자 본인만 가능)**
1. Vercel: **Root Directory = `jhs`**, Production Branch = `main`.
2. Google Cloud: 리디렉션 URI `https://jjkc-algo.vercel.app/api/auth/callback/google` 추가 +
   OAuth 동의 화면 **게시(Publish)**.

**🟡 데이터/운영**
3. **데이터 품질**: RSS throttle 해제 후 `discovered-pending.json`(97) enrich + text 빈약 채널
   보강 → 그 뒤에야 빈 subCategories(1,436)/categories(188) 가 채워짐(오프라인 불가, §4 참조).
4. **카탈로그 → Neon 반영**: 로컬 `.env` 에 Neon 문자열 넣고 `npm run catalog:restore` 1회.
5. (선택) **Upstash Redis**: 코드 완성(`lib/cache.ts` 자동 fallback) — marketplace 프로비저닝 + env 주입만.
6. (선택) **migrations 정리**(§7): `db:migrate` 제거/대체, `migrations/` 레거시 정리.

**🟢 로컬 개발**
7. 협업자: `npm install → sqlite:push → catalog:restore → dev:sqlite` (README 참조).

---

## 10. 한 줄 요약

> **정본 Postgres 스키마를 한 줄도 건드리지 않고, datasource 블록만 치환하는 파생 SQLite
> 미러로 로컬 개발을 되살렸다. typecheck·build·멀티에이전트 적대적 리뷰 3중 검증으로
> 배포 무영향을 확인했고, 데이터 품질은 "오프라인 재분류 효과 0(no-op)" 임을 측정해
> 무의미한 변경 대신 네트워크 enrich 선행 조건을 명확히 남겼다.**
