import Link from "next/link";
import { setLeadStatus } from "@/app/app/actions";
import { AutoSubmitSelect } from "@/components/client";
import { Badge, btn, Card, Empty, inputClass } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { getBot } from "@/lib/dashboard";
import { fmtDateTime } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";
import type { LeadRow } from "@/lib/types";
import { whatsappLink } from "@/lib/validation/phone";

const STATUSES = ["new", "contacted", "won", "lost"] as const;

export default async function LeadsPage({ params, searchParams }: { params: Promise<{ botId: string }>; searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string }> }) {
  const { botId } = await params;
  const sp = await searchParams;
  await requireSession();
  const bot = await getBot(botId);
  const db = await supabaseServer();
  let q = db.from("leads").select("*").eq("bot_id", bot.id);
  if (sp.status && (STATUSES as readonly string[]).includes(sp.status)) q = q.eq("status", sp.status);
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (sp.from && day.test(sp.from)) q = q.gte("created_at", new Date(sp.from).toISOString());
  if (sp.to && day.test(sp.to)) q = q.lt("created_at", new Date(new Date(sp.to).getTime() + 86_400_000).toISOString());
  const term = (sp.q ?? "").trim().replace(/[%,()*]/g, " ").slice(0, 80);
  if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,need.ilike.%${term}%`);
  const { data } = await q.order("created_at", { ascending: false }).limit(300);
  const leads = (data ?? []) as LeadRow[];
  const base = `/app/bots/${bot.id}/leads`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {[undefined, ...STATUSES].map((s) => (
          <Link key={s ?? "all"} href={`${base}?${new URLSearchParams(Object.entries({ q: sp.q, from: sp.from, to: sp.to, status: s }).filter(([, v]) => v) as [string, string][]).toString()}`} className={`rounded-full px-3 py-1 ${sp.status === s ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
            {s ?? "All"}
          </Link>
        ))}
        <a href={`/api/admin/export?bot=${bot.id}&type=leads&format=csv`} className={`${btn.secondary} ml-auto`}>
          Export CSV
        </a>
      </div>
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_150px_auto]" action={base}>
        {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, phone, email or need" aria-label="Search leads" className={inputClass} />
        <input type="date" name="from" defaultValue={sp.from ?? ""} aria-label="From date" className={inputClass} />
        <input type="date" name="to" defaultValue={sp.to ?? ""} aria-label="To date" className={inputClass} />
        <button className={btn.secondary}>Search</button>
      </form>
      {leads.length === 0 ? (
        <Empty title="No leads yet">When a visitor wants to buy or asks for a person, their details land here and in your email.</Empty>
      ) : (
        <div className="grid gap-3">
          {leads.map((l) => (
            <Card key={l.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{l.name}</span>
                    <Badge tone={l.type === "bulk" ? "amber" : l.type === "human" ? "blue" : "gray"}>{l.type}</Badge>
                  </div>
                  <div className="mt-0.5 text-sm">
                    <a className="underline" href={`tel:${l.phone}`}>{l.phone}</a>
                    {l.email ? <span className="text-zinc-600"> · {l.email}</span> : null}
                  </div>
                  {l.need ? <p className="mt-1 text-sm text-zinc-700">{l.need}</p> : null}
                  <p className="mt-1 text-xs text-zinc-500">
                    {fmtDateTime(l.created_at, bot.org.timezone)} · email {l.notified_email_at ? "sent" : "not sent"} · WhatsApp {l.notified_whatsapp_at ? "sent" : "pending"}
                    {l.conversation_id ? (
                      <>
                        {" · "}
                        <Link className="underline" href={`/app/bots/${bot.id}/conversations/${l.conversation_id}`}>conversation</Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700" href={whatsappLink(l.phone, `Hi ${l.name}, this is ${bot.org.name}. Thanks for reaching out!`)} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                  <form action={setLeadStatus.bind(null, bot.id)}>
                    <input type="hidden" name="leadId" value={l.id} />
                    <AutoSubmitSelect name="status" defaultValue={l.status} aria-label={`Status for ${l.name}`} className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </AutoSubmitSelect>
                  </form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
