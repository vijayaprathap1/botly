"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { btn, Field, inputClass, Notice } from "@/components/ui";

/** Paste a website, get a demo. The slow work continues on the server; the list below shows progress. */
export function NewDemoForm({ defaultDays }: { defaultDays: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setMade("");
    try {
      const res = await fetch("/api/admin/demos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, businessName: data.businessName || undefined }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) setError(j.error ?? `Couldn't create the demo (${res.status}).`);
      else {
        setMade(j.url ?? "");
        form.reset();
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Their website" htmlFor="demo-url" hint="The homepage is copied; the assistant reads the pages linked from it.">
          <input id="demo-url" name="url" required inputMode="url" placeholder="www.theirshop.com" className={inputClass} />
        </Field>
        <Field label="Business name (optional)" htmlFor="demo-name" hint="Left empty, it's taken from the page title.">
          <input id="demo-name" name="businessName" maxLength={120} className={inputClass} />
        </Field>
        <Field label="Pages to read" htmlFor="demo-pages" hint="More pages means a better-informed assistant and a longer wait.">
          <input id="demo-pages" name="maxPages" type="number" min={1} max={40} defaultValue={15} className={inputClass} />
        </Field>
        <Field label="Link stays up for" htmlFor="demo-days">
          <select id="demo-days" name="days" defaultValue={[7, 14, 30].includes(defaultDays) ? defaultDays : 14} className={inputClass}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </Field>
      </div>
      <label className="flex items-start gap-2 text-[13.5px] text-zinc-700">
        <input type="checkbox" name="forceRender" className="mt-0.5" />
        <span>Open it in a browser first <span className="text-zinc-500">(slower. Use this if the normal copy looks broken; sites built with JavaScript are detected by themselves.)</span></span>
      </label>
      {error ? <Notice tone="red">{error}</Notice> : null}
      {made ? <Notice tone="green">Started. It appears in the list below and is usually ready in two to four minutes.</Notice> : null}
      <div>
        <button className={btn.primary} disabled={busy}>{busy ? "Starting…" : "Create demo"}</button>
      </div>
    </form>
  );
}

/** Reloads the list every few seconds while any demo is still being built. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(t);
  }, [active, router]);
  return null;
}
