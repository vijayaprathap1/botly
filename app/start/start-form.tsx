"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFormAction } from "@/components/client";
import { btn, Card, Field, inputClass, Notice } from "@/components/ui";
import { startWorkspace, type StartState } from "./actions";

type Ev = { stage: string; message: string; count?: number };
const TYPES = ["online store", "boutique / clothing", "jewellery", "restaurant / cafe", "bakery", "clinic / hospital", "dental clinic", "salon / spa", "gym / fitness", "coaching / education", "real estate", "travel agency", "hotel / homestay", "services", "other"];
const SOCIAL: [string, string, string][] = [
  ["instagram", "Instagram", "instagram.com/yourshop"],
  ["facebook", "Facebook page", "facebook.com/yourshop"],
  ["linkedin", "LinkedIn page", "linkedin.com/company/yourshop"],
  ["google", "Google Business / Maps link", "maps.app.goo.gl/…"],
  ["youtube", "YouTube", "youtube.com/@yourshop"],
];

export function StartForm({ email }: { email: string }) {
  const router = useRouter();
  const [state, action, pending] = useFormAction<StartState>(startWorkspace, null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [building, setBuilding] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!state?.botId || started.current) return;
    started.current = true;
    setBuilding(true);
    (async () => {
      try {
        const res = await fetch("/api/admin/onboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botId: state.botId, url: state.url, ownerNotes: state.ownerNotes, draft: true }),
        });
        const reader = res.body?.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (reader) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const l of lines) if (l.trim()) setEvents((x) => [...x, JSON.parse(l) as Ev]);
        }
      } catch {
        setEvents((x) => [...x, { stage: "skip", message: "Connection interrupted. Your assistant was created; you can add more details from the dashboard." }]);
      }
      router.push(`/app/bots/${state.botId}?welcome=1`);
    })();
  }, [state, router]);

  if (building) {
    const pages = events.filter((e) => e.stage === "page").length;
    const last = events[events.length - 1];
    return (
      <Card title="Step 2 of 2 · Building your assistant">
        <p className="text-sm text-zinc-600">Reading your pages, writing FAQs and your business profile, then running safety checks. Keep this tab open.</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-label="Progress">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${last?.stage === "done" ? 100 : last?.stage === "checking" || last?.stage === "live" ? 90 : last?.stage === "drafting" || last?.stage === "drafted" ? 70 : Math.min(60, 10 + pages * 4)}%` }} />
        </div>
        <ol className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm" aria-live="polite">
          {events.filter((e) => e.stage !== "page").map((e, i) => (
            <li key={i} className={e.stage === "error" ? "text-red-700" : e.stage === "skip" ? "text-zinc-500" : ""}>{e.message}</li>
          ))}
          {pages ? <li className="text-zinc-500">Read {pages} page{pages === 1 ? "" : "s"}…</li> : null}
        </ol>
      </Card>
    );
  }

  const err = (f: string) => (state?.field === f ? <p className="mt-1 text-sm text-red-700">{state.error}</p> : null);
  return (
    <form onSubmit={action} className="mt-6 grid gap-4">
      <Card title="1. Your business">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" htmlFor="businessName">
            <input id="businessName" name="businessName" required maxLength={120} className={inputClass} placeholder="Ananya Handlooms" />
            {err("businessName")}
          </Field>
          <Field label="Type of business" htmlFor="businessType">
            <select id="businessType" name="businessType" className={inputClass} defaultValue="online store">
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Website (optional)" htmlFor="website" hint="We read up to 15 public pages, plus your product catalogue on Shopify stores.">
              <input id="website" name="website" inputMode="url" className={inputClass} placeholder="www.yourshop.com" />
              {err("website")}
            </Field>
          </div>
        </div>
      </Card>

      <Card title="2. Social and Google profiles (optional)">
        <p className="mb-3 text-sm text-zinc-600">
          Instagram, Facebook, LinkedIn and Google don&apos;t allow other apps to read their pages automatically, so paste your bio or &quot;About&quot; text below. We&apos;ll use it and link your profiles.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL.map(([k, label, ph]) => (
            <Field key={k} label={label} htmlFor={`social_${k}`}>
              <input id={`social_${k}`} name={`social_${k}`} inputMode="url" className={inputClass} placeholder={ph} />
              {err(`social_${k}`)}
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Field label="Paste your profile bios / About sections" htmlFor="socialText">
              <textarea id="socialText" name="socialText" rows={3} maxLength={8000} className={inputClass} placeholder="e.g. Handwoven Kanchipuram silks since 1987 · Free shipping above ₹1,999 · DM for bridal orders" />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="3. Details customers ask about">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="About your business, products and prices" htmlFor="about" hint="Plain facts work best: what you sell, prices, delivery, returns, payment options.">
              <textarea id="about" name="about" rows={5} maxLength={8000} className={inputClass} />
              {err("about")}
            </Field>
          </div>
          <Field label="Address" htmlFor="address"><input id="address" name="address" className={inputClass} /></Field>
          <Field label="Opening hours" htmlFor="hours"><input id="hours" name="hours" className={inputClass} placeholder="Mon–Sat 10 am – 8 pm" /></Field>
          <Field label="Phone" htmlFor="phone"><input id="phone" name="phone" type="tel" className={inputClass} />{err("phone")}</Field>
          <Field label="WhatsApp for leads" htmlFor="whatsapp"><input id="whatsapp" name="whatsapp" type="tel" className={inputClass} />{err("whatsapp")}</Field>
          <Field label="Email for leads" htmlFor="contactEmail"><input id="contactEmail" name="contactEmail" type="email" defaultValue={email} className={inputClass} />{err("contactEmail")}</Field>
          <Field label="Assistant's name" htmlFor="assistantName"><input id="assistantName" name="assistantName" defaultValue="Assistant" maxLength={40} className={inputClass} /></Field>
        </div>
      </Card>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>
          I own or represent this business, and I agree to the <a className="underline" href="/terms" target="_blank">Terms</a> and <a className="underline" href="/privacy-policy" target="_blank">Privacy Policy</a>.
        </span>
      </label>
      {state?.error && !state.field ? <Notice tone="red">{state.error}</Notice> : state?.field === "consent" ? <Notice tone="red">{state.error}</Notice> : null}
      <div>
        <button className={`${btn.primary} h-11 px-5 text-[14.5px]`} disabled={pending}>{pending ? "Creating…" : "Create my assistant"}</button>
      </div>
    </form>
  );
}
