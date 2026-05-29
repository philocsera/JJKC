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
