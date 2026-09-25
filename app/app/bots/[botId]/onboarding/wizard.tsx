"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { btn, Card, Field, inputClass, Notice } from "@/components/ui";

type Ev = { stage: string; message: string; count?: number; total?: number };

export function OnboardingWizard({ botId, defaultUrl, maxPages }: { botId: string; defaultUrl: string; maxPages: number }) {
  const [url, setUrl] = useState(defaultUrl);
  const [pages, setPages] = useState(maxPages);
  const [draft, setDraft] = useState(true);
  const [events, setEvents] = useState<Ev[]>([]);
  const [running, setRunning] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const logRef = useRef<HTMLOListElement>(null);
  const last = events[events.length - 1];

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setEvents([]);
    setPageCount(0);
    setRunning(true);
    try {
      const res = await fetch("/api/admin/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId, url, maxPages: pages, draft }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setEvents([{ stage: "error", message: j.error ?? `Failed (${res.status})` }]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l) as Ev;
          if (ev.stage === "page") setPageCount(ev.count ?? 0);
          setEvents((x) => [...x, ev]);
          queueMicrotask(() => logRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" }));
        }
      }
    } catch (err) {
      setEvents((x) => [...x, { stage: "error", message: err instanceof Error ? err.message : "Network error" }]);
    } finally {
      setRunning(false);
    }
  }

  const pct = last?.stage === "done" ? 100 : last?.stage === "drafting" ? 85 : Math.min(80, Math.round((pageCount / Math.max(1, pages)) * 80));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card title="1. Website">
        <form onSubmit={start} className="grid gap-4">
          <Field label="Website URL" htmlFor="url">
            <input id="url" type="url" required className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          </Field>
          <Field label="Max pages" htmlFor="pages">
            <input id="pages" type="number" min={1} max={100} className={inputClass} value={pages} onChange={(e) => setPages(Number(e.target.value))} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Draft FAQs, policy summary and tone with Claude
          </label>
          <button className={btn.primary} disabled={running}>
            {running ? "Working…" : "Start"}
          </button>
        </form>
      </Card>
      <Card title="2. Progress">
        {events.length === 0 ? (
          <p className="text-sm text-slate-600">Usually 1–3 minutes for 40 pages.</p>
        ) : (
          <>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${last?.stage === "error" ? "bg-red-500" : "bg-brand-600"} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <ol ref={logRef} className="max-h-80 space-y-1 overflow-y-auto text-sm" aria-live="polite">
              {events.map((e, i) => (
                <li key={i} className={e.stage === "error" ? "text-red-700" : e.stage === "skip" ? "text-slate-500" : "text-slate-800"}>
                  {e.stage === "page" ? `Page ${e.count}: ` : ""}
                  {e.message}
                </li>
              ))}
            </ol>
          </>
        )}
        {last?.stage === "done" ? (
          <div className="mt-4 grid gap-2">
            <Notice tone="green">Drafts are ready. Next: review and approve them.</Notice>
            <Link className={btn.primary} href={`/app/bots/${botId}/knowledge?status=draft`}>
              3. Review drafts in Knowledge
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
