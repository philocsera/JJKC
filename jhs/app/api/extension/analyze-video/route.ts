import { NextResponse } from "next/server";
import { analyzeVideoForExtension } from "@/lib/extension-video-analyzer";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const videoId = String(body?.videoId ?? "").trim();

    if (!videoId) {
      return NextResponse.json(
        { ok: false, error: "videoId가 필요합니다." },
        { status: 400 }
      );
    }

    const video = await analyzeVideoForExtension(videoId);

    return NextResponse.json({
      ok: true,
      video
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "영상 분석 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status: 500 }
    );
  }
}
