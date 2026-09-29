"use client";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { btn, Logo } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-5 text-center">
      <Link href="/" aria-label="Botly home"><Logo className="text-[17px]" /></Link>
      <h1 className="mt-10 text-[28px] font-semibold tracking-[-0.03em] text-zinc-950">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-[15px] text-zinc-600">Nothing you entered was lost. Try again; if it keeps happening, send us the reference below.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <button onClick={reset} className={btn.primary}><RotateCcw className="h-4 w-4" />Try again</button>
        <Link href="/app" className={btn.secondary}>Dashboard</Link>
      </div>
      {error.digest ? <p className="mt-8 font-mono text-[12px] text-zinc-400">Reference: {error.digest}</p> : null}
    </main>
  );
}
