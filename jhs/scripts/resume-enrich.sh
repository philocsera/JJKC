#!/usr/bin/env bash
# 방전으로 중단된 overnight 작업 이어달리기 — 남은 쿼리 풀(remaining-queries.txt)을
# 끝까지 발굴→보강 후, 마무리로 세부 재분류 + 재클러스터까지 1회 실행.
# 시간 제한 없음(낮 실행). 발굴은 기존 DB id 와 중복 제거되므로 버퍼 구간 재실행 안전.
#
# 실행 (맥 안 자게 + 터미널 닫혀도 생존):
#   cd jhs && caffeinate -is nohup bash scripts/resume-enrich.sh > /tmp/resume.log 2>&1 &
#
# 환경변수: CHUNK(라운드당 쿼리수,기본40)

set -uo pipefail
cd "$(dirname "$0")/.." # → jhs/

POOL="data/remaining-queries.txt"
WORK=/tmp/resume
mkdir -p "$WORK"
CHUNK=${CHUNK:-40}

echo "[resume] 시작 $(date)  pool=$POOL($(wc -l < "$POOL")개) chunk=$CHUNK"
echo "[resume] 시작 시 채널수: $(sqlite3 prisma/dev.db 'SELECT COUNT(*) FROM Channel;')"

rm -f "$WORK"/batch_*
split -l "$CHUNK" "$POOL" "$WORK/batch_"

round=0
for batch in "$WORK"/batch_*; do
  round=$((round + 1))
  out="$WORK/disc_${round}.json"
  echo "[resume] ── 라운드 $round  $(date '+%H:%M:%S')  쿼리 $(wc -l < "$batch")개 ──"
  npx tsx scripts/discover-channels.ts --queries "$batch" --queries-only --depth 5 --conc 2 --out "$out" 2>&1 | tail -2
  if [ -f "$out" ]; then
    npx tsx scripts/enrich-discovered.ts "$out" --conc 5 2>&1 | tail -1
  else
    echo "[resume] (발굴 결과 파일 없음 — 보강 건너뜀)"
  fi
  echo "[resume] 현재 채널수: $(sqlite3 prisma/dev.db 'SELECT COUNT(*) FROM Channel;')"
done

echo "[resume] ── 마무리: 세부 재분류 + 재클러스터 $(date '+%H:%M:%S') ──"
npx tsx scripts/reclassify-subcategories.ts 2>&1 | tail -3
npx tsx scripts/channels-cluster.ts 2>&1 | tail -3
echo "[resume] ✅ DONE $(date)  최종 채널수: $(sqlite3 prisma/dev.db 'SELECT COUNT(*) FROM Channel;')"
echo "[resume] clusterId NULL: $(sqlite3 prisma/dev.db 'SELECT COUNT(*) FROM Channel WHERE clusterId IS NULL;')  subCat 빈것: $(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Channel WHERE subCategories='{}' OR subCategories IS NULL;")"
