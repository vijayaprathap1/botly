import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { TRIAL } from "@/lib/plans";
import { StartForm } from "./start-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your assistant", robots: { index: false } };

export default async function StartPage() {
  const session = await requireSession();
  if (session.orgIds.length || session.isAdmin) redirect("/app");
  return (
    <main className="min-h-dvh bg-zinc-50/70">
      <div className="border-b border-zinc-200/70 bg-white">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <Logo className="text-[17px]" />
          <span className="truncate pl-4 text-[12.5px] text-zinc-500">{session.email}</span>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-[12.5px] font-semibold uppercase tracking-wider text-brand-600">Step 1 of 2 · About your business</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-zinc-950">Set up your AI assistant</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
          Tell us where your business lives online. We read your public pages and write your assistant&apos;s knowledge in about two minutes.
          Free for {TRIAL.days} days, including {TRIAL.replies} AI replies. No card needed.
        </p>
        <StartForm email={session.email ?? ""} />
      </div>
    </main>
  );
}
