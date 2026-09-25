"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Dark code panel with a copy button, used for the install snippet. */
export function CodeBlock({ code, label = "HTML" }: { code: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="font-mono text-[11px] text-zinc-500">{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
            } catch {}
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
          className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-[11.5px] font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Copy code"
        >
          {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-zinc-100"><code>{code}</code></pre>
    </div>
  );
}
