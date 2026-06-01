import { CATEGORY_NAMESPACE } from "@/lib/categories";

type CategoryName = (typeof CATEGORY_NAMESPACE)[number];

export type ExtensionVideoAnalysis = {
  title: string;
  channelName: string;
  videoId: string;
  officialCategory: string;
  categoryId: string;
  tags: string[];
  hashtags: string[];
  keywords: string[];
  matchedKeywords: string[];
  categoryScores: Record<string, number>;
  analysisSource: "youtube-api";
};

type YoutubeVideoListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      tags?: string[];
      categoryId?: string;
    };
  }>;
};

const STOPWORDS = new Set([
  "the", "and", "with", "from", "this", "that", "official", "video",
  "youtube", "youtu", "영상", "유튜브", "오늘", "진짜", "하는", "하면",
  "해서", "있는", "없는", "너무", "완전", "ㅋㅋ", "shorts", "short"
]);

const YOUTUBE_CATEGORY_ID_LABELS: Record<string, string> = {
  "1": "Film & Animation",
  "2": "Autos & Vehicles",
  "10": "Music",
  "15": "Pets & Animals",
  "17": "Sports",
  "19": "Travel & Events",
  "20": "Gaming",
  "22": "People & Blogs",
  "23": "Comedy",
  "24": "Entertainment",
  "25": "News & Politics",
  "26": "Howto & Style",
  "27": "Education",
  "28": "Science & Technology",
  "29": "Nonprofits & Activism"
};

const YOUTUBE_CATEGORY_WEIGHTS: Record<string, Partial<Record<CategoryName, number>>> = {
  "1": { "영화": 55, "애니메이션": 35, "Entertainment": 10 },
  "2": { "Autos & Vehicles": 85, "생활·하우투": 15 },
  "10": { "Entertainment": 55, "People & Blogs": 25, "Travel & Events": 20 },
  "15": { "Pets & Animals": 90, "People & Blogs": 10 },
  "17": { "Sports": 90, "Entertainment": 10 },
  "19": { "Travel & Events": 80, "People & Blogs": 20 },
  "20": { "Gaming": 90, "Entertainment": 10 },
  "22": { "People & Blogs": 60, "Entertainment": 20, "Travel & Events": 10, "생활·하우투": 10 },
  "23": { "Comedy": 75, "Entertainment": 25 },
  "24": { "Entertainment": 70, "People & Blogs": 15, "Comedy": 10, "Education": 5 },
  "25": { "News & Politics": 85, "Education": 10, "People & Blogs": 5 },
  "26": { "생활·하우투": 55, "뷰티·패션": 20, "Education": 15, "요리·먹방": 10 },
  "27": { "Education": 80, "Science & Technology": 10, "생활·하우투": 10 },
  "28": { "Science & Technology": 80, "Education": 20 },
  "29": { "Nonprofits & Activism": 80, "News & Politics": 20 }
};

const CATEGORY_LEXICON: Record<CategoryName, string[]> = {
  "Gaming": ["게임", "게이밍", "롤", "리그오브레전드", "배그", "발로란트", "마인크래프트", "로블록스", "스팀", "공략", "플레이", "game", "gaming", "minecraft", "valorant", "lol", "league of legends"],
  "Comedy": ["코미디", "개그", "웃긴", "웃참", "몰카", "패러디", "comedy", "funny", "sketch"],
  "Entertainment": ["예능", "엔터", "아이돌", "연예", "방송", "토크쇼", "리액션", "reaction", "entertainment", "challenge", "챌린지", "shorts", "라이브", "live"],
  "요리·먹방": ["요리", "레시피", "먹방", "맛집", "음식", "쿡방", "베이킹", "recipe", "food", "cooking", "mukbang", "restaurant"],
  "뷰티·패션": ["뷰티", "패션", "메이크업", "화장", "코디", "룩북", "스타일링", "beauty", "fashion", "makeup", "lookbook", "style"],
  "생활·하우투": ["하우투", "생활", "꿀팁", "살림", "정리", "리뷰", "사용법", "튜토리얼", "howto", "how-to", "tips", "diy", "tutorial"],
  "Science & Technology": ["과학", "기술", "테크", "it", "ai", "인공지능", "chatgpt", "gpt", "코딩", "개발", "프로그래밍", "컴퓨터", "스마트폰", "노트북", "science", "technology", "tech", "programming", "coding", "software", "hardware", "알고리즘"],
  "Education": ["교육", "공부", "강의", "수업", "대학", "시험", "수능", "학습", "설명", "education", "study", "lecture", "class", "lesson", "learn", "tutorial"],
  "News & Politics": ["뉴스", "정치", "시사", "사회", "경제", "속보", "이슈", "분석", "news", "politics", "economy", "issue"],
  "Sports": ["스포츠", "축구", "야구", "농구", "배구", "골프", "헬스", "운동", "피트니스", "sports", "football", "soccer", "baseball", "basketball", "fitness", "workout"],
  "People & Blogs": ["브이로그", "일상", "인물", "vlog", "daily", "life", "routine", "blog", "people", "인터뷰", "토크", "q&a", "qa"],
  "Travel & Events": ["여행", "이벤트", "축제", "해외", "국내여행", "travel", "trip", "event", "festival"],
  "영화": ["영화", "무비", "예고편", "시네마", "movie", "film", "trailer", "cinema"],
  "애니메이션": ["애니", "애니메이션", "만화", "웹툰", "anime", "animation", "cartoon"],
  "Autos & Vehicles": ["자동차", "차", "신차", "시승", "튜닝", "오토바이", "vehicle", "car", "auto", "motorcycle", "drive"],
  "Pets & Animals": ["동물", "펫", "강아지", "고양이", "반려동물", "animal", "pet", "dog", "cat"],
  "Nonprofits & Activism": ["비영리", "봉사", "캠페인", "사회운동", "종교", "교회", "불교", "nonprofit", "activism", "campaign", "religion"]
};

function emptyScores(): Record<string, number> {
  const scores: Record<string, number> = {};
  CATEGORY_NAMESPACE.forEach((cat) => {
    scores[cat] = 0;
  });
  return scores;
}

function addScores(target: Record<string, number>, source: Partial<Record<CategoryName, number>>, multiplier = 1) {
  Object.entries(source).forEach(([category, value]) => {
    if (!CATEGORY_NAMESPACE.includes(category as CategoryName)) return;
    target[category] = (target[category] ?? 0) + Number(value ?? 0) * multiplier;
  });
}

function normalizeScores(scores: Record<string, number>) {
  const total = Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);
  const normalized = emptyScores();

  if (total <= 0) return normalized;

  CATEGORY_NAMESPACE.forEach((cat) => {
    normalized[cat] = (Number(scores[cat] || 0) / total) * 100;
  });

  return normalized;
}

function extractHashtags(text: string) {
  const matches = String(text || "").match(/#[0-9A-Za-z가-힣_]+/g) || [];
  return [...new Set(
    matches
      .map((tag) => tag.replace(/^#/, "").trim())
      .filter((tag) => tag.length >= 2)
  )].slice(0, 20);
}

function extractKeywords(text: string, limit = 30) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return [...new Set(normalized)]
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word))
    .slice(0, limit);
}

function lexiconScores(text: string) {
  const normalized = String(text || "").toLowerCase();
  const scores = emptyScores();
  const matched: string[] = [];

  CATEGORY_NAMESPACE.forEach((category) => {
    const keywords = CATEGORY_LEXICON[category];

    keywords.forEach((kw) => {
      if (normalized.includes(String(kw).toLowerCase())) {
        scores[category] += 1;
        matched.push(kw);
      }
    });
  });

  return {
    scores,
    matched: [...new Set(matched)].slice(0, 20)
  };
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

function buildVideoCategoryScores(input: {
  title: string;
  channelName: string;
  tags: string[];
  hashtags: string[];
  categoryId: string;
}) {
  const scores = emptyScores();

  const categoryWeights = YOUTUBE_CATEGORY_WEIGHTS[input.categoryId];
  if (categoryWeights) {
    addScores(scores, categoryWeights, 1.2);
  }

  const allText = [
    input.title,
    input.channelName,
    input.tags.join(" "),
    input.hashtags.join(" ")
  ].join(" ");

  const allLex = lexiconScores(allText);
  addScores(scores, allLex.scores as Partial<Record<CategoryName, number>>, 18);

  // 업로더가 직접 입력한 tags와 설명 #태그는 의도가 강한 신호이므로 한 번 더 가중한다.
  const tagLex = lexiconScores([...input.tags, ...input.hashtags].join(" "));
  addScores(scores, tagLex.scores as Partial<Record<CategoryName, number>>, 10);

  const total = Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);

  return {
    categoryScores: total > 0 ? normalizeScores(scores) : fallbackScores(),
    matchedKeywords: [...new Set([...allLex.matched, ...tagLex.matched])].slice(0, 20)
  };
}

export async function analyzeVideoForExtension(videoId: string): Promise<ExtensionVideoAnalysis> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is not configured");
  }

  const normalizedVideoId = String(videoId || "").trim();

  if (!/^[0-9A-Za-z_-]{6,}$/.test(normalizedVideoId)) {
    throw new Error("Invalid YouTube videoId");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", normalizedVideoId);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`YouTube Data API request failed: ${res.status}`);
  }

  const data = (await res.json()) as YoutubeVideoListResponse;
  const item = data.items?.[0];

  if (!item?.snippet) {
    throw new Error("Video not found");
  }

  const snippet = item.snippet;
  const title = snippet.title ?? "";
  const channelName = snippet.channelTitle ?? "";
  const description = snippet.description ?? "";
  const tags = Array.isArray(snippet.tags) ? snippet.tags.filter(Boolean).slice(0, 40) : [];
  const hashtags = extractHashtags(description);
  const categoryId = snippet.categoryId ?? "";
  const officialCategory = YOUTUBE_CATEGORY_ID_LABELS[categoryId] ?? categoryId;

  const scoreResult = buildVideoCategoryScores({
    title,
    channelName,
    tags,
    hashtags,
    categoryId
  });

  const keywords = [
    ...extractKeywords(`${title} ${channelName}`, 12),
    ...tags.map((tag) => tag.toLowerCase()),
    ...hashtags.map((tag) => tag.toLowerCase()),
    ...scoreResult.matchedKeywords
  ];

  return {
    title,
    channelName,
    videoId: normalizedVideoId,
    officialCategory,
    categoryId,
    tags,
    hashtags,
    keywords: [...new Set(keywords)].slice(0, 30),
    matchedKeywords: scoreResult.matchedKeywords,
    categoryScores: scoreResult.categoryScores,
    analysisSource: "youtube-api"
  };
}
