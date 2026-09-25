import type { Metadata } from "next";
import { blockingProblems, checkEnv } from "@/lib/env-check";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finish setup", robots: { index: false } };

/** Shown instead of the dashboard while .env.local is incomplete. Names only, never values. */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const problems = checkEnv();
  const blocking = blockingProblems();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Finish setting up Botly</h1>
      {reason === "unreachable" && !blocking.length ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Supabase didn&apos;t answer. Check NEXT_PUBLIC_SUPABASE_URL, that the project isn&apos;t paused, and your internet connection.
        </p>
      ) : null}
      {problems.length ? (
        <>
          <p className="mt-2 text-slate-600">Fix these in <code className="rounded bg-slate-100 px-1">.env.local</code>, then stop and restart <code className="rounded bg-slate-100 px-1">npm run dev</code>.</p>
          <ul className="mt-5 space-y-3">
            {problems.map((p) => (
              <li key={p.name + p.problem} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="font-mono text-sm font-semibold">{p.name}</div>
                <div className={`text-sm ${p.name === "RESEND_API_KEY" ? "text-amber-700" : "text-red-700"}`}>{p.problem}</div>
                <div className="mt-1 text-sm text-slate-600">{p.fix}</div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-slate-600">Settings look right. Run <code className="rounded bg-slate-100 px-1">npm run check</code> to test the connections, or go to <a className="underline" href="/app">the dashboard</a>.</p>
      )}
      <p className="mt-6 text-sm text-slate-500">Tip: <code className="rounded bg-slate-100 px-1">npm run check</code> also verifies the database migrations, row-level security, and your Anthropic and Resend keys.</p>
    </main>
  );
}
