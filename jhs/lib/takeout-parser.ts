// Google Takeout 시청 기록(.json / .html) 파서 — 클라이언트에서 파일을 읽어
// WatchEntry[] 로 변환한다. (demo_v2 브랜치 구현 이식 + jhs 용으로 정리)
// 서버는 channelId 만 필요로 하므로, 여기서 videoId/channelId/제목/시간을 뽑는다.

export interface WatchEntry {
  videoId: string;
  title: string;
  channelId?: string;
  channelTitle?: string;
  time?: string;
}

function extractVideoId(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?&]v=([^&#]+)/);
  return m ? m[1] : null;
}

function extractChannelId(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/channel\/([^&#/]+)/);
  return m ? m[1] : null;
}

// watch-history.json — [{ titleUrl, title:"Watched ...", subtitles:[{name,url}], time }]
export function parseTakeoutJSON(jsonContent: string): WatchEntry[] {
  const data = JSON.parse(jsonContent);
  if (!Array.isArray(data)) return [];
  return data
    .map((item: any): WatchEntry | null => {
      const videoId = extractVideoId(item.titleUrl);
      if (!videoId) return null;
      return {
        videoId,
        title: (item.title ?? "").replace(/^Watched\s+/, "") || "제목 없음",
        channelId: extractChannelId(item.subtitles?.[0]?.url) || undefined,
        channelTitle: item.subtitles?.[0]?.name,
        time: item.time,
      };
    })
    .filter((e): e is WatchEntry => e !== null);
}

// watch-history.html — .content-cell 안에 "Watched <video> <channel> <time>"
export function parseTakeoutHTML(htmlContent: string): WatchEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  const cells = doc.querySelectorAll(".content-cell");
  const entries: WatchEntry[] = [];
  cells.forEach((cell) => {
    const text = cell.textContent || "";
    if (!text.startsWith("Watched")) return;
    const links = cell.querySelectorAll("a");
    const videoId = extractVideoId((links[0] as HTMLAnchorElement | undefined)?.href);
    if (!videoId) return;
    const lines = cell.innerHTML.split("<br>");
    const time = lines[lines.length - 1]?.trim().replace(/<[^>]*>?/gm, "") || undefined;
    entries.push({
      videoId,
      title: links[0]?.textContent || "제목 없음",
      channelId: extractChannelId((links[1] as HTMLAnchorElement | undefined)?.href) || undefined,
      channelTitle: links[1]?.textContent || undefined,
      time,
    });
  });
  return entries;
}

// 확장자/내용으로 형식 자동 감지. (브라우저 전용 — DOMParser/File 사용)
export async function parseTakeout(file: File): Promise<WatchEntry[]> {
  const content = await file.text();
  if (file.name.endsWith(".json") || content.trim().startsWith("[")) {
    return parseTakeoutJSON(content);
  }
  if (
    file.name.endsWith(".html") ||
    content.trim().toLowerCase().startsWith("<!doctype html") ||
    content.includes("content-cell")
  ) {
    return parseTakeoutHTML(content);
  }
  throw new Error("지원하지 않는 파일 형식입니다. .json 또는 .html 파일을 업로드해 주세요.");
}
