// NextAuth v5 + Google OAuth + PrismaAdapter.
// plan.md Step 2: youtube.readonly scope, offline access, consent prompt.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      checks: ["state"],
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/youtube.readonly",
          ].join(" "),
          prompt: "consent",
          access_type: "offline",
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
    // signIn 은 매 로그인마다 발화 — returning user 의 access token 을
    // 새로 받아 User 테이블에 미러링한다. (linkAccount 는 1회성)
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            // refreshToken 은 access_type=offline + prompt=consent 일 때만
            // 반환되므로, 없는 경우 기존 값 유지.
            ...(account.refresh_token
              ? { refreshToken: account.refresh_token }
              : {}),
            accessToken: account.access_token,
            expiresAt: account.expires_at,
            googleId:
              (profile as { sub?: string } | undefined)?.sub ?? undefined,
          },
        }).catch(() => {
          // 신규 유저의 경우 User row 가 아직 없을 수도 있음 — linkAccount
          // 이벤트가 곧 같은 작업을 수행한다.
        });
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
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            expiresAt: account.expires_at,
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
