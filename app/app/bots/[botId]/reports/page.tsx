import Link from "next/link";
import { Card, Empty, PageHeader, Stat, btn } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { getBot } from "@/lib/dashboard";
import { fmtInt } from "@/lib/format";
import { LANGUAGE_LABEL, type Lang } from "@/lib/language";
import { monthKey } from "@/lib/quota";
import { buildReport, monthRange } from "@/lib/reports";
import { supabaseServer } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ botId: string }>; searchParams: Promise<{ month?: string }> }) {
  const { botId } = await params;
  const sp = await searchParams;
  await requireSession();
  const bot = await getBot(botId);
  const current = monthKey(new Date(), bot.org.timezone).slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : current;
  const db = await supabaseServer();
  const r = await buildReport(db, bot, monthRange(month, bot.org.timezone));

  const [y, m] = month.split("-").map(Number) as [number, number];
  const shift = (d: number) => {
    const t = new Date(Date.UTC(y, m - 1 + d, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const base = `/app/bots/${bot.id}/reports`;
  const maxHour = Math.max(1, ...r.by_hour);
  const langTotal = Object.values(r.languages).reduce((a, b) => a + b, 0) || 1;
  const busiest = r.by_hour.indexOf(Math.max(...r.by_hour));

  return (
    <div className="grid gap-4">
      <PageHeader level={2}
        title={`Monthly report · ${r.label}`}
        sub={bot.org.name}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link className={btn.secondary} href={`${base}?month=${shift(-1)}`}>← {shift(-1)}</Link>
            {month < current ? <Link className={btn.secondary} href={`${base}?month=${shift(1)}`}>{shift(1)} →</Link> : null}
            <a className={btn.secondary} href={`/api/reports?bot=${bot.id}&month=${month}`}>Download CSV</a>
            <PrintButton />
          </div>
        }
      />
      {r.conversations === 0 ? (
        <Empty title="No conversations this month">The report fills in as visitors chat.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Conversations" value={fmtInt(r.conversations)} hint={`${fmtInt(r.unique_visitors)} unique visitors`} />
            <Stat label="Leads" value={fmtInt(r.leads)} hint={`${fmtInt(r.handoffs)} asked for a person`} />
            <Stat label="Unanswered rate" value={`${Math.round(r.unanswered_rate * 100)}%`} hint={`${fmtInt(r.unanswered_conversations)} conversations`} />
            <Stat label="Hours saved (est.)" value={r.hours_saved} hint={`${fmtInt(r.resolved)} resolved × ${bot.org.minutes_saved_per_conversation} min`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Top questions">
              {r.top_questions.length ? (
                <ol className="space-y-1.5 text-sm">
                  {r.top_questions.map((q, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate" title={q.question}>{i + 1}. {q.question}</span>
                      <span className="flex-none tabular-nums text-zinc-600">{q.count}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-zinc-600">No questions yet.</p>}
            </Card>
            <Card title="Languages">
              <ul className="space-y-2 text-sm">
                {Object.entries(r.languages).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <li key={k}>
                    <div className="flex justify-between"><span>{LANGUAGE_LABEL[k as Lang] ?? k}</span><span className="tabular-nums text-zinc-600">{v} · {Math.round((v / langTotal) * 100)}%</span></div>
                    <div className="mt-1 h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${(v / langTotal) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card title={`Conversations by hour (${bot.org.timezone}) · busiest ${String(busiest).padStart(2, "0")}:00`}>
            <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={`Conversations per hour, busiest at ${busiest}:00`}>
              {r.by_hour.map((n, h) => (
                <div key={h} className="group relative flex h-full flex-1 items-end" title={`${String(h).padStart(2, "0")}:00 · ${n} conversation${n === 1 ? "" : "s"}`}>
                  <div className="w-full rounded-t-[4px] bg-brand-600 group-hover:bg-brand-700" style={{ height: n ? `${Math.max(3, (n / maxHour) * 100)}%` : "0" }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-zinc-500"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
            <p className="mt-2 text-xs text-zinc-500">Hover a bar for its count. The CSV has every hour as a table.</p>
          </Card>
        </>
      )}
    </div>
  );
}
