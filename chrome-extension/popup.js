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
    "Entertainment": 0.45,
    "Comedy": 0.35,
    "People & Blogs": 0.25,
    "Science & Technology": 0.2
  },
  "Comedy": {
    "Comedy": 1,
    "Entertainment": 0.75,
    "People & Blogs": 0.45,
    "Gaming": 0.25
  },
  "Entertainment": {
    "Entertainment": 1,
    "Comedy": 0.7,
    "People & Blogs": 0.65,
    "Gaming": 0.35,
    "영화": 0.35,
    "애니메이션": 0.3
  },
  "요리·먹방": {
    "요리·먹방": 1,
    "생활·하우투": 0.55,
    "Entertainment": 0.35,
    "People & Blogs": 0.3
  },
  "뷰티·패션": {
    "뷰티·패션": 1,
    "생활·하우투": 0.5,
    "People & Blogs": 0.4,
    "Entertainment": 0.3
  },
  "생활·하우투": {
    "생활·하우투": 1,
    "Education": 0.6,
    "Science & Technology": 0.45,
    "요리·먹방": 0.5,
    "뷰티·패션": 0.45,
    "Autos & Vehicles": 0.35
  },
  "Science & Technology": {
    "Science & Technology": 1,
    "Education": 0.78,
    "생활·하우투": 0.48,
    "News & Politics": 0.28,
    "Gaming": 0.22,
    "Autos & Vehicles": 0.25
  },
  "Education": {
    "Education": 1,
    "Science & Technology": 0.78,
    "생활·하우투": 0.55,
    "News & Politics": 0.35,
    "People & Blogs": 0.25
  },
  "News & Politics": {
    "News & Politics": 1,
    "Education": 0.42,
    "People & Blogs": 0.25,
    "Nonprofits & Activism": 0.45
  },
  "Sports": {
    "Sports": 1,
    "Entertainment": 0.28,
    "People & Blogs": 0.22
  },
  "People & Blogs": {
    "People & Blogs": 1,
    "Entertainment": 0.65,
    "Comedy": 0.45,
    "Travel & Events": 0.45,
    "생활·하우투": 0.35,
    "요리·먹방": 0.25
  },
  "Travel & Events": {
    "Travel & Events": 1,
    "People & Blogs": 0.5,
    "Entertainment": 0.3
  },
  "영화": {
    "영화": 1,
    "Entertainment": 0.55,
    "애니메이션": 0.35,
    "Comedy": 0.2
  },
  "애니메이션": {
    "애니메이션": 1,
    "Entertainment": 0.45,
    "영화": 0.35,
    "Gaming": 0.25
  },
  "Autos & Vehicles": {
    "Autos & Vehicles": 1,
    "생활·하우투": 0.35,
    "Science & Technology": 0.25,
    "Sports": 0.2
  },
  "Pets & Animals": {
    "Pets & Animals": 1,
    "People & Blogs": 0.35,
    "Entertainment": 0.25
  },
  "Nonprofits & Activism": {
    "Nonprofits & Activism": 1,
    "News & Politics": 0.45,
    "Education": 0.25,
    "People & Blogs": 0.2
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

// 키워드 보정.
// 내 요약, 상위 채널명, 내 상위 카테고리 라벨과 영상 키워드가 맞으면 점수를 올린다.
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
  const videoWords = [
    ...(video.keywords || []),
    video.title || "",
    video.channelName || ""
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  const uniqueVideoWords = [...new Set(videoWords)].slice(0, 30);

  if (!profileText || uniqueVideoWords.length === 0) return 0;

  let hit = 0;

  uniqueVideoWords.forEach((word) => {
    if (profileText.includes(word)) hit += 1;
  });

  return Math.min(1, hit / 5);
}

// 점수 스케일 보정.
// raw score를 그대로 퍼센트로 보여주면 너무 낮게 보이므로 sqrt 스케일을 적용한다.
function scaleSimilarity(rawScore) {
  const clamped = Math.max(0, Math.min(1, rawScore));
  return Math.round(Math.sqrt(clamped) * 100);
}

function calculateHybridSimilarity(profile, myVector, videoVector, video) {
  const cosine = cosineSimilarity(myVector, videoVector);
  const affinity = affinitySimilarity(myVector, videoVector);
  const keyword = keywordSimilarity(profile, myVector, video);

  const raw =
    cosine * 0.45 +
    affinity * 0.40 +
    keyword * 0.15;

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
    return `영상의 주요 성향(${label(videoTop)})이 내 핵심 알고리즘(${label(myTop)})과 매우 가깝습니다.`;
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

    const video = response.data;
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

    youtubeAnalysis.innerHTML = `
      <div class="section-title">현재 영상</div>
      <div class="title">${safeText(video.title, "영상 제목 없음")}</div>
      <p class="muted">채널: ${safeText(video.channelName, "채널명 없음")}</p>

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
          <div>키워드 보정</div><div>${hybrid.keywordScore}%</div>
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
    `;
  } catch {
    youtubeAnalysis.innerHTML = `
      <span class="error">현재 영상 정보를 읽지 못했습니다.</span>
      <p class="muted">유튜브 영상 페이지를 새로고침한 뒤 다시 시도하세요.</p>
    `;
  }
}

loadProfile();

// 익명 유저 피드백 제출 기능
const reviewRating = document.getElementById("reviewRating");
const reviewText = document.getElementById("reviewText");
const submitReviewBtn = document.getElementById("submitReviewBtn");
const reviewStatus = document.getElementById("reviewStatus");

submitReviewBtn?.addEventListener("click", async () => {
  if (!reviewRating || !reviewText || !reviewStatus) {
    return;
  }

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
