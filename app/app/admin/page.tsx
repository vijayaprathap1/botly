import Link from "next/link";
import { AutoSubmitSelect } from "@/components/client";
import { Badge, btn, Card, PageHeader, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, fmtInt, fmtUsd } from "@/lib/format";
import { fmtInr, plans, trialState } from "@/lib/plans";
import { monthKey } from "@/lib/quota";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrgRow } from "@/lib/types";
import { adminOrgAction } from "./actions";

export const dynamic = "force-dynamic";

type Org = OrgRow & { created_at: string; billing_email: string | null; suspended: boolean; subscription_status: string };

export default async function SuperAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = supabaseAdmin();
  const month = monthKey(new Date(), "Asia/Kolkata");
  const [{ data: orgRows }, { data: bots }, { data: usage }, { data: events }] = await Promise.all([
    db.from("organizations").select("*").order("created_at", { ascending: false }).limit(1000),
    db.from("bots").select("id, org_id, status"),
    db.from("usage_monthly").select("bot_id, conversations, messages, cost_usd").eq("month", month),
    db.from("billing_events").select("event, created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const orgs = (orgRows ?? []) as Org[];
  const P = plans();
  const botsByOrg = new Map<string, string[]>();
  for (const b of bots ?? []) botsByOrg.set(b.org_id, [...(botsByOrg.get(b.org_id) ?? []), b.id]);
  const usageByBot = new Map((usage ?? []).map((u) => [u.bot_id as string, u]));
  const orgUsage = (id: string) =>
    (botsByOrg.get(id) ?? []).reduce((a, b) => {
      const u = usageByBot.get(b);
      return { conv: a.conv + (u?.conversations ?? 0), cost: a.cost + Number(u?.cost_usd ?? 0) };
    }, { conv: 0, cost: 0 });

  const paying = orgs.filter((o) => o.plan !== "trial" && o.subscription_status === "active");
  const trials = orgs.filter((o) => o.plan === "trial" && !trialState(o)?.over);
  const mrr = paying.reduce((s, o) => s + P[o.plan].priceInr, 0);
  const aiCostUsd = orgs.reduce((s, o) => s + orgUsage(o.id).cost, 0);
  const usdInr = Number(process.env.USD_INR ?? 88);
  const selfServe = orgs.filter((o) => o.self_serve);
  const converted = selfServe.filter((o) => o.plan !== "trial").length;

  const q = (sp.q ?? "").toLowerCase().trim();
  const list = orgs.filter((o) => {
    if (q && !`${o.name} ${o.billing_email ?? ""}`.toLowerCase().includes(q)) return false;
    if (sp.filter === "paying") return paying.includes(o);
    if (sp.filter === "trial") return o.plan === "trial";
    if (sp.filter === "suspended") return o.suspended;
    return true;
  });

  return (
    <div className="grid gap-4">
      <PageHeader title="Super admin" sub="All customers, revenue and AI cost. Only platform admins (ADMIN_EMAILS) see this." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="MRR" value={fmtInr(mrr)} hint={`${paying.length} paying customers`} />
        <Stat label="Active trials" value={fmtInt(trials.length)} hint={`${orgs.length} workspaces total`} />
        <Stat label="Trial → paid" value={selfServe.length ? `${Math.round((converted / selfServe.length) * 100)}%` : "—"} hint={`${converted} of ${selfServe.length} sign-ups`} />
        <Stat label="AI cost this month" value={fmtUsd(aiCostUsd)} hint={`≈ ${fmtInr(Math.round(aiCostUsd * usdInr))}`} />
        <Stat label="Gross margin (est.)" value={mrr ? `${Math.round(((mrr - aiCostUsd * usdInr) / mrr) * 100)}%` : "—"} hint="MRR minus AI cost, before hosting and GST" />
      </div>
      <Card>
        <form className="flex flex-wrap gap-2" action="/app/admin">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search business or email" className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <select name="filter" defaultValue={sp.filter ?? ""} className="rounded-lg border border-zinc-300 px-2 py-2 text-sm" aria-label="Filter">
            <option value="">All</option>
            <option value="paying">Paying</option>
            <option value="trial">Trials</option>
            <option value="suspended">Suspended</option>
          </select>
          <button className={btn.secondary}>Filter</button>
        </form>
        <div className="-mx-5 mt-4 overflow-x-auto border-t border-zinc-100">
          <table className="w-full min-w-[920px] text-left text-[13.5px] [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-3 [&_th]:py-2.5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
            <thead className="bg-zinc-50/80 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">
              <tr><th>Business</th><th>Plan</th><th>Status</th><th>Trial / renewal</th><th className="text-right">Conv. (month)</th><th className="text-right">AI cost</th><th className="whitespace-nowrap">Joined</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((o) => {
                const t = trialState(o);
                const u = orgUsage(o.id);
                const firstBot = botsByOrg.get(o.id)?.[0];
                return (
                  <tr key={o.id} className="align-middle transition hover:bg-zinc-50/60">
                    <td>
                      {firstBot ? <Link className="font-medium hover:underline" href={`/app/bots/${firstBot}`}>{o.name}</Link> : <span className="font-medium">{o.name}</span>}
                      <div className="text-xs text-zinc-500">{o.billing_email ?? "—"} {o.self_serve ? "· self-serve" : "· done-for-you"}</div>
                    </td>
                    <td><Badge tone={o.plan === "growth" ? "green" : o.plan === "starter" ? "blue" : "gray"}>{P[o.plan].name}</Badge></td>
                    <td>{o.suspended ? <Badge tone="red" dot>suspended</Badge> : <Badge tone={o.subscription_status === "active" ? "green" : o.subscription_status === "trialing" ? "blue" : ["past_due", "halted", "expired"].includes(o.subscription_status) ? "amber" : "gray"} dot>{o.subscription_status.replace("_", " ")}</Badge>}</td>
                    <td className="whitespace-nowrap text-[12.5px] text-zinc-600">{t ? (t.over ? "ended" : `${t.left}/${t.limit} replies · ${t.daysLeft}d`) : o.current_period_end ? `renews ${fmtDate(o.current_period_end, o.timezone)}` : "—"}</td>
                    <td className="num text-right">{fmtInt(u.conv)}</td>
                    <td className="num whitespace-nowrap text-right">{fmtUsd(u.cost)}</td>
                    <td className="whitespace-nowrap text-[12.5px] text-zinc-600">{fmtDate(o.created_at, o.timezone)}</td>
                    <td className="text-right">
                      <form action={adminOrgAction}>
                        <input type="hidden" name="orgId" value={o.id} />
                        <AutoSubmitSelect name="action" defaultValue="" aria-label={`Actions for ${o.name}`} className="h-8 w-40 rounded-md border border-zinc-200 bg-white px-2 text-[12.5px] text-zinc-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10">
                          <option value="" disabled>Choose…</option>
                          <option value="extend">Extend trial (+7 days, +50 replies)</option>
                          <option value="starter">Set Starter (paid offline)</option>
                          <option value="growth">Set Growth (paid offline)</option>
                          {o.suspended ? <option value="unsuspend">Unsuspend</option> : <option value="suspend">Suspend</option>}
                        </AutoSubmitSelect>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Latest billing events">
        {events?.length ? (
          <ul className="divide-y divide-zinc-100 text-[13.5px]">{events.map((e, i) => <li key={i} className="flex items-center justify-between py-2"><code className="font-mono text-[12.5px] text-zinc-800">{e.event}</code><span className="text-[12.5px] text-zinc-500">{fmtDate(e.created_at, "Asia/Kolkata")}</span></li>)}</ul>
        ) : <p className="text-sm text-zinc-600">None yet. They appear once the Razorpay webhook is set up.</p>}
      </Card>
    </div>
  );
}
