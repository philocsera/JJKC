// 사용자 프로필 / Channel.categories / ChannelCluster.centroid 가 공유하는
// 카테고리 namespace. data/category-lexicon.ko.yaml 의 top-level 키와 1:1.
// "Food" 는 lexicon 에서 alias 로 Howto/People 에 분산되므로 채널 벡터에
// 절대 등장하지 않는다 → onboard 체크박스에서도 제외한다 (cosine 비교 정합성).

// ※ "Music" 은 프로젝트에서 제외됨 (음악 버티컬 미지원).
export const CATEGORY_NAMESPACE = [
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
  "Nonprofits & Activism",
] as const;

export type CategoryName = (typeof CATEGORY_NAMESPACE)[number];

export const CATEGORY_LABELS_KO: Record<CategoryName, string> = {
  Gaming: "게임",
  Comedy: "코미디",
  Entertainment: "예능·엔터",
  "요리·먹방": "요리·먹방",
  "뷰티·패션": "뷰티·패션",
  "생활·하우투": "생활·하우투",
  "Science & Technology": "과학·기술",
  Education: "교육",
  "News & Politics": "뉴스·정치",
  Sports: "스포츠",
  "People & Blogs": "인물·브이로그",
  "Travel & Events": "여행·이벤트",
  영화: "영화",
  애니메이션: "애니메이션",
  "Autos & Vehicles": "자동차",
  "Pets & Animals": "동물·펫",
  "Nonprofits & Activism": "비영리·종교",
};

const CATEGORY_SET = new Set<string>(CATEGORY_NAMESPACE);

export function isCategoryName(s: string): s is CategoryName {
  return CATEGORY_SET.has(s);
}

// 표시용 한글 라벨. namespace 키(영문 포함)를 항상 한글로 변환한다.
// 매핑에 없으면(데이터 잔재 등) 원본 유지.
export function categoryLabel(name: string): string {
  return (CATEGORY_LABELS_KO as Record<string, string>)[name] ?? name;
}

// 세부 카테고리 "Parent/Sub" → "부모한글 · Sub".
export function subCategoryLabel(key: string): string {
  const [parent, ...rest] = key.split("/");
  const sub = rest.join("/");
  const p = categoryLabel(parent);
  return sub ? `${p} · ${sub}` : p;
}

// 클러스터 라벨은 " · " 로 카테고리 이름들을 이은 문자열로 저장돼 있다
// (예: "Education · News & Politics"). 카테고리 이름 내부의 "·" 는 공백이 없어
// " · "(공백 포함) 기준으로 안전하게 분리해 각 조각을 한글화한다.
export function clusterLabel(label: string): string {
  return label
    .split(" · ")
    .map((part) => categoryLabel(part.trim()))
    .join(" · ");
}

// Category fingerprint 전용 병합 — 유사 카테고리를 한 축으로 합친다.
// (fingerprint 레이더에서만 적용; 다른 카테고리 표시에는 영향 없음.)
const FINGERPRINT_MERGES: { label: string; members: CategoryName[] }[] = [
  { label: "영화·애니메이션", members: ["영화", "애니메이션"] },
  { label: "예능·코미디", members: ["Entertainment", "Comedy"] },
  { label: "과학·교육", members: ["Science & Technology", "Education"] },
];
const MERGE_BY_MEMBER = new Map<string, { label: string; members: CategoryName[] }>();
for (const g of FINGERPRINT_MERGES) for (const m of g.members) MERGE_BY_MEMBER.set(m, g);

// Category fingerprint(레이더)용 고정 축. 모든 사용자가 동일한 최상위 카테고리
// 구성요소를 갖도록 전체 namespace 를 한글 라벨로 매핑하고(없으면 0), 위 병합
// 그룹은 한 축으로 합쳐(값은 합산) 첫 멤버 위치에 한 번만 노출한다.
export function fingerprintRows(
  categories: Record<string, number>,
): { category: string; a: number }[] {
  const rows: { category: string; a: number }[] = [];
  for (const name of CATEGORY_NAMESPACE) {
    const group = MERGE_BY_MEMBER.get(name);
    if (group) {
      // 그룹은 첫 멤버에서 한 번만 emit (합산), 나머지 멤버는 건너뜀.
      if (group.members[0] !== name) continue;
      rows.push({
        category: group.label,
        a: group.members.reduce((sum, m) => sum + (categories[m] ?? 0), 0),
      });
    } else {
      rows.push({ category: CATEGORY_LABELS_KO[name], a: categories[name] ?? 0 });
    }
  }
  return rows;
}
