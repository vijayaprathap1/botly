import Link from "next/link";
import { Badge, btn, Card, Empty, inputClass } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { getBot } from "@/lib/dashboard";
import { fmtDateTime } from "@/lib/format";
import { LANGUAGE_LABEL, type Lang } from "@/lib/language";
import { supabaseServer } from "@/lib/supabase/server";

type SP = { from?: string; to?: string; lang?: string; lead?: string; handed?: string; unanswered?: string; q?: string; test?: string; page?: string };
const PAGE = 50;

export default async function ConversationsPage({ params, searchParams }: { params: Promise<{ botId: string }>; searchParams: Promise<SP> }) {
  const { botId } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  const bot = await getBot(botId);
  const db = await supabaseServer();
  const page = Math.max(0, Number(sp.page ?? 0) || 0);

  let q = db
    .from("conversations")
    .select("id, created_at, last_message_at, language, status, message_count, page_title, page_url, is_test, had_unanswered, lead:leads!conversations_lead_fk(name, phone)", { count: "exact" })
    .eq("bot_id", bot.id);
  if (sp.from) q = q.gte("last_message_at", new Date(sp.from).toISOString());
  if (sp.to) q = q.lt("last_message_at", new Date(new Date(sp.to).getTime() + 86_400_000).toISOString());
  if (sp.lang) q = q.eq("language", sp.lang);
  if (sp.lead === "1") q = q.not("lead_id", "is", null);
  if (sp.handed === "1") q = q.eq("status", "handed_off");
  if (sp.unanswered === "1") q = q.eq("had_unanswered", true);
  if (sp.test !== "1") q = q.eq("is_test", false);
  if (sp.q?.trim()) {
    const term = sp.q.trim().replace(/[%,()]/g, " ");
    const { data: hits } = await db.from("messages").select("conversation_id, conversations!inner(bot_id)").eq("conversations.bot_id", bot.id).ilike("content", `%${term}%`).limit(1000);
    const ids = [...new Set((hits ?? []).map((h) => h.conversation_id as string))];
    q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data, count } = await q.order("last_message_at", { ascending: false, nullsFirst: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  const rows = (data ?? []) as unknown as Array<{
    id: string; created_at: string; last_message_at: string | null; language: string | null; status: string; message_count: number;
    page_title: string | null; page_url: string | null; is_test: boolean; had_unanswered: boolean; lead: { name: string; phone: string } | null;
  }>;
  const base = `/app/bots/${bot.id}/conversations`;
  const qs = (extra: Partial<SP>) => new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="grid gap-4">
      <Card>
        <form action={base} className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_150px_150px_170px_auto]">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search messages" className={`${inputClass} sm:col-span-2 lg:col-span-1`} aria-label="Search messages" />
            <input type="date" name="from" defaultValue={sp.from ?? ""} className={inputClass} aria-label="From date" />
            <input type="date" name="to" defaultValue={sp.to ?? ""} className={inputClass} aria-label="To date" />
            <select name="lang" defaultValue={sp.lang ?? ""} className={inputClass} aria-label="Language">
              <option value="">Any language</option>
              {(Object.keys(LANGUAGE_LABEL) as Lang[]).map((l) => (
                <option key={l} value={l}>{LANGUAGE_LABEL[l]}</option>
              ))}
            </select>
            <button className={btn.primary}>Apply</button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-[13px]">
              {([["lead", "Has lead"], ["handed", "Handed off"], ["unanswered", "Unanswered"], ["test", "Include tests"]] as const).map(([name, label]) => (
                <label key={name} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 transition hover:border-zinc-300 has-[:checked]:border-brand-200 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800">
                  <input type="checkbox" name={name} value="1" defaultChecked={sp[name] === "1"} className="h-3.5 w-3.5 accent-brand-600" />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex gap-1">
              <a className={btn.ghost} href={`/api/admin/export?bot=${bot.id}&type=conversations&format=csv`}>Export CSV</a>
              <a className={btn.ghost} href={`/api/admin/export?bot=${bot.id}&type=conversations&format=json`}>Export JSON</a>
            </div>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Empty title="No conversations match">Conversations appear here as soon as a visitor sends a message.</Empty>
      ) : (
        <Card>
          <p className="mb-2 text-sm text-zinc-600">{count ?? rows.length} conversations</p>
          <ul className="divide-y divide-zinc-100">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`${base}/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-zinc-50">
                  <span className="w-28 flex-none text-sm tabular-nums text-zinc-600">{fmtDateTime(c.last_message_at ?? c.created_at, bot.org.timezone)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.page_title || c.page_url || "—"}</span>
                  <span className="flex flex-wrap gap-1">
                    {c.language ? <Badge>{LANGUAGE_LABEL[c.language as Lang] ?? c.language}</Badge> : null}
                    {c.lead ? <Badge tone="green">lead: {c.lead.name}</Badge> : null}
                    {c.status === "handed_off" ? <Badge tone="amber">handed off</Badge> : null}
                    {c.had_unanswered ? <Badge tone="red">unanswered</Badge> : null}
                    {c.is_test ? <Badge tone="blue">test</Badge> : null}
                    <Badge>{c.message_count} msgs</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between">
            {page > 0 ? <Link className={btn.secondary} href={`${base}?${qs({ page: String(page - 1) })}`}>Newer</Link> : <span />}
            {(count ?? 0) > (page + 1) * PAGE ? <Link className={btn.secondary} href={`${base}?${qs({ page: String(page + 1) })}`}>Older</Link> : null}
          </div>
        </Card>
      )}
    </div>
  );
}
