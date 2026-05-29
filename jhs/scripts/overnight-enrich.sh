#!/usr/bin/env bash
# 밤새 DB 보강 — 09:00 까지 (또는 쿼리 풀 소진까지) 발굴→보강 반복 후 재분류·재클러스터.
# 5만 floor 유지. 라운드마다 다른 니치 쿼리 배치를 돌려 새 버티컬을 캔다.
#
# 실행 (맥 안 자게 + 터미널 닫혀도 생존):
#   cd jhs && caffeinate -is nohup bash scripts/overnight-enrich.sh > /tmp/overnight.log 2>&1 &
#
# 환경변수: CHUNK(라운드당 쿼리수,기본40) PACE(라운드간 대기초,기본240) STOP_HHMM(종료시각,기본0900)

set -uo pipefail
cd "$(dirname "$0")/.." # → jhs/

POOL="data/overnight-queries.txt"
WORK=/tmp/onight
mkdir -p "$WORK"
CHUNK=${CHUNK:-40}
PACE=${PACE:-240}
STOP_HHMM=${STOP_HHMM:-0900}
SH=${STOP_HHMM:0:2}
SM=${STOP_HHMM:2:2}

# GNU(coreutils) date 와 BSD date 둘 다 지원.
epoch_at() { date -d "$1 ${SH}:${SM}:00" +%s 2>/dev/null || date -v"${SH}"H -v"${SM}"M -v0S +%s; }
fmt_epoch() { date -d "@$1" 2>/dev/null || date -r "$1"; }

# 종료 목표시각 = 다음 STOP_HHMM (이미 지났으면 내일).
TARGET=$(epoch_at today)
NOW=$(date +%s)
if [ "$NOW" -ge "$TARGET" ]; then
  TARGET=$(date -d "tomorrow ${SH}:${SM}:00" +%s 2>/dev/null || date -v+1d -v"${SH}"H -v"${SM}"M -v0S +%s)
fi

echo "[overnight] 시작 $(date)  종료목표 $(fmt_epoch "$TARGET")  chunk=$CHUNK pace=${PACE}s floor=50k"
echo "[overnight] 시작 시 채널수: $(sqlite3 prisma/dev.db 'SELECT COUNT(*) FROM Channel;')"

# 쿼리 풀을 배치로 분할.
rm -f "$WORK"/batch_*
split -l "$CHUNK" "$POOL" "$WORK/batch_"

round=0
for batch in "$WORK"/batch_*; do
  [ "$(date +%s)" -ge "$TARGET" ] && { echo "[overnight] 종료시각 도달 — 루프 중단"; break; }
  round=$((round + 1))
  out="$WORK/disc_${round}.json"
  echo "[overnight] ── 라운드 $round  $(date '+%H:%M:%S')  쿼리 $(wc -l < "$batch")개 ──"
  npx tsx scripts/discover-channels.ts --queries "$batch" --queries-only --depth 5 --conc 2 --out "$out" 2>&1 | tail -2
  if [ -f "$out" ]; then
    npx tsx scripts/enrich-discovered.ts "$out" --conc 5 2>&1 | tail -1
  else
    echo "[overnight] (발굴 결과 파일 없음 — 보강 건너뜀)"
  fi
  echo "[overnight] 현재 채널수: $(sqlite3 prisma/dev.db 'SELECT COUNT(*) FROM Channel;')"
  [ "$(date +%s)" -ge "$TARGET" ] && break
  sleep "$PACE"
done

echo "[overnight] ── 마무리: 세부 재분류 + 재클러스터 $(date '+%H:%M:%S') ──"
npx tsx scripts/reclassify-subcategories.ts 2>&1 | grep -E "assigned|empty" | head -1
npx tsx scripts/channels-cluster.ts 2>&1 | grep -E "silhouette 최고" | head -1
echo "[overnight] ✅ DONE $(date)  최종 채널수: $(sqlite3 prisma/dev.db 'SELECT COUNT(*) FROM Channel;')"
