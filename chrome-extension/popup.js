const SITE_URL = "https://jjkc-algo-blush.vercel.app";

const userIdInput = document.getElementById("userIdInput");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const profileBox = document.getElementById("profile");
const dashboardBtn = document.getElementById("dashboardBtn");
const compareBtn = document.getElementById("compareBtn");

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
  chrome.tabs.create({
    url: `${SITE_URL}/dashboard`
  });
});

compareBtn.addEventListener("click", () => {
  chrome.tabs.create({
    url: `${SITE_URL}/compare`
  });
});

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

    const res = await fetch(`${SITE_URL}/api/profile/${userId}`);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    const owner = data.owner ?? {};
    const profile = data.profile ?? {};

    const categories = profile.categories ?? {};
    const topCategories = Object.entries(categories)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5);

    const topChannels = profile.topChannels ?? [];

    profileBox.innerHTML = `
      <strong>${owner.name ?? "사용자"}</strong>
      <p class="muted">${profile.summaryText ?? "알고리즘 요약이 없습니다."}</p>

      <div style="margin-top:10px;">
        <strong>Top Categories</strong>
        <ul>
          ${
            topCategories.length
              ? topCategories
                  .map(([name, value]) => `<li>${name}: ${Math.round(Number(value))}%</li>`)
                  .join("")
              : "<li>카테고리 정보 없음</li>"
          }
        </ul>
      </div>

      <div style="margin-top:10px;">
        <strong>Top Channels</strong>
        <ul>
          ${
            topChannels.length
              ? topChannels
                  .slice(0, 5)
                  .map((ch) => `<li>${ch.name ?? ch.title ?? "채널"}</li>`)
                  .join("")
              : "<li>채널 정보 없음</li>"
          }
        </ul>
      </div>
    `;
  } catch (error) {
    profileBox.innerHTML = `
      <span class="error">프로필을 불러오지 못했습니다.</span>
      <p class="muted">사용자 ID가 맞는지, 사이트가 배포되었는지 확인하세요.</p>
    `;
  }
}

loadProfile();
