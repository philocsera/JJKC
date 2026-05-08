// Cookie-based stub auth.
//
// Stands in for NextAuth + Google OAuth. The landing page calls
// /api/auth/demo to set this cookie; everything else just reads it.
// When swapping in NextAuth, replace these helpers with `auth()` from
// next-auth/v5 — call sites won't change.

import { cookies } from "next/headers";
import { getUser, listUsers } from "./mock-data";
import type { User } from "./types";

export const DEMO_COOKIE = "demoUserId";

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = jar.get(DEMO_COOKIE)?.value;
  if (!id) return null;
  return getUser(id) ?? null;
}

export async function requireCurrentUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) {
    // The dashboard layout checks first and redirects, so reaching here
    // means an API route was hit without a session.
    throw new Error("not signed in");
  }
  return u;
}

export function listDemoUsers(): User[] {
  return listUsers();
}
