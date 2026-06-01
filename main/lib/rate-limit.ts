// IP 단위 일일 레이트리밋 — 서버리스 인스턴스 간 공유돼야 해서 DB(RateLimit)에 둔다.
// 키에 KST 날짜를 넣어 매일 자정(KST) 자동 리셋. upsert + increment 는 DB 레벨에서 원자적.

import { prisma } from "./prisma";

// IPv4/IPv6 문자만, 길이 상한(IPv6 최대 45자) — 헤더로 들어온 비정상/조작 값(키 폭증·
// 과도한 길이)을 막는다. 형식이 어긋나면 null → "unknown" 공유 버킷으로 처리.
function sanitizeIp(raw: string | null | undefined): string | null {
  const ip = raw?.trim();
  if (!ip || ip.length > 45 || !/^[0-9a-fA-F.:]+$/.test(ip)) return null;
  return ip;
}

// 클라이언트 IP 추정. Vercel 이 설정하는 x-real-ip 를 우선(클라이언트가 헤더로 조작하기
// 어려움) → x-forwarded-for 첫 항목 → "unknown". 형식 검증으로 키 인젝션·폭증을 차단.
export function clientIp(req: Request): string {
  return (
    sanitizeIp(req.headers.get("x-real-ip")) ||
    sanitizeIp(req.headers.get("x-forwarded-for")?.split(",")[0]) ||
    "unknown"
  );
}

// KST(UTC+9) 기준 오늘 날짜(YYYY-MM-DD) — 한국 사용자의 "하루"에 맞춰 자정 리셋.
function kstDay(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// action+ip 의 오늘 사용 횟수를 1 증가시키고 "증가 후" 카운트를 반환(원자적).
// 한도 초과 판단은 호출부가 한다. 11번째 호출이면 11 을 돌려준다.
export async function bumpDailyCount(action: string, ip: string): Promise<number> {
  const key = `${action}:${ip}:${kstDay()}`;
  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count;
}
