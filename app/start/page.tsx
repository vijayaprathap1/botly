import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { TRIAL } from "@/lib/plans";
import { StartForm } from "./start-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your assistant", robots: { index: false } };

export default async function StartPage() {
  const session = await requireSession();
  if (session.orgIds.length || session.isAdmin) redirect("/app");
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">B</span>
        <span className="font-semibold">Botly</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Set up your AI assistant</h1>
      <p className="mt-1 text-slate-600">
        Tell us where your business lives online. We read your public pages and write your assistant&apos;s knowledge in about 2 minutes.
        Free for {TRIAL.days} days, including {TRIAL.replies} AI replies. No card needed.
      </p>
      <StartForm email={session.email ?? ""} />
    </main>
  );
}
