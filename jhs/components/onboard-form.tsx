"use client";

// Phase 3 onboard 3단계 폼. YouTube Data API 없이 자기선언으로 알고리즘 프로필을 만든다.
//   1) 큰 카테고리 선택 → 2) 그 카테고리의 세부 관심사 선택 →
//   3) 세부 관심사에 해당하는 채널을 보여주고 관심 채널 선택.
// 제출 시 /api/onboard POST → AlgoProfile 생성 → 대시보드로 이동.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CATEGORY_NAMESPACE, CATEGORY_LABELS_KO } from "@/lib/categories";

type ChannelLite = {
  id: string;
  title: string;
  handle: string | null;
  thumbnail: string;
  subscriberCount: number;
};

export type OnboardInitial = {
  channels: ChannelLite[];
  categories: string[];
  subCategories: string[]; // "Parent/Sub" 키
};


function fmtSubs(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}천만`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return n > 0 ? String(n) : "—";
}

const STEPS = ["관심 카테고리", "세부 관심사", "채널 선택"];
const MAX_CHANNELS = 10; // 프로필은 대표 채널 상위 10개만 사용 → 그 이상은 선택 차단.

export function OnboardForm({
  initial,
  subLabels,
  submitUrl = "/api/onboard",
  extraBody,
  extraValidate,
  onSuccess,
  submitLabel,
}: {
  initial: OnboardInitial;
  subLabels: Record<string, string[]>;
  // 재사용용(예: 디버그 유저 생성) — 기본값은 일반 온보딩 동작.
  submitUrl?: string;
  extraBody?: Record<string, unknown>;
  extraValidate?: () => string | null; // 에러 메시지 반환 시 제출 중단
  onSuccess?: (data: unknown) => void; // 미지정 시 /dashboard 로 이동
  submitLabel?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [selected, setSelected] = useState<ChannelLite[]>(initial.channels);
  const [checked, setChecked] = useState<string[]>(initial.categories);
  const [checkedSubs, setCheckedSubs] = useState<string[]>(initial.subCategories);

  const [channels, setChannels] = useState<ChannelLite[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 선택한 세부 관심사(+미선택 카테고리 폴백)의 채널을 offset 부터 한 페이지 가져온다.
  async function fetchChannels(offset: number, signal?: AbortSignal) {
    const qs = new URLSearchParams({
      subCategories: checkedSubs.join(","),
      categories: checked.join(","),
      offset: String(offset),
    });
    const res = await fetch(`/api/channels/by-subcategory?${qs}`, { signal });
    return (await res.json()) as { channels?: ChannelLite[]; hasMore?: boolean };
  }

  // ── 채널 그리드: 3단계 진입/필터 변경 시 첫 페이지부터 다시 로드 ──
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (step !== 2 || (checked.length === 0 && checkedSubs.length === 0)) {
      setChannels([]);
      setHasMore(false);
      return;
    }
    setLoadingChannels(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    (async () => {
      try {
        const data = await fetchChannels(0, ac.signal);
        setChannels((data.channels ?? []) as ChannelLite[]);
        setHasMore(Boolean(data.hasMore));
      } catch {
        /* aborted or network — ignore */
      } finally {
        setLoadingChannels(false);
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, checkedSubs, checked]);

  // ── "채널 더보기": 현재 로드 수를 offset 으로 다음 페이지를 이어 붙인다 ──
  async function loadMoreChannels() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchChannels(channels.length);
      const more = (data.channels ?? []) as ChannelLite[];
      setChannels((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...more.filter((c) => !seen.has(c.id))];
      });
      setHasMore(Boolean(data.hasMore));
    } catch {
      /* network — ignore, 버튼은 유지 */
    } finally {
      setLoadingMore(false);
    }
  }

  const isSelected = (id: string) => selected.some((c) => c.id === id);

  function toggleChannel(c: ChannelLite) {
    if (selected.some((x) => x.id === c.id)) {
      setSelected((prev) => prev.filter((x) => x.id !== c.id));
      setError(null);
      return;
    }
    // 상한(10개) 도달 시 추가를 막고 안내 — 초과 선택으로 저장이 실패하지 않게.
    if (selected.length >= MAX_CHANNELS) {
      setError(`채널은 최대 ${MAX_CHANNELS}개까지 선택할 수 있어요. 먼저 일부를 해제해 주세요.`);
      return;
    }
    setSelected((prev) => [...prev, c]);
    setError(null);
  }

  function toggleCategory(name: string) {
    if (checked.includes(name)) {
      setChecked((p) => p.filter((x) => x !== name));
      // 카테고리 해제 시 그 카테고리의 세부 선택도 제거.
      setCheckedSubs((s) => s.filter((k) => !k.startsWith(`${name}/`)));
    } else {
      setChecked((p) => [...p, name]);
    }
  }

  function toggleSub(key: string) {
    setCheckedSubs((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  const canSubmit = selected.length >= 1 || checked.length >= 1;
  const hasSubOptions = checked.some((c) => (subLabels[c]?.length ?? 0) > 0);

  async function submit() {
    if (!canSubmit || submitting) return;
    // 호출부 추가 검증(예: 디버그의 이름 필수).
    if (extraValidate) {
      const msg = extraValidate();
      if (msg) {
        setError(msg);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...extraBody,
          channelIds: selected.map((c) => c.id),
          categories: checked,
          subCategories: checkedSubs,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "저장에 실패했습니다. 입력을 확인해 주세요.");
        setSubmitting(false);
        return;
      }
      if (onSuccess) {
        const data = await res.json().catch(() => ({}));
        onSuccess(data);
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* stepper */}
      <ol className="flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(i)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors ${
                i === step
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="font-semibold">{i + 1}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 ? <span className="h-px w-4 bg-border" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      {/* ── Step 1: 큰 카테고리 ── */}
      {step === 0 ? (
        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">관심 카테고리를 골라 주세요</h2>
            <p className="text-sm text-muted-foreground">
              다음 단계에서 카테고리별 세부 관심사를 고릅니다.{" "}
              <span className="text-foreground">{checked.length}개</span> 선택됨
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_NAMESPACE.map((name) => {
              const on = checked.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleCategory(name)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    on ? "border-accent bg-accent/10 text-foreground" : "hover:bg-muted"
                  }`}
                >
                  <span>{CATEGORY_LABELS_KO[name]}</span>
                  {on ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Step 2: 세부 관심사 ── */}
      {step === 1 ? (
        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">세부 관심사를 골라 주세요</h2>
            <p className="text-sm text-muted-foreground">
              고른 카테고리 안에서 더 좋아하는 주제를 고르면 그에 맞는 채널을 보여 드립니다. (건너뛰어도
              됩니다)
            </p>
          </div>

          {checked.length === 0 ? (
            <p className="text-sm text-muted-foreground">먼저 1단계에서 관심 카테고리를 골라 주세요.</p>
          ) : !hasSubOptions ? (
            <p className="text-sm text-muted-foreground">
              고른 카테고리에는 세부 관심사가 없습니다. 다음 단계로 넘어가 주세요.
            </p>
          ) : (
            <div className="space-y-5">
              {checked.map((cat) => {
                const subs = subLabels[cat] ?? [];
                if (subs.length === 0) return null;
                return (
                  <div key={cat} className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">
                      {CATEGORY_LABELS_KO[cat as keyof typeof CATEGORY_LABELS_KO]}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {subs.map((sub) => {
                        const key = `${cat}/${sub}`;
                        const on = checkedSubs.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleSub(key)}
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                              on
                                ? "border-accent bg-accent/10 text-foreground"
                                : "text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {sub}
                            {on ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Step 3: 채널 그리드 (세부 관심사 기반) ── */}
      {step === 2 ? (
        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">이 중에 관심 있는 채널이 있나요?</h2>
          </div>

          {/* 선택된 채널 chips */}
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selected.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChannel(c)}
                  className="flex items-center gap-1.5 rounded-full border bg-muted py-1 pl-1 pr-2 text-xs hover:bg-muted/70"
                >
                  {c.thumbnail ? (
                    <Image
                      src={c.thumbnail}
                      alt={c.title}
                      width={20}
                      height={20}
                      className="h-5 w-5 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="h-5 w-5 rounded-full bg-background" />
                  )}
                  <span className="max-w-[10rem] truncate">{c.title}</span>
                  <Check className="h-3 w-3 text-accent" />
                </button>
              ))}
            </div>
          ) : null}

          {checked.length === 0 && checkedSubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">먼저 카테고리와 세부 관심사를 골라 주세요.</p>
          ) : loadingChannels ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 채널을 불러오는 중…
            </div>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">표시할 채널이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {channels.map((c) => {
                const on = isSelected(c.id);
                return (
                  <div key={c.id} className="relative">
                    <button
                      type="button"
                      onClick={() => toggleChannel(c)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 pr-8 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        on ? "border-accent bg-accent/10" : "hover:bg-muted"
                      }`}
                    >
                      {c.thumbnail ? (
                        <Image
                          src={c.thumbnail}
                          alt={c.title}
                          width={36}
                          height={36}
                          className="h-9 w-9 rounded-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                          {c.title.slice(0, 1)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.title}</div>
                        <div className="text-xs text-muted-foreground">
                          구독자 {fmtSubs(c.subscriberCount)}
                        </div>
                      </div>
                      {on ? <Check className="h-4 w-4 shrink-0 text-accent" /> : null}
                    </button>
                    {/* 선택과 분리된 '채널 열기' — 클릭 시 유튜브 채널 페이지(새 탭) */}
                    <a
                      href={`https://www.youtube.com/channel/${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`${c.title} 채널 열기`}
                      className="absolute right-1.5 top-1.5 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {/* 채널 더보기 */}
          {!loadingChannels && channels.length > 0 && hasMore ? (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadMoreChannels}
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                채널 더보기
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 에러 */}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* 네비게이션 */}
      <Card className="flex items-center justify-between p-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          이전
        </Button>

        <div className="flex items-center gap-2">
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && checked.length === 0}
            >
              다음
            </Button>
          ) : null}
          <Button
            type="button"
            variant={step === STEPS.length - 1 ? "accent" : "outline"}
            size="sm"
            onClick={submit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {submitLabel ?? "알고리즘 만들기"}
          </Button>
        </div>
      </Card>

      {!canSubmit ? (
        <p className="text-center text-xs text-muted-foreground">
          채널이나 카테고리를 최소 한 개 이상 골라야 만들 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
