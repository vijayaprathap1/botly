"use client";
import { RotateCcw } from "lucide-react";
import { btn } from "@/components/ui";

/**
 * Settings-only error boundary (QA retest 2026-10-25, item 6). Keeps the bot's
 * navigation on screen instead of the full-page "Something went wrong", and offers a
 * full reload, which is what fixes a page left open across a deploy.
 */
export default function SettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
      <h2 className="text-base font-semibold">Settings didn&apos;t load</h2>
      <p className="mt-1 max-w-prose">
        The connection to Botly dropped or the app was just updated. Anything you saved before this message is kept.
        Reload the page to continue.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => window.location.reload()} className={btn.primary}>
          <RotateCcw className="h-4 w-4" />Reload page
        </button>
        <button type="button" onClick={reset} className={btn.secondary}>Try again</button>
      </div>
      {error.digest ? <p className="mt-4 font-mono text-[12px] text-red-700/70">Reference: {error.digest}</p> : null}
    </div>
  );
}
