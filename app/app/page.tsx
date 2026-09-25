import Link from "next/link";
import { Badge, btn, Empty, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { botMetrics } from "@/lib/dashboard";
import { fmtInt, fmtUsd } from "@/lib/format";
import { quotaState } from "@/lib/quota";
import { supabaseServer } from "@/lib/supabase/server";
import type { BotWithOrg } from "@/lib/types";

export default async function ClientsPage() {
  const session = await requireSession();
  const db = await supabaseServer();
  const { data } = await db.from("bots").select("*, org:organizations(*)").order("created_at", { ascending: false });
  const bots = (data ?? []) as BotWithOrg[];
  const metrics = await botMetrics(bots);

  return (
    <>
      <PageHeader
        title={session.isAdmin ? "Clients and bots" : "Your assistants"}
        sub={session.isAdmin ? "This month, per bot. Cost is what Anthropic charges you." : undefined}
        actions={session.isAdmin ? <Link href="/app/orgs/new" className={btn.primary}>New client</Link> : null}
      />
      {bots.length === 0 ? (
        <Empty title="No bots yet">{session.isAdmin ? "Create your first client to get started." : "Your assistant will appear here once it is set up."}</Empty>
      ) : (
        <div className="grid gap-3">
          {bots.map((b) => {
            const m = metrics.get(b.id)!;
            const q = quotaState(m.conversations, m.quota);
            return (
              <Link key={b.id} href={`/app/bots/${b.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-600">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{b.org.name}</div>
                    <div className="truncate text-sm text-slate-600">{b.name}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={b.status === "live" ? "green" : "gray"}>{b.status}</Badge>
                    {!b.active ? <Badge tone="red">inactive</Badge> : null}
                    <Badge tone="blue">{b.org.plan}</Badge>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
                  <div>
                    <dt className="text-slate-500">Conversations</dt>
                    <dd className={`font-medium tabular-nums ${q.state === "exceeded" ? "text-red-700" : q.state === "warning" ? "text-amber-700" : ""}`}>
                      {fmtInt(m.conversations)} / {fmtInt(m.quota)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Leads</dt>
                    <dd className="font-medium tabular-nums">{fmtInt(m.leads)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Unanswered</dt>
                    <dd className="font-medium tabular-nums">{fmtInt(m.unanswered)}</dd>
                  </div>
                  {session.isAdmin ? (
                    <div>
                      <dt className="text-slate-500">Cost</dt>
                      <dd className="font-medium tabular-nums">{fmtUsd(m.costUsd)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-slate-500">Messages</dt>
                    <dd className="font-medium tabular-nums">{fmtInt(m.messages)}</dd>
                  </div>
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
