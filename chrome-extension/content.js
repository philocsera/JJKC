const JJKC_CATEGORIES = [
  "Gaming",
  "Comedy",
  "Entertainment",
  "요리·먹방",
  "뷰티·패션",
  "생활·하우투",
  "Science & Technology",
  "Education",
  "News & Politics",
  "Sports",
  "People & Blogs",
  "Travel & Events",
  "영화",
  "애니메이션",
  "Autos & Vehicles",
  "Pets & Animals",
  "Nonprofits & Activism"
];

const CATEGORY_LEXICON = {
  "Gaming": [
    "게임", "게이밍", "롤", "리그오브레전드", "배그", "발로란트", "오버워치",
    "마인크래프트", "로블록스", "스팀", "공략", "플레이", "game", "gaming",
    "minecraft", "valorant", "lol", "league of legends"
  ],
  "Comedy": [
    "코미디", "개그", "웃긴", "웃참", "몰카", "패러디", "comedy", "funny", "sketch"
  ],
  "Entertainment": [
    "예능", "엔터", "아이돌", "연예", "방송", "토크쇼", "리액션", "reaction",
    "entertainment", "challenge", "챌린지", "shorts", "라이브", "live"
  ],
  "요리·먹방": [
    "요리", "레시피", "먹방", "맛집", "음식", "쿡방", "베이킹", "recipe",
    "food", "cooking", "mukbang", "restaurant"
  ],
  "뷰티·패션": [
    "뷰티", "패션", "메이크업", "화장", "코디", "룩북", "스타일링", "beauty",
    "fashion", "makeup", "lookbook", "style"
  ],
  "생활·하우투": [
    "하우투", "생활", "꿀팁", "살림", "정리", "리뷰", "사용법", "튜토리얼",
    "howto", "how-to", "tips", "diy", "tutorial"
  ],
  "Science & Technology": [
    "과학", "기술", "테크", "it", "ai", "인공지능", "chatgpt", "gpt", "코딩",
    "개발", "프로그래밍", "컴퓨터", "스마트폰", "노트북", "science", "technology",
    "tech", "programming", "coding", "software", "hardware", "알고리즘"
  ],
  "Education": [
    "교육", "공부", "강의", "수업", "대학", "시험", "수능", "학습", "설명",
    "education", "study", "lecture", "class", "lesson", "learn", "tutorial"
  ],
  "News & Politics": [
    "뉴스", "정치", "시사", "사회", "경제", "속보", "이슈", "분석", "news",
    "politics", "economy", "issue"
  ],
  "Sports": [
    "스포츠", "축구", "야구", "농구", "배구", "골프", "헬스", "운동", "피트니스",
    "sports", "football", "soccer", "baseball", "basketball", "fitness", "workout"
  ],
  "People & Blogs": [
    "브이로그", "일상", "인물", "vlog", "daily", "life", "routine", "blog",
    "people", "인터뷰", "토크", "q&a", "qa"
  ],
  "Travel & Events": [
    "여행", "이벤트", "축제", "해외", "국내여행", "travel", "trip", "event",
    "festival"
  ],
  "영화": [
    "영화", "무비", "예고편", "시네마", "movie", "film", "trailer", "cinema"
  ],
  "애니메이션": [
    "애니", "애니메이션", "만화", "웹툰", "anime", "animation", "cartoon"
  ],
  "Autos & Vehicles": [
    "자동차", "차", "신차", "시승", "튜닝", "오토바이", "vehicle", "car",
    "auto", "motorcycle", "drive"
  ],
  "Pets & Animals": [
    "동물", "펫", "강아지", "고양이", "반려동물", "animal", "pet", "dog", "cat"
  ],
  "Nonprofits & Activism": [
    "비영리", "봉사", "캠페인", "사회운동", "종교", "교회", "불교", "nonprofit",
    "activism", "campaign", "religion"
  ]
};

const OFFICIAL_CATEGORY_WEIGHTS = {
  "Gaming": { "Gaming": 90, "Entertainment": 10 },
  "Comedy": { "Comedy": 75, "Entertainment": 25 },
  "Entertainment": { "Entertainment": 70, "People & Blogs": 15, "Comedy": 10, "Education": 5 },
  "Howto & Style": { "생활·하우투": 55, "뷰티·패션": 20, "Education": 15, "요리·먹방": 10 },
  "Science & Technology": { "Science & Technology": 80, "Education": 20 },
  "Education": { "Education": 80, "Science & Technology": 10, "생활·하우투": 10 },
  "News & Politics": { "News & Politics": 85, "Education": 10, "People & Blogs": 5 },
  "Sports": { "Sports": 90, "Entertainment": 10 },
  "People & Blogs": { "People & Blogs": 60, "Entertainment": 20, "Travel & Events": 10, "생활·하우투": 10 },
  "Travel & Events": { "Travel & Events": 80, "People & Blogs": 20 },
  "Film & Animation": { "영화": 55, "애니메이션": 35, "Entertainment": 10 },
  "Autos & Vehicles": { "Autos & Vehicles": 85, "생활·하우투": 15 },
  "Pets & Animals": { "Pets & Animals": 90, "People & Blogs": 10 },
  "Nonprofits & Activism": { "Nonprofits & Activism": 80, "News & Politics": 20 }
};

function emptyScores() {
  const scores = {};
  JJKC_CATEGORIES.forEach((cat) => {
    scores[cat] = 0;
  });
  return scores;
}

function addScores(target, source, multiplier = 1) {
  Object.entries(source || {}).forEach(([category, value]) => {
    if (!JJKC_CATEGORIES.includes(category)) return;
    target[category] += Number(value || 0) * multiplier;
  });
}

function normalizeScores(scores) {
  const total = Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);
  const normalized = emptyScores();

  if (total <= 0) return normalized;

  JJKC_CATEGORIES.forEach((cat) => {
    normalized[cat] = (Number(scores[cat] || 0) / total) * 100;
  });

  return normalized;
}

function getText(selectorList) {
  for (const selector of selectorList) {
    const el = document.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return "";
}

function getMetaContent(nameOrProperty) {
  const selectors = [
    `meta[name="${nameOrProperty}"]`,
    `meta[property="${nameOrProperty}"]`
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const content = el?.getAttribute("content")?.trim();
    if (content) return content;
  }

  return "";
}

function getBalancedJsonFromText(text, startIndex) {
  const firstBrace = text.indexOf("{", startIndex);
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) {
      return text.slice(firstBrace, i + 1);
    }
  }

  return null;
}

function getYtInitialPlayerResponse() {
  const scripts = [...document.querySelectorAll("script")];

  for (const script of scripts) {
    const text = script.textContent || "";
    const markerIndex = text.indexOf("ytInitialPlayerResponse");

    if (markerIndex < 0) continue;

    const jsonText = getBalancedJsonFromText(text, markerIndex);
    if (!jsonText) continue;

    try {
      return JSON.parse(jsonText);
    } catch {
      continue;
    }
  }

  return null;
}

function getCurrentVideoIdFromUrl() {
  try {
    const url = new URL(location.href);
    return url.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function getYoutubeMetadata() {
  const player = getYtInitialPlayerResponse();

  const videoDetails = player?.videoDetails ?? {};
  const microformat = player?.microformat?.playerMicroformatRenderer ?? {};

  const officialCategory =
    microformat.category ||
    microformat.categoryName ||
    "";

  const keywordsFromPlayer = Array.isArray(videoDetails.keywords)
    ? videoDetails.keywords
    : [];

  const metaKeywords = getMetaContent("keywords")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return {
    videoId: videoDetails.videoId || "",
    officialCategory,
    keywords: [...new Set([...keywordsFromPlayer, ...metaKeywords])].slice(0, 30),
    title: videoDetails.title || "",
    channelName: videoDetails.author || ""
  };
}

function extractKeywords(text) {
  const normalized = text
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const stopwords = new Set([
    "the", "and", "with", "from", "this", "that", "official", "video",
    "영상", "유튜브", "오늘", "진짜", "하는", "하면", "해서", "있는",
    "없는", "너무", "완전", "ㅋㅋ"
  ]);

  return [...new Set(normalized)]
    .filter((word) => word.length >= 2 && !stopwords.has(word))
    .slice(0, 12);
}

function lexiconScores(text) {
  const normalized = String(text || "").toLowerCase();
  const scores = emptyScores();
  const matched = [];

  JJKC_CATEGORIES.forEach((category) => {
    const keywords = CATEGORY_LEXICON[category] || [];

    keywords.forEach((kw) => {
      if (normalized.includes(String(kw).toLowerCase())) {
        scores[category] += 1;
        matched.push(kw);
      }
    });
  });

  return { scores, matched: [...new Set(matched)].slice(0, 12) };
}

function fallbackScores() {
  return {
    ...emptyScores(),
    "Entertainment": 30,
    "People & Blogs": 30,
    "생활·하우투": 20,
    "Education": 20
  };
}

function buildVideoCategoryScores(videoInfo) {
  const scores = emptyScores();

  if (videoInfo.officialCategory && OFFICIAL_CATEGORY_WEIGHTS[videoInfo.officialCategory]) {
    addScores(scores, OFFICIAL_CATEGORY_WEIGHTS[videoInfo.officialCategory], 1.2);
  }

  const text = `${videoInfo.title} ${videoInfo.channelName} ${videoInfo.keywords.join(" ")}`;
  const lex = lexiconScores(text);
  addScores(scores, lex.scores, 22);

  const total = Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);

  return {
    categoryScores: total > 0 ? normalizeScores(scores) : fallbackScores(),
    matchedKeywords: lex.matched
  };
}


function getYoutubeDescriptionText() {
  const selectors = [
    "ytd-watch-metadata #description-inline-expander",
    "ytd-watch-metadata #description",
    "#description-inline-expander",
    "#description",
    "ytd-text-inline-expander"
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text) return text;
  }

  return "";
}

function extractHashtags(text) {
  const matches = String(text || "").match(/#[0-9A-Za-z가-힣_]+/g) || [];
  return [...new Set(
    matches
      .map((tag) => tag.replace(/^#/, "").trim())
      .filter((tag) => tag.length >= 2)
  )].slice(0, 12);
}

function getCurrentVideoInfo() {
  const metadata = getYoutubeMetadata();
  const currentVideoId = typeof getCurrentVideoIdFromUrl === "function" ? getCurrentVideoIdFromUrl() : "";
  const isFreshMetadata =
    !currentVideoId ||
    !metadata.videoId ||
    metadata.videoId === currentVideoId;

  const domTitle =
    getText([
      "h1.ytd-watch-metadata",
      "h1.title",
      "#title h1",
      "yt-formatted-string.ytd-watch-metadata"
    ]) ||
    document.querySelector("meta[name='title']")?.getAttribute("content")?.trim() ||
    document.title.replace(" - YouTube", "").trim();

  const domChannelName =
    getText([
      "ytd-watch-metadata ytd-channel-name a",
      "#owner #channel-name a",
      "#upload-info #channel-name a",
      "ytd-video-owner-renderer ytd-channel-name a"
    ]);

  const title = domTitle || (isFreshMetadata ? metadata.title : "") || "";
  const channelName = domChannelName || (isFreshMetadata ? metadata.channelName : "") || "";

  const descriptionText = typeof getYoutubeDescriptionText === "function" ? getYoutubeDescriptionText() : "";
  const descriptionSnippet = typeof cleanDescriptionForLLM === "function"
    ? cleanDescriptionForLLM(descriptionText)
    : String(descriptionText || "").slice(0, 900);

  const hashtags = typeof extractHashtags === "function" ? extractHashtags(descriptionText) : [];
  const safeOfficialCategory = isFreshMetadata ? metadata.officialCategory : "";
  const safeMetadataKeywords = isFreshMetadata ? metadata.keywords : [];

  const titleChannelKeywords = extractKeywords(`${title} ${channelName}`);
  const descriptionKeywords = extractKeywords(descriptionSnippet).slice(0, 25);

  return {
    videoId: currentVideoId,
    title,
    channelName,
    url: location.href,
    officialCategory: safeOfficialCategory,
    metadataKeywords: safeMetadataKeywords.slice(0, 12),
    hashtags,
    keywords: [...new Set([...titleChannelKeywords, ...descriptionKeywords, ...hashtags, ...safeMetadataKeywords.slice(0, 6)])].slice(0, 25),
    descriptionSnippet,
    analysisSource: "dom-for-llm"
  };
}


function waitForCurrentYoutubeDom(timeoutMs = 2600) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const startVideoId = getCurrentVideoIdFromUrl();

    const tick = () => {
      const currentVideoId = getCurrentVideoIdFromUrl();

      const title =
        getText([
          "h1.ytd-watch-metadata",
          "h1.title",
          "#title h1",
          "yt-formatted-string.ytd-watch-metadata"
        ]) ||
        document.title.replace(" - YouTube", "").trim();

      const channelName =
        getText([
          "ytd-watch-metadata ytd-channel-name a",
          "#owner #channel-name a",
          "#upload-info #channel-name a",
          "ytd-video-owner-renderer ytd-channel-name a"
        ]);

      const enoughDom = Boolean(title && channelName);
      const timedOut = Date.now() - startedAt >= timeoutMs;

      // YouTube 내부 라우팅 직후에는 DOM이 잠시 이전 영상일 수 있다.
      // 현재 URL videoId를 확인한 뒤, DOM이 준비되었거나 timeout이면 현재 상태로 분석한다.
      if ((currentVideoId && currentVideoId === startVideoId && enoughDom) || (title && timedOut)) {
        resolve();
        return;
      }

      setTimeout(tick, 120);
    };

    tick();
  });
}

async function getCurrentVideoInfoFresh() {
  await waitForCurrentYoutubeDom();
  return getCurrentVideoInfo();
}

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  const allowedOrigins = [
    "https://jjkc-algo-blush.vercel.app",
    "https://ytalgoshare.vercel.app"
  ];

  if (!allowedOrigins.includes(event.origin)) return;

  const data = event.data;

  if (!data || data.type !== "JJKC_CONNECT_EXTENSION") return;
  if (!data.userId) return;

  await chrome.storage.local.set({
    jjkcUserId: data.userId,
  });

  window.postMessage(
    {
      type: "JJKC_CONNECT_EXTENSION_DONE",
      ok: true,
    },
    event.origin
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "JJKC_ANALYZE_CURRENT_VIDEO") return;

  // YouTube 내부 이동으로 영상이 바뀌어도 새로고침 없이 현재 DOM을 다시 읽는다.
  getCurrentVideoInfoFresh()
    .then((videoInfo) => {
      sendResponse({
        ok: true,
        data: videoInfo
      });
    })
    .catch(() => {
      sendResponse({
        ok: false,
        error: "Failed to analyze current YouTube page"
      });
    });

  return true;
});
