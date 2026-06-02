const SITE_URL = "https://jjkc-algo-blush.vercel.app";

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

const CATEGORY_LABELS_KO = {
  "Gaming": "게임",
  "Comedy": "코미디",
  "Entertainment": "예능·엔터",
  "요리·먹방": "요리·먹방",
  "뷰티·패션": "뷰티·패션",
  "생활·하우투": "생활·하우투",
  "Science & Technology": "과학·기술",
  "Education": "교육",
  "News & Politics": "뉴스·정치",
  "Sports": "스포츠",
  "People & Blogs": "인물·브이로그",
  "Travel & Events": "여행·이벤트",
  "영화": "영화",
  "애니메이션": "애니메이션",
  "Autos & Vehicles": "자동차",
  "Pets & Animals": "동물·펫",
  "Nonprofits & Activism": "비영리·종교"
};

// 카테고리 간 관련도 보정표.
// 예: Science & Technology와 Education은 완전히 다른 취향으로 보지 않고 관련 취향으로 계산한다.
const CATEGORY_AFFINITY = {
  "Gaming": {
    "Gaming": 1,
    "Entertainment": 0.5,
    "Comedy": 0.35,
    "People & Blogs": 0.3,
    "Science & Technology": 0.25
  },
  "Comedy": {
    "Comedy": 1,
    "Entertainment": 0.8,
    "People & Blogs": 0.5,
    "Gaming": 0.3
  },
  "Entertainment": {
    "Entertainment": 1,
    "Comedy": 0.75,
    "People & Blogs": 0.7,
    "Gaming": 0.4,
    "영화": 0.4,
    "애니메이션": 0.35
  },
  "요리·먹방": {
    "요리·먹방": 1,
    "생활·하우투": 0.6,
    "Entertainment": 0.4,
    "People & Blogs": 0.35
  },
  "뷰티·패션": {
    "뷰티·패션": 1,
    "생활·하우투": 0.55,
    "People & Blogs": 0.45,
    "Entertainment": 0.35
  },
  "생활·하우투": {
    "생활·하우투": 1,
    "Education": 0.65,
    "Science & Technology": 0.5,
    "요리·먹방": 0.55,
    "뷰티·패션": 0.5,
    "Autos & Vehicles": 0.38
  },
  "Science & Technology": {
    "Science & Technology": 1,
    "Education": 0.82,
    "생활·하우투": 0.52,
    "News & Politics": 0.3,
    "Gaming": 0.28,
    "Autos & Vehicles": 0.3
  },
  "Education": {
    "Education": 1,
    "Science & Technology": 0.82,
    "생활·하우투": 0.6,
    "News & Politics": 0.4,
    "People & Blogs": 0.3
  },
  "News & Politics": {
    "News & Politics": 1,
    "Education": 0.48,
    "People & Blogs": 0.3,
    "Nonprofits & Activism": 0.5
  },
  "Sports": {
    "Sports": 1,
    "Entertainment": 0.32,
    "People & Blogs": 0.25
  },
  "People & Blogs": {
    "People & Blogs": 1,
    "Entertainment": 0.7,
    "Comedy": 0.5,
    "Travel & Events": 0.5,
    "생활·하우투": 0.4,
    "요리·먹방": 0.3
  },
  "Travel & Events": {
    "Travel & Events": 1,
    "People & Blogs": 0.55,
    "Entertainment": 0.35
  },
  "영화": {
    "영화": 1,
    "Entertainment": 0.6,
    "애니메이션": 0.4,
    "Comedy": 0.25
  },
  "애니메이션": {
    "애니메이션": 1,
    "Entertainment": 0.5,
    "영화": 0.4,
    "Gaming": 0.3
  },
  "Autos & Vehicles": {
    "Autos & Vehicles": 1,
    "생활·하우투": 0.4,
    "Science & Technology": 0.3,
    "Sports": 0.22
  },
  "Pets & Animals": {
    "Pets & Animals": 1,
    "People & Blogs": 0.4,
    "Entertainment": 0.3
  },
  "Nonprofits & Activism": {
    "Nonprofits & Activism": 1,
    "News & Politics": 0.5,
    "Education": 0.3,
    "People & Blogs": 0.25
  }
};

const userIdInput = document.getElementById("userIdInput");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const profileBox = document.getElementById("profile");
const dashboardBtn = document.getElementById("dashboardBtn");
const compareBtn = document.getElementById("compareBtn");

const profileTab = document.getElementById("profileTab");
const youtubeTab = document.getElementById("youtubeTab");
const profileSection = document.getElementById("profileSection");
const youtubeSection = document.getElementById("youtubeSection");
const youtubeAnalysis = document.getElementById("youtubeAnalysis");
const analyzeYoutubeBtn = document.getElementById("analyzeYoutubeBtn");



const reviewRating = document.getElementById("reviewRating");
const reviewText = document.getElementById("reviewText");
const submitReviewBtn = document.getElementById("submitReviewBtn");
const reviewStatus = document.getElementById("reviewStatus");

profileTab.addEventListener("click", () => {
  profileTab.classList.add("active");
  youtubeTab.classList.remove("active");
  profileSection.style.display = "block";
  youtubeSection.style.display = "none";
});

youtubeTab.addEventListener("click", async () => {
  youtubeTab.classList.add("active");
  profileTab.classList.remove("active");
  youtubeSection.style.display = "block";
  profileSection.style.display = "none";
  await analyzeCurrentYoutubePage();
});

saveBtn.addEventListener("click", async () => {
  const userId = userIdInput.value.trim();

  if (!userId) {
    profileBox.innerHTML = `<span class="error">사용자 ID를 입력하세요.</span>`;
    return;
  }

  await chrome.storage.local.set({ jjkcUserId: userId });
  await loadProfile();
});

clearBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove("jjkcUserId");
  userIdInput.value = "";
  profileBox.innerHTML = "연결이 해제되었습니다.";
});

dashboardBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: `${SITE_URL}/dashboard` });
});

compareBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: `${SITE_URL}/compare` });
});

analyzeYoutubeBtn.addEventListener("click", analyzeCurrentYoutubePage);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

submitReviewBtn?.addEventListener("click", async () => {
  if (!reviewRating || !reviewText || !reviewStatus) return;

  const rating = Number(reviewRating.value);
  const text = String(reviewText.value ?? "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    reviewStatus.textContent = "별점을 선택해주세요.";
    return;
  }

  if (!text) {
    reviewStatus.textContent = "리뷰 내용을 입력해주세요.";
    return;
  }

  if (text.length > 500) {
    reviewStatus.textContent = "리뷰는 500자 이하로 입력해주세요.";
    return;
  }

  try {
    reviewStatus.textContent = "익명 리뷰를 저장하는 중...";

    const res = await fetch(`${SITE_URL}/api/extension/reviews`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rating,
        reviewText: text,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "리뷰 저장 실패");
    }

    reviewText.value = "";
    reviewStatus.textContent = "익명 리뷰가 저장되었습니다.";
  } catch {
    reviewStatus.textContent =
      "리뷰 저장 중 오류가 발생했습니다. 사이트 API 배포 상태를 확인하세요.";
  }
});


function getJsonTextFromOpenAIResponse(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text;
  }

  const parts = data?.output
    ?.flatMap((item) => item?.content || [])
    ?.map((content) => content?.text)
    ?.filter(Boolean);

  return parts?.join("\n") || "";
}

function normalizeLLMCategoryScores(scores) {
  const vector = emptyVector();
  const input = scores || {};

  Object.entries(input).forEach(([rawName, rawValue]) => {
    const category = normalizeJjkcCategory(rawName);
    const value = Number(rawValue);
    if (!category || !Number.isFinite(value) || value <= 0) return;
    vector[category] = (vector[category] || 0) + value;
  });

  return normalizeVector(vector);
}

function buildLLMPrompt(video) {
  return [
    "You are a strict YouTube video classification engine for the JJKC algorithm viewer.",
    "Classify the current video into exactly the 17 JJKC categories below.",
    "Return JSON only. Do not include markdown.",
    "",
    "JJKC categories:",
    JJKC_CATEGORIES.join(", "),
    "",
    "Rules:",
    "- Infer tags from the title, channel name, description snippet, hashtags, and metadata keywords.",
    "- Use categoryScores as percentages summing to 100.",
    "- Give 2 to 4 dominant categories when appropriate.",
    "- Do not invent unrelated categories.",
    "- keywords should be concise inferred tags, not sentences.",
    "- confidence must be 0 to 100.",
    "",
    "Output JSON shape:",
    "{",
    '  "categoryScores": {"Gaming": 0, "...": 0},',
    '  "keywords": ["tag1", "tag2"],',
    '  "hashtags": ["tag1"],',
    '  "summary": "short Korean explanation",',
    '  "confidence": 0',
    "}",
    "",
    "Video data:",
    JSON.stringify({
      title: video.title || "",
      channelName: video.channelName || "",
      descriptionSnippet: video.descriptionSnippet || "",
      hashtags: video.hashtags || [],
      metadataKeywords: video.metadataKeywords || [],
      domKeywords: video.keywords || [],
      officialCategory: video.officialCategory || ""
    }, null, 2)
  ].join("\n");
}

async function analyzeVideoWithLLM(domVideo) {
  const apiKey = window.JJKC_OPENAI_CONFIG?.OPENAI_API_KEY;
  const model = window.JJKC_OPENAI_CONFIG?.OPENAI_MODEL || "gpt-5.4";

  if (!apiKey || apiKey === "PASTE_YOUR_OPENAI_API_KEY_HERE") {
    console.warn("OpenAI API key is not configured in config.js");
    return null;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: buildLLMPrompt(domVideo),
        text: {
          format: {
            type: "json_schema",
            name: "jjkc_video_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["categoryScores", "keywords", "hashtags", "summary", "confidence"],
              properties: {
                categoryScores: {
                  type: "object",
                  additionalProperties: false,
                  required: JJKC_CATEGORIES,
                  properties: Object.fromEntries(
                    JJKC_CATEGORIES.map((category) => [
                      category,
                      { type: "number", minimum: 0, maximum: 100 }
                    ])
                  )
                },
                keywords: {
                  type: "array",
                  maxItems: 20,
                  items: { type: "string" }
                },
                hashtags: {
                  type: "array",
                  maxItems: 15,
                  items: { type: "string" }
                },
                summary: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 100 }
              }
            }
          }
        }
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      console.warn("OpenAI analysis failed:", data);
      return null;
    }

    const jsonText = getJsonTextFromOpenAIResponse(data);
    const parsed = JSON.parse(jsonText);

    const categoryScores = normalizeLLMCategoryScores(parsed.categoryScores);

    return {
      ...domVideo,
      categoryScores,
      keywords: [...new Set([...(parsed.keywords || []), ...(domVideo.keywords || [])])].slice(0, 25),
      hashtags: [...new Set([...(parsed.hashtags || []), ...(domVideo.hashtags || [])])].slice(0, 15),
      llmSummary: parsed.summary || "",
      confidence: Math.round(Number(parsed.confidence || 0)),
      analysisSource: "openai-llm"
    };
  } catch (error) {
    console.warn("OpenAI LLM analysis error:", error);
    return null;
  }
}







function safeText(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function label(category) {
  return CATEGORY_LABELS_KO[category] || category || "-";
}

function normalizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n)}%`;
}

function normalizeJjkcCategory(name) {
  const raw = String(name || "").trim();
  const key = raw.toLowerCase();

  const exact = JJKC_CATEGORIES.find((cat) => cat.toLowerCase() === key);
  if (exact) return exact;

  const labelMatch = Object.entries(CATEGORY_LABELS_KO).find(([, ko]) => ko === raw);
  if (labelMatch) return labelMatch[0];

  if (key.includes("game") || key.includes("게임")) return "Gaming";
  if (key.includes("comedy") || key.includes("코미디") || key.includes("개그")) return "Comedy";
  if (key.includes("entertain") || key.includes("예능") || key.includes("엔터")) return "Entertainment";
  if (key.includes("food") || key.includes("cook") || key.includes("먹방") || key.includes("요리")) return "요리·먹방";
  if (key.includes("beauty") || key.includes("fashion") || key.includes("뷰티") || key.includes("패션")) return "뷰티·패션";
  if (key.includes("howto") || key.includes("how-to") || key.includes("하우투") || key.includes("생활") || key.includes("style")) return "생활·하우투";
  if (key.includes("science") || key.includes("technology") || key.includes("tech") || key.includes("과학") || key.includes("기술") || key.includes("ai")) return "Science & Technology";
  if (key.includes("education") || key.includes("study") || key.includes("교육") || key.includes("공부") || key.includes("강의")) return "Education";
  if (key.includes("news") || key.includes("politic") || key.includes("뉴스") || key.includes("정치")) return "News & Politics";
  if (key.includes("sports") || key.includes("스포츠") || key.includes("운동")) return "Sports";
  if (key.includes("people") || key.includes("blog") || key.includes("vlog") || key.includes("인물") || key.includes("브이로그")) return "People & Blogs";
  if (key.includes("travel") || key.includes("events") || key.includes("여행") || key.includes("이벤트")) return "Travel & Events";
  if (key.includes("film") || key.includes("movie") || key.includes("영화")) return "영화";
  if (key.includes("animation") || key.includes("anime") || key.includes("애니")) return "애니메이션";
  if (key.includes("auto") || key.includes("vehicle") || key.includes("car") || key.includes("자동차")) return "Autos & Vehicles";
  if (key.includes("pet") || key.includes("animal") || key.includes("동물") || key.includes("펫")) return "Pets & Animals";
  if (key.includes("nonprofit") || key.includes("activism") || key.includes("비영리") || key.includes("종교")) return "Nonprofits & Activism";

  return null;
}

function emptyVector() {
  const vector = {};
  JJKC_CATEGORIES.forEach((cat) => {
    vector[cat] = 0;
  });
  return vector;
}

function normalizeVector(vector) {
  const total = Object.values(vector).reduce((sum, value) => sum + Number(value || 0), 0);
  const normalized = emptyVector();

  if (total <= 0) return normalized;

  JJKC_CATEGORIES.forEach((cat) => {
    normalized[cat] = (Number(vector[cat] || 0) / total) * 100;
  });

  return normalized;
}

function getMyCategoryVector(categories) {
  const vector = emptyVector();

  Object.entries(categories || {}).forEach(([rawName, rawValue]) => {
    const category = normalizeJjkcCategory(rawName);
    const value = Number(rawValue);

    if (!category || !Number.isFinite(value)) return;
    vector[category] = (vector[category] || 0) + value;
  });

  return normalizeVector(vector);
}

function getVideoCategoryVector(video) {
  const vector = emptyVector();
  const incoming = video.categoryScores || {};

  Object.entries(incoming).forEach(([rawName, rawValue]) => {
    const category = normalizeJjkcCategory(rawName);
    const value = Number(rawValue);

    if (!category || !Number.isFinite(value)) return;
    vector[category] = (vector[category] || 0) + value;
  });

  const normalized = normalizeVector(vector);
  const total = Object.values(normalized).reduce((sum, value) => sum + Number(value || 0), 0);

  if (total <= 0) {
    return {
      ...emptyVector(),
      "Entertainment": 30,
      "People & Blogs": 30,
      "생활·하우투": 20,
      "Education": 20
    };
  }

  return normalized;
}

// 일반 cosine similarity
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  JJKC_CATEGORIES.forEach((cat) => {
    const av = Number(a[cat] || 0);
    const bv = Number(b[cat] || 0);

    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  });

  if (normA <= 0 || normB <= 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 카테고리 관련도 보정 유사도.
// 내 카테고리와 영상 카테고리가 정확히 같지 않아도 관련도가 있으면 점수를 부여한다.
function affinitySimilarity(myVector, videoVector) {
  let weighted = 0;
  let totalVideoWeight = 0;

  JJKC_CATEGORIES.forEach((videoCat) => {
    const videoValue = Number(videoVector[videoCat] || 0);
    if (videoValue <= 0) return;

    let bestAffinity = 0;

    JJKC_CATEGORIES.forEach((myCat) => {
      const myValue = Number(myVector[myCat] || 0);
      if (myValue <= 0) return;

      const relation =
        CATEGORY_AFFINITY[myCat]?.[videoCat] ??
        CATEGORY_AFFINITY[videoCat]?.[myCat] ??
        (myCat === videoCat ? 1 : 0);

      const normalizedMyValue = Math.min(1, myValue / 100);
      const candidate = relation * normalizedMyValue;
      bestAffinity = Math.max(bestAffinity, candidate);
    });

    weighted += videoValue * bestAffinity;
    totalVideoWeight += videoValue;
  });

  if (totalVideoWeight <= 0) return 0;

  return weighted / totalVideoWeight;
}

// 새 보정: 영상 상위 카테고리가 내 상위 카테고리 또는 관련 카테고리와 얼마나 겹치는지 별도로 측정한다.
function categoryInterestSimilarity(myVector, videoVector) {
  const myTop = topVectorEntries(myVector, 6);
  const videoTop = topVectorEntries(videoVector, 5);

  if (myTop.length === 0 || videoTop.length === 0) return 0;

  let score = 0;
  let totalVideo = 0;

  videoTop.forEach(([videoCat, videoValue]) => {
    let best = 0;

    myTop.forEach(([myCat, myValue]) => {
      const relation =
        CATEGORY_AFFINITY[myCat]?.[videoCat] ??
        CATEGORY_AFFINITY[videoCat]?.[myCat] ??
        (myCat === videoCat ? 1 : 0);

      // 내 관심 비중이 낮아도 상위 관심사 안에 있으면 반영되도록 완화
      const myWeight = 0.55 + Math.min(0.45, Number(myValue) / 100);
      best = Math.max(best, relation * myWeight);
    });

    score += Number(videoValue) * best;
    totalVideo += Number(videoValue);
  });

  if (totalVideo <= 0) return 0;
  return score / totalVideo;
}

// 개선된 키워드 보정.
// 직접 문자열 일치가 없더라도 영상 카테고리가 내 관심 카테고리와 관련 있으면 최소 점수를 부여한다.
function keywordSimilarity(profile, myVector, video) {
  const profileTextParts = [];

  if (profile?.summaryText) profileTextParts.push(profile.summaryText);
  if (profile?.summary) profileTextParts.push(profile.summary);

  if (Array.isArray(profile?.topChannels)) {
    profile.topChannels.slice(0, 8).forEach((ch) => {
      profileTextParts.push(ch.name || ch.title || "");
    });
  }

  topVectorEntries(myVector, 5).forEach(([category]) => {
    profileTextParts.push(category);
    profileTextParts.push(label(category));
  });

  const profileText = profileTextParts.join(" ").toLowerCase();

  const normalWords = [
    ...(video.keywords || []),
    video.title || "",
    video.channelName || ""
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  const hashtagWords = (video.hashtags || [])
    .join(" ")
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  const uniqueNormalWords = [...new Set(normalWords)].slice(0, 40);
  const uniqueHashtagWords = [...new Set(hashtagWords)].slice(0, 20);

  if (!profileText || (uniqueNormalWords.length === 0 && uniqueHashtagWords.length === 0)) {
    return 0;
  }

  let keywordHit = 0;
  let hashtagHit = 0;

  uniqueNormalWords.forEach((word) => {
    if (profileText.includes(word)) keywordHit += 1;
  });

  uniqueHashtagWords.forEach((word) => {
    if (profileText.includes(word)) hashtagHit += 1;
  });

  // 키워드가 많이 겹칠수록 완만하게 지수형으로 상승한다.
  // 해시태그는 영상 설명에 의도적으로 입력된 정보이므로 일반 키워드보다 1.5배 강하게 반영한다.
  const weightedHit = keywordHit + hashtagHit * 1.5;

  // 1 - exp(-x/3): 초반에는 빠르게 오르지만 1을 넘지 않아 과도한 폭주를 막는다.
  const directScore = 1 - Math.exp(-weightedHit / 3);

  return Math.min(1, directScore);
}

function scaleSimilarity(rawScore) {
  const clamped = Math.max(0, Math.min(1, rawScore));

  // 이전 방식보다 조금 더 강하게 보정하되,
  // 모든 영상이 과하게 높게 나오지 않도록 기본점수는 5점만 부여한다.
  return Math.round(5 + Math.sqrt(clamped) * 95);
}

function calculateHybridSimilarity(profile, myVector, videoVector, video) {
  const cosine = cosineSimilarity(myVector, videoVector);
  const affinity = affinitySimilarity(myVector, videoVector);
  const keyword = keywordSimilarity(profile, myVector, video);

  const raw =
    cosine * 0.40 +
    affinity * 0.40 +
    keyword * 0.20;

  return {
    raw,
    score: scaleSimilarity(raw),
    cosineScore: Math.round(cosine * 100),
    affinityScore: Math.round(affinity * 100),
    keywordScore: Math.round(keyword * 100)
  };
}

function getMatchLevel(score) {
  if (score >= 85) return "매우 높음";
  if (score >= 70) return "높음";
  if (score >= 50) return "보통";
  if (score >= 30) return "낮음";
  return "매우 낮음";
}

function buildMatchComment(score, videoTop, myTop) {
  if (score >= 85) {
    return `영상의 주요 성향(${label(videoTop)})이 내 핵심 알고리즘(${label(myTop)})와 매우 가깝습니다.`;
  }

  if (score >= 70) {
    return "영상 카테고리와 키워드가 내 알고리즘과 꽤 잘 맞습니다.";
  }

  if (score >= 50) {
    return "영상과 내 알고리즘이 일부 겹치는 편입니다.";
  }

  if (score >= 30) {
    return "영상은 내 알고리즘과 약하게 연결됩니다.";
  }

  return "영상은 내 주요 알고리즘 성향과는 거리가 있는 편입니다.";
}

function topVectorEntries(vector, limit = 5) {
  return Object.entries(vector)
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit);
}

async function fetchMyProfile() {
  const saved = await chrome.storage.local.get("jjkcUserId");
  const userId = saved.jjkcUserId;

  if (!userId) return { userId: null, data: null };

  const res = await fetch(`${SITE_URL}/api/profile/${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`Profile HTTP ${res.status}`);

  return { userId, data: await res.json() };
}

async function loadProfile() {
  const saved = await chrome.storage.local.get("jjkcUserId");
  const userId = saved.jjkcUserId;

  if (!userId) {
    profileBox.innerHTML = "아직 연결되지 않았습니다.";
    return;
  }

  userIdInput.value = userId;

  try {
    profileBox.innerHTML = "프로필을 불러오는 중...";
    const { data } = await fetchMyProfile();

    const owner = data.owner ?? {};
    const profile = data.profile ?? {};
    const categories = getMyCategoryVector(profile.categories ?? {});
    const topCategories = topVectorEntries(categories, 5);

    const topChannels = Array.isArray(profile.topChannels)
      ? profile.topChannels.slice(0, 5)
      : [];

    const summary = profile.summaryText || profile.summary || "알고리즘 요약이 아직 없습니다.";

    profileBox.innerHTML = `
      <div class="profile-name">${safeText(owner.name, "사용자")}</div>
      <p class="muted">${safeText(summary)}</p>

      <div class="section-title">Top Categories</div>
      <div>
        ${
          topCategories.length
            ? topCategories
                .map(([name, value]) => `<span class="pill">${safeText(label(name))} ${normalizePercent(value)}</span>`)
                .join("")
            : `<span class="muted">카테고리 정보 없음</span>`
        }
      </div>

      <div class="section-title">Top Channels</div>
      <ul>
        ${
          topChannels.length
            ? topChannels
                .map((ch) => `<li>${safeText(ch.name ?? ch.title, "채널")}</li>`)
                .join("")
            : "<li>채널 정보 없음</li>"
        }
      </ul>

      <p class="success">연결 완료</p>
    `;
  } catch {
    profileBox.innerHTML = `
      <span class="error">프로필을 불러오지 못했습니다.</span>
      <p class="muted">사용자 ID가 맞는지, 최신 코드가 배포되었는지 확인하세요.</p>
    `;
  }
}

async function analyzeCurrentYoutubePage() {
  youtubeAnalysis.innerHTML = "현재 YouTube 영상과 내 알고리즘을 비교하는 중...";
  await delay(250);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url?.includes("youtube.com")) {
    youtubeAnalysis.innerHTML = `
      <span class="error">YouTube 페이지에서만 사용할 수 있습니다.</span>
      <p class="muted">유튜브 영상 페이지를 연 뒤 다시 시도하세요.</p>
    `;
    return;
  }

  let profileData;

  try {
    const result = await fetchMyProfile();

    if (!result.userId) {
      youtubeAnalysis.innerHTML = `
        <span class="error">먼저 JJKC 프로필을 연결해야 합니다.</span>
        <p class="muted">내 프로필 탭에서 Dashboard 연동을 완료한 뒤 다시 시도하세요.</p>
      `;
      return;
    }

    profileData = result.data;
  } catch {
    youtubeAnalysis.innerHTML = `
      <span class="error">내 JJKC 프로필을 불러오지 못했습니다.</span>
      <p class="muted">사용자 ID와 사이트 배포 상태를 확인하세요.</p>
    `;
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "JJKC_ANALYZE_CURRENT_VIDEO"
    });

    if (!response?.ok) throw new Error(response?.error || "No response");

    const domVideo = response.data;
    const llmVideo = await analyzeVideoWithLLM(domVideo);
    const video = llmVideo || domVideo;
    const analysisSourceText = llmVideo
      ? "OpenAI LLM 기반 태그 추정"
      : "LLM 실패 또는 API 키 없음: DOM fallback 분석";

    const profile = profileData.profile ?? {};

    const myVector = getMyCategoryVector(profile.categories ?? {});
    const videoVector = getVideoCategoryVector(video);

    const hybrid = calculateHybridSimilarity(profile, myVector, videoVector, video);
    const score = hybrid.score;
    const level = getMatchLevel(score);

    const myTop = topVectorEntries(myVector, 1)[0]?.[0] || "People & Blogs";
    const videoTop = topVectorEntries(videoVector, 1)[0]?.[0] || "People & Blogs";
    const comment = buildMatchComment(score, videoTop, myTop);

    const myCategoryBars = topVectorEntries(myVector, 5)
      .map(([name, value]) => `
        <div>${safeText(label(name))} ${normalizePercent(value)}</div>
        <div class="mini-bar">
          <div class="mini-bar-fill" style="width:${Math.max(0, Math.min(100, Number(value)))}%"></div>
        </div>
      `)
      .join("");

    const videoCategoryBars = topVectorEntries(videoVector, 5)
      .map(([name, value]) => `
        <div>${safeText(label(name))} ${normalizePercent(value)}</div>
        <div class="mini-bar">
          <div class="mini-bar-fill" style="width:${Math.max(0, Math.min(100, Number(value)))}%"></div>
        </div>
      `)
      .join("");

    const keywordHtml = (video.keywords || []).length
      ? video.keywords.map((k) => `<span class="pill gray">${safeText(k)}</span>`).join("")
      : `<span class="muted">추출된 키워드 없음</span>`;

    const hashtagHtml = (video.hashtags || []).length
      ? video.hashtags.map((k) => `<span class="pill green">#${safeText(k)}</span>`).join("")
      : `<span class="muted">감지된 설명 태그 없음</span>`;

    youtubeAnalysis.innerHTML = `
      <div class="section-title">현재 영상</div>
      <div class="title">${safeText(video.title, "영상 제목 없음")}</div>
      <p class="muted">채널: ${safeText(video.channelName, "채널명 없음")}</p>
      <p class="muted">분석 출처: ${safeText(analysisSourceText)}</p>
      <p class="muted">분류 신뢰도: ${safeText(video.confidence ?? "-")}%</p>
      ${video.llmSummary ? `<p class="muted">LLM 요약: ${safeText(video.llmSummary)}</p>` : ""}

      <div class="score-wrap">
        <div class="score-head">
          <div>
            <div class="section-title">내 알고리즘과 영상 유사도</div>
            <div class="muted">비교 방식: 카테고리 관련도 + 키워드 보정 + 스케일 보정</div>
          </div>
          <div class="score-number">${score}%</div>
        </div>
        <div class="bar">
          <div class="bar-fill" style="width:${Math.max(0, Math.min(100, score))}%"></div>
        </div>
        <p class="muted">유사 수준: ${safeText(level)}</p>
        <p class="muted">${safeText(comment)}</p>

        <div class="score-breakdown">
          <div>기본 카테고리 유사도</div><div>${hybrid.cosineScore}%</div>
          <div>관련 카테고리 보정</div><div>${hybrid.affinityScore}%</div>
          <div>LLM 키워드 보정</div><div>${hybrid.keywordScore}%</div>
        </div>
      </div>

      <div class="two-col">
        <div>
          <div class="section-title">영상 추정 카테고리</div>
          <div class="match-grid">
            ${videoCategoryBars || `<div class="muted">카테고리 정보 없음</div>`}
          </div>
        </div>
        <div>
          <div class="section-title">내 주요 카테고리</div>
          <div class="match-grid">
            ${myCategoryBars || `<div class="muted">카테고리 정보 없음</div>`}
          </div>
        </div>
      </div>

      <div class="section-title">영상/채널 키워드</div>
      <div>${keywordHtml}</div>

      <div class="section-title">영상 설명 태그</div>
      <div>${hashtagHtml}</div>
    `;
  } catch {
    youtubeAnalysis.innerHTML = `
      <span class="error">현재 영상 정보를 읽지 못했습니다.</span>
      <p class="muted">새로고침하지 말고 YouTube 화면이 바뀐 뒤 다시 버튼을 눌러보세요. 현재 화면을 다시 읽도록 수정되었습니다.</p>
    `;
  }
}

loadProfile();
