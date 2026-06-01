import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ADMIN_PASSWORD = "1111";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const rating = Number(body.rating);
    const reviewText = String(body.reviewText ?? "").trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false, error: "별점은 1~5 사이여야 합니다." },
        { status: 400 }
      );
    }

    if (!reviewText) {
      return NextResponse.json(
        { ok: false, error: "리뷰 내용을 입력해주세요." },
        { status: 400 }
      );
    }

    if (reviewText.length > 500) {
      return NextResponse.json(
        { ok: false, error: "리뷰는 500자 이하로 입력해주세요." },
        { status: 400 }
      );
    }

    await prisma.extensionReview.create({
      data: {
        rating,
        reviewText,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "리뷰 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const password = req.headers.get("x-admin-password");

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { ok: false, error: "관리자 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const reviews = await prisma.extensionReview.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      ok: true,
      reviews,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "리뷰 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
