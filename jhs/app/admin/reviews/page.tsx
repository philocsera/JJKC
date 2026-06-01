"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Review = {
  id: string;
  rating: number;
  reviewText: string;
  createdAt: string;
};

function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export default function AdminReviewsPage() {
  const [password, setPassword] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadReviews(inputPassword: string) {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/extension/reviews", {
        method: "GET",
        headers: {
          "x-admin-password": inputPassword,
        },
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "리뷰 조회 실패");
      }

      setReviews(data.reviews);
      setIsAuthed(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "리뷰 조회 중 오류가 발생했습니다."
      );
      setIsAuthed(false);
    } finally {
      setLoading(false);
    }
  }

  const total = reviews.length;
  const average =
    total > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / total
      : 0;

  if (!isAuthed) {
    return (
      <section className="mx-auto max-w-md space-y-6">
        <header>
          <p className="label-mono">Admin</p>
          <h1 className="text-2xl font-bold">유저 피드백 관리</h1>
          <p className="text-sm text-muted-foreground">
            관리자 비밀번호를 입력하면 익명 리뷰를 확인할 수 있습니다.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">관리자 비밀번호</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadReviews(password);
              }}
              placeholder="비밀번호 입력"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
            />

            <button
              type="button"
              onClick={() => loadReviews(password)}
              disabled={loading}
              className="w-full rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "확인 중..." : "접속"}
            </button>

            {error ? (
              <p className="text-sm text-red-500">{error}</p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="label-mono">Admin</p>
          <h1 className="text-2xl font-bold">유저 피드백 관리</h1>
          <p className="text-sm text-muted-foreground">
            사용자가 익명으로 남긴 별점과 리뷰입니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadReviews(password)}
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          새로고침
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">평균 별점</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{average.toFixed(1)} / 5</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">총 리뷰 수</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{total}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {reviews.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              아직 등록된 리뷰가 없습니다.
            </CardContent>
          </Card>
        ) : (
          reviews.map((review) => (
            <Card key={review.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {stars(review.rating)}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {new Date(review.createdAt).toLocaleString("ko-KR")}
                </p>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {review.reviewText}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
