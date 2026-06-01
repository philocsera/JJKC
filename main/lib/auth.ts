// NextAuth v5 + Google OAuth + PrismaAdapter.
// 식별용 로그인만. YouTube Data API 의존을 걷어내고 RSS/oEmbed/정적 카탈로그로
// 전환했기 때문에 youtube.readonly scope, offline access, refresh token 모두
// 더 이상 필요 없다. User.accessToken/refreshToken/expiresAt 컬럼은 스키마에
// 남겨두되 새 로그인부터는 더 이상 채워지지 않는다.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    // 기본 로그인 — 가벼운 스코프(YouTube 권한 요청 안 함).
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      checks: ["state"],
      authorization: {
        params: {
          scope: ["openid", "email", "profile"].join(" "),
          response_type: "code",
        },
      },
    }),
    // 온보딩 "Google 연동" 전용 — youtube.readonly 로 구독 자동 분석.
    // 이미 로그인된 사용자가 같은 구글 계정으로 추가 연동하므로 email 링크 허용.
    Google({
      id: "google-youtube",
      name: "Google (YouTube)",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      checks: ["state"],
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: ["openid", "email", "profile", "https://www.googleapis.com/auth/youtube.readonly"].join(" "),
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as { id: string }).id = user.id;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId:
              (profile as { sub?: string } | undefined)?.sub ?? undefined,
          },
        }).catch(() => {});
      }
      return true;
    },
  },
  events: {
    async linkAccount({ user, account, profile }) {
      if (account.provider === "google") {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: (profile as { sub?: string } | undefined)?.sub,
          },
        });
      }
    },
  },
  pages: { signIn: "/" },
});

export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}
