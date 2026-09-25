import Link from "next/link";
import { applyToneSuggestion, bulkSources } from "@/app/app/actions";
import { rebuildIndex } from "@/app/app/actions-phase2";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SelectAll, SubmitButton } from "@/components/client";
import { Badge, btn, Card, Empty, inputClass, Notice } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { getBot } from "@/lib/dashboard";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";
import { ImportForms } from "./import-forms";

const TYPES = ["policy", "faq", "product", "page", "file", "note"] as const;
const STATUS_TONE = { approved: "green", draft: "amber", archived: "gray" } as const;

export default async function KnowledgePage({ params, searchParams }: { params: Promise<{ botId: string }>; searchParams: Promise<{ type?: string; status?: string; q?: string }> }) {
  const session = await requireSession();
  const { botId } = await params;
  const sp = await searchParams;
  const bot = await getBot(botId);
  const db = await supabaseServer();

  let query = db.from("knowledge_sources").select("id, type, title, url, content, status, token_count, updated_at").eq("bot_id", bot.id);
  if (sp.type && (TYPES as readonly string[]).includes(sp.type)) query = query.eq("type", sp.type);
  const status = sp.status ?? "active";
  if (status === "active") query = query.neq("status", "archived");
  else if (["draft", "approved", "archived"].includes(status)) query = query.eq("status", status);
  if (sp.q?.trim()) {
    const q = sp.q.trim().replace(/[%,()]/g, " ");
    query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
  }
  const [{ data: rows }, { data: approvedRows }] = await Promise.all([
    query.order("type").order("title").limit(500),
    db.from("knowledge_sources").select("token_count").eq("bot_id", bot.id).eq("status", "approved"),
  ]);
  const sources = rows ?? [];
  const approvedTokens = (approvedRows ?? []).reduce((s, r) => s + (r.token_count ?? 0), 0);
  const cap = config.knowledgeTokenCap;
  const retrieval = approvedTokens > cap;
  const { count: chunkCount } = retrieval
    ? await supabaseAdmin().from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("bot_id", bot.id)
    : { count: 0 };
  const pct = Math.min(100, Math.round((approvedTokens / cap) * 100));
  const back = `/app/bots/${bot.id}/knowledge?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString()}`;
  const filterHref = (k: string, v: string | undefined) => {
    const p = new URLSearchParams(Object.entries({ ...sp, [k]: v }).filter(([, x]) => x) as [string, string][]);
    return `/app/bots/${bot.id}/knowledge?${p.toString()}`;
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Approved knowledge">
          <div className="flex items-baseline justify-between text-sm">
            <span>
              <b className="tabular-nums">{fmtInt(approvedTokens)}</b> of {fmtInt(cap)} tokens
            </span>
            <span className="text-zinc-500">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className={`h-full ${approvedTokens > cap ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Only approved sources reach the assistant. Edits apply to the next message.
          </p>
          {retrieval ? (
            <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
              <b>Retrieval mode is on.</b> The knowledge is too big for one prompt, so policies are always included and the most relevant {chunkCount ? `of ${chunkCount} indexed passages` : "passages"} are picked for each question ({process.env.VOYAGE_API_KEY ? "semantic + keyword search" : "keyword search; add VOYAGE_API_KEY for semantic search"}).
              {!chunkCount ? " The index is still being built." : ""}
              <form action={rebuildIndex.bind(null, bot.id)} className="mt-2">
                <SubmitButton className={btn.secondary} pendingText="Indexing…">Update index now</SubmitButton>
              </form>
            </div>
          ) : null}
        </Card>
        {bot.tone_suggestion ? (
          <Card title="Suggested tone of voice (from the website)">
            <p className="text-sm">{bot.tone_suggestion}</p>
            <p className="mt-1 text-xs text-zinc-500">Current: {bot.tone}</p>
            <form action={applyToneSuggestion.bind(null, bot.id)} className="mt-3">
              <SubmitButton className={btn.secondary}>Use this tone</SubmitButton>
            </form>
          </Card>
        ) : (
          <Card title="Add knowledge">
            <Link href={`/app/bots/${bot.id}/knowledge/new`} className={btn.primary}>
              Add a source
            </Link>
            <p className="mt-2 text-xs text-zinc-500">FAQ, policy, product, note… or import below.</p>
          </Card>
        )}
      </div>

      <ImportForms botId={bot.id} />

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <form className="flex min-w-0 flex-1 gap-2" action={`/app/bots/${bot.id}/knowledge`}>
            {sp.type ? <input type="hidden" name="type" value={sp.type} /> : null}
            {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search title or content" className={`${inputClass} min-w-0`} aria-label="Search knowledge" />
            <button className={btn.secondary}>Search</button>
          </form>
          <Link href={`/app/bots/${bot.id}/knowledge/new`} className={btn.primary}>
            Add
          </Link>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {[["active", "Active"], ["draft", "Drafts"], ["approved", "Approved"], ["archived", "Archived"], ["all", "All"]].map(([v, l]) => (
            <Link key={v} href={filterHref("status", v)} className={`rounded-full px-2.5 py-1 ${status === v ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
              {l}
            </Link>
          ))}
          <span className="mx-1 text-zinc-300">|</span>
          <Link href={filterHref("type", undefined)} className={`rounded-full px-2.5 py-1 ${!sp.type ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
            All types
          </Link>
          {TYPES.map((t) => (
            <Link key={t} href={filterHref("type", t)} className={`rounded-full px-2.5 py-1 ${sp.type === t ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
              {t}
            </Link>
          ))}
        </div>

        {sources.length === 0 ? (
          <Empty title="Nothing here">Try another filter, run onboarding, or add a source.</Empty>
        ) : (
          <form action={bulkSources.bind(null, bot.id)}>
            <input type="hidden" name="back" value={back} />
            <div className="sticky top-14 z-10 -mx-4 mb-2 flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-white px-4 py-2 sm:-mx-5 sm:px-5">
              <SelectAll name="ids" />
              <span className="text-sm text-zinc-600">{sources.length} shown</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <SubmitButton name="action" value="approved" className={btn.primary} pendingText="…">Approve</SubmitButton>
                <SubmitButton name="action" value="draft" className={btn.secondary} pendingText="…">Back to draft</SubmitButton>
                <SubmitButton name="action" value="archived" className={btn.secondary} pendingText="…">Archive</SubmitButton>
                <SubmitButton name="action" value="delete" className={btn.danger} pendingText="…">Delete</SubmitButton>
              </div>
            </div>
            <ul className="divide-y divide-zinc-100">
              {sources.map((s) => (
                <li key={s.id} className="flex gap-3 py-3">
                  <input type="checkbox" name="ids" value={s.id} aria-label={`Select ${s.title}`} className="mt-1 h-4 w-4 flex-none" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="blue">{s.type}</Badge>
                      <Badge tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE]}>{s.status}</Badge>
                      <Link href={`/app/bots/${bot.id}/knowledge/${s.id}`} className="truncate font-medium hover:underline">
                        {s.title || "(untitled)"}
                      </Link>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{s.content}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {fmtInt(s.token_count)} tokens · updated {fmtDateTime(s.updated_at, bot.org.timezone)}
                      {s.url ? ` · ${s.url}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </form>
        )}
      </Card>
      {status === "draft" && sources.length > 0 ? <Notice>Tip: select all, untick anything wrong, then Approve.</Notice> : null}
    </div>
  );
}
