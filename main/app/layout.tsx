import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans_KR, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";

// 디스플레이: 표현력 있는 그로테스크 / 본문: 한글까지 일관된 IBM Plex / 라벨·수치: 모노
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "800"],
  display: "swap",
});
const sans = IBM_Plex_Sans_KR({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "JJKC — 한국 유튜브 알고리즘",
  description:
    "구독자 5만명 이상의 한국 유튜브 채널 중에서 내 알고리즘을 분석하고, 채널을 추천받고, 다른 사람들의 알고리즘을 구경하세요.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`dark ${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="grain min-h-screen font-sans antialiased">
        <SiteNav />
        <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-10 sm:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
