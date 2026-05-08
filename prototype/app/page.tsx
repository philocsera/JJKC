import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/mock-data";
import { DemoSignIn } from "./demo-sign-in";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  const users = listUsers();

  return (
    <section className="space-y-12">
      <header className="space-y-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          See the world through someone else&rsquo;s YouTube algorithm.
        </h1>
        <p className="mx-auto max-w-2xl text-[hsl(var(--foreground))]/70">
          Share your category mix, top channels, and keyword fingerprint —
          then borrow a friend&rsquo;s feed for an afternoon. This is the
          mock-data prototype; pick any demo user below to start.
        </p>
      </header>

      <div className="rounded-2xl border bg-[hsl(var(--card))] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[hsl(var(--foreground))]/60">
          Sign in as a demo user
        </h2>
        <DemoSignIn users={users} />
        <p className="mt-4 text-xs text-[hsl(var(--foreground))]/60">
          No real Google sign-in is wired in this prototype. Selecting a
          demo user just sets a cookie. See README for swapping in NextAuth.
        </p>
      </div>
    </section>
  );
}
