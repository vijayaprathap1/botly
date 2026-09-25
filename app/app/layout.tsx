export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { featureProblems } from "@/lib/env-check";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 print:hidden border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/app" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">B</span>
            Botly
            {session.isAdmin ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">admin</span> : null}
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden max-w-[16rem] truncate text-slate-600 sm:inline">{session.email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      {session.isAdmin && featureProblems().length ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-6xl px-4 py-2 text-sm text-amber-900">
            {featureProblems().map((p) => (
              <p key={p.name}>
                <b>{p.name}</b> {p.problem}: {p.name === "ANTHROPIC_API_KEY" ? "the assistant can't reply" : "lead emails won't be sent"}. {p.fix}. Restart the app after editing .env.local.
              </p>
            ))}
          </div>
        </div>
      ) : null}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
