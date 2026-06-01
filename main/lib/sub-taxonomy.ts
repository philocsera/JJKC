// 세부 카테고리 택소노미 로더 (서버 전용 — fs 사용).
//
// data/sub-taxonomy.ko.yaml 을 읽어 { [parent]: { [subLabel]: keywords[] } } 로 제공.
// 온보딩 UI(클라이언트)에는 키워드 없이 라벨 구조만 넘긴다 — 서버 컴포넌트가
// getSubLabels() 결과를 prop 으로 전달.

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { isCategoryName } from "./categories";

export type SubTaxonomy = Record<string, Record<string, string[]>>;

let cached: SubTaxonomy | null = null;
let versionCached: string | null = null;

export function loadSubTaxonomy(): SubTaxonomy {
  if (cached) return cached;
  const filePath = path.resolve(process.cwd(), "data/sub-taxonomy.ko.yaml");
  const doc = parseYaml(fs.readFileSync(filePath, "utf8")) as Record<string, any>;
  const out: SubTaxonomy = {};
  for (const [parent, subs] of Object.entries(doc)) {
    if (!isCategoryName(parent)) continue; // namespace(예: Music 제거) 밖이면 무시
    if (!subs || typeof subs !== "object") continue;
    const m: Record<string, string[]> = {};
    for (const [label, kws] of Object.entries(subs)) {
      if (Array.isArray(kws)) m[label] = (kws as any[]).map((k) => String(k).toLowerCase()).filter(Boolean);
    }
    if (Object.keys(m).length) out[parent] = m;
  }
  cached = out;
  return out;
}

// 저장/매칭 키: "Parent/Sub".
export function subKey(parent: string, sub: string): string {
  return `${parent}/${sub}`;
}

// 온보딩 UI 용: 부모별 세부 라벨 목록 (키워드 제외, 클라이언트 전달 안전).
export function getSubLabels(): Record<string, string[]> {
  const tax = loadSubTaxonomy();
  const out: Record<string, string[]> = {};
  for (const [parent, subs] of Object.entries(tax)) out[parent] = Object.keys(subs);
  return out;
}

// 유효한 세부 키 집합 (API 검증용).
export function validSubKeys(): Set<string> {
  const tax = loadSubTaxonomy();
  const s = new Set<string>();
  for (const [parent, subs] of Object.entries(tax)) for (const sub of Object.keys(subs)) s.add(subKey(parent, sub));
  return s;
}

// 택소노미 내용 해시 — 변경 시 추천 캐시 무효화에 사용.
export function subtaxVersion(): string {
  if (versionCached) return versionCached;
  const json = JSON.stringify(loadSubTaxonomy());
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  versionCached = "st" + (h >>> 0).toString(36);
  return versionCached;
}
