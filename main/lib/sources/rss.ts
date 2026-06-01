// YouTube 공개 RSS feed 어댑터.
//
// 공식 endpoint (key 불필요):
//   - 채널:    https://www.youtube.com/feeds/videos.xml?channel_id=UC...
//   - 플레이리스트: https://www.youtube.com/feeds/videos.xml?playlist_id=PL...
//
// 응답은 Atom XML, 최근 15개 영상의 id/title/published/author/링크/썸네일을 준다.
// 카테고리/구독자수/조회수는 RSS 엔 없음 → channel statistics 가 필요하면
// oEmbed 또는 정적 카탈로그에서 보강한다.

import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // entry 가 1 개면 배열 대신 객체로 떨어지므로 항상 배열로 정규화한다.
  isArray: (name) => name === "entry",
});

export type RssVideo = {
  videoId: string;
  title: string;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  thumbnail: string;
  description: string;
};

export type RssChannel = {
  channelId: string;
  title: string;
  publishedAt: string | null; // 채널 자체의 published
  videos: RssVideo[];
};

const UA =
  "Mozilla/5.0 (compatible; yt-algo-share/0.1; +https://example.com/bot)";

// YouTube 가 IP 단위로 공개 RSS 요청을 throttle 할 때 반환하는 상태(429/503).
// 이걸 404(채널 없음)와 구분해야 "차단당하는 중에 계속 두드리는" 사고를 막을 수 있다.
export class RateLimitError extends Error {
  constructor(
    public status: number,
    url: string,
  ) {
    super(`RSS rate limited: ${status} ${url}`);
    this.name = "RateLimitError";
  }
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/atom+xml,text/xml" },
    signal,
  });
  if (!res.ok) {
    const err = new Error(`RSS fetch failed: ${res.status} ${url}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.text();
}

function entriesToVideos(entries: any[]): RssVideo[] {
  return entries.map((e) => {
    const media = e["media:group"] ?? {};
    const thumbAttr = media["media:thumbnail"]?.["@_url"];
    return {
      videoId: e["yt:videoId"] ?? "",
      title: typeof e.title === "string" ? e.title : (e.title?.["#text"] ?? ""),
      publishedAt: e.published ?? "",
      channelId: e["yt:channelId"] ?? "",
      channelTitle:
        typeof e.author === "object" ? e.author?.name ?? "" : (e.author ?? ""),
      thumbnail:
        thumbAttr ??
        (e["yt:videoId"]
          ? `https://i.ytimg.com/vi/${e["yt:videoId"]}/mqdefault.jpg`
          : ""),
      description:
        typeof media["media:description"] === "string"
          ? media["media:description"]
          : (media["media:description"]?.["#text"] ?? ""),
    };
  });
}

export async function fetchChannelFeed(
  channelId: string,
  // throwOnRateLimit: 429/503 을 RateLimitError 로 던진다(배치 스크립트가 백오프/중단 판단에 사용).
  // 기본 false — 웹앱 호출부의 기존 동작(에러 시 null)을 그대로 유지한다.
  opts: { signal?: AbortSignal; throwOnRateLimit?: boolean } = {},
): Promise<RssChannel | null> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  let xml: string;
  try {
    xml = await fetchText(url, opts.signal);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (opts.throwOnRateLimit && (status === 429 || status === 503)) {
      throw new RateLimitError(status, url);
    }
    return null;
  }
  const root = parser.parse(xml);
  const feed = root.feed;
  if (!feed) return null;
  const entries = Array.isArray(feed.entry) ? feed.entry : [];
  const channelTitle =
    typeof feed.author === "object" ? feed.author?.name ?? "" : "";
  return {
    channelId,
    title: typeof feed.title === "string" ? feed.title : channelTitle,
    publishedAt: feed.published ?? null,
    videos: entriesToVideos(entries),
  };
}

export async function fetchPlaylistFeed(
  playlistId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<RssChannel | null> {
  const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
  let xml: string;
  try {
    xml = await fetchText(url, opts.signal);
  } catch {
    return null;
  }
  const root = parser.parse(xml);
  const feed = root.feed;
  if (!feed) return null;
  const entries = Array.isArray(feed.entry) ? feed.entry : [];
  return {
    channelId: entries[0]?.["yt:channelId"] ?? "",
    title: typeof feed.title === "string" ? feed.title : "",
    publishedAt: feed.published ?? null,
    videos: entriesToVideos(entries),
  };
}

// URL 에서 playlistId 뽑기 (사용자가 onboard 에서 붙여넣을 형식들).
//   ?list=PLxxxxx  / &list=PLxxxxx  / 단독 PL... 토큰
export function extractPlaylistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const tokenMatch = trimmed.match(/(?:^|[?&/])list=([A-Za-z0-9_-]{10,})/);
  if (tokenMatch) return tokenMatch[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed) && trimmed.startsWith("PL")) {
    return trimmed;
  }
  return null;
}

// URL/핸들 → channelId 추출. UC... 직접 입력이면 그대로.
//   /channel/UCxxx  /  ?channel_id=UCxxx  /  단독 UC... 토큰
// @handle 형식은 RSS 로 못 풀어서 null. (oEmbed/HTML scrape 필요.)
export function extractChannelId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const channelPath = trimmed.match(/channel\/(UC[A-Za-z0-9_-]{20,})/);
  if (channelPath) return channelPath[1];
  const channelQuery = trimmed.match(/channel_id=(UC[A-Za-z0-9_-]{20,})/);
  if (channelQuery) return channelQuery[1];
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}
