// YouTube Data API — "Google 연동" 온보딩에서 사용자의 구독 채널을 가져온다.
// 토큰은 google-youtube provider 계정(Account)에 저장된 access_token/refresh_token 사용.
// (기본 google provider 는 youtube 스코프가 없으므로 google-youtube 계정에서만 읽는다)

import { prisma } from "./prisma";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const YT_PROVIDER = "google-youtube";

// 유효한 access token 반환(만료 시 refresh). youtube 권한 없으면 null.
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const acct = await prisma.account.findFirst({
    where: { userId, provider: YT_PROVIDER },
    select: { access_token: true, refresh_token: true, expires_at: true, scope: true },
  });
  if (!acct || !acct.scope?.includes("youtube")) return null;

  const now = Math.floor(Date.now() / 1000);
  if (acct.access_token && acct.expires_at && acct.expires_at - 60 > now) {
    return acct.access_token;
  }

  // 만료 → refresh_token 으로 갱신
  if (acct.refresh_token) {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: acct.refresh_token,
        grant_type: "refresh_token",
      }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      const token = data.access_token as string | undefined;
      if (token) {
        await prisma.account.updateMany({
          where: { userId, provider: YT_PROVIDER },
          data: { access_token: token, expires_at: now + (data.expires_in ?? 3600) },
        });
        return token;
      }
    }
  }
  return acct.access_token ?? null;
}

// mine=true 구독 채널 id 목록(페이지네이션). 실패 시 빈 배열.
export async function getSubscriptionChannelIds(accessToken: string, max = 300): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let guard = 0; guard < 10 && ids.length < max; guard++) {
    const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res || !res.ok) break;
    const data = await res.json();
    for (const it of data.items ?? []) {
      const cid = it?.snippet?.resourceId?.channelId;
      if (cid) ids.push(cid);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}
