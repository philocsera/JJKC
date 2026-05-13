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
      checks: ["state"], // Add this line to bypass some strict OIDC checks that cause errors with Google
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
      // Pass user ID to the session so we can use it in the app
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    // This event is triggered when an account is linked to a user.
    // We can use this to copy the tokens to the User model if we want,
    // but the adapter already saves them in the Account table.
    async linkAccount({ user, account }) {
      if (account.provider === "google") {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            expiresAt: account.expires_at,
          },
        });
      }
    },
  },
  pages: {
    signIn: "/", // Redirect to home for login
  },
});

/**
 * Replaces the stub getCurrentUser with real NextAuth session check.
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user || null;
}
