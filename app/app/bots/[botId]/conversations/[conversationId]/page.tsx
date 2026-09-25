import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownLite } from "@/components/markdown";
import { Badge, Card } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { getBot } from "@/lib/dashboard";
import { fmtDateTime, fmtUsd } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { MessageRow } from "@/lib/types";
import { whatsappLink } from "@/lib/validation/phone";

export default async function TranscriptPage({ params }: { params: Promise<{ botId: string; conversationId: string }> }) {
  const { botId, conversationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) notFound();
  const session = await requireSession();
  const bot = await getBot(botId);
  const db = await supabaseServer();
  const [{ data: conv }, { data: msgs }] = await Promise.all([
    db.from("conversations").select("*, lead:leads!conversations_lead_fk(*)").eq("id", conversationId).eq("bot_id", bot.id).maybeSingle(),
    db.from("messages").select("id, created_at, conversation_id, role, content, language, tool_calls, latency_ms, first_token_ms").eq("conversation_id", conversationId).order("created_at"),
  ]);
  // Token and cost columns are admin-only (column privileges): read them with the service role.
  const costs = new Map<string, Pick<MessageRow, "input_tokens" | "output_tokens" | "cache_read_tokens" | "cost_usd">>();
  if (session.isAdmin) {
    const { data: c } = await supabaseAdmin().from("messages").select("id, input_tokens, output_tokens, cache_read_tokens, cost_usd").eq("conversation_id", conversationId);
    for (const r of c ?? []) costs.set(r.id, r);
  }
  if (!conv) notFound();
  const messages = ((msgs ?? []) as MessageRow[]).map((m) => ({ ...m, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cost_usd: 0, ...costs.get(m.id) }));
  const totalCost = messages.reduce((s, m) => s + Number(m.cost_usd ?? 0), 0);
  const lead = conv.lead as { name: string; phone: string; email: string | null; need: string | null; type: string; status: string } | null;
  const tz = bot.org.timezone;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card title="Transcript" actions={<Link href={`/app/bots/${bot.id}/conversations`} className="text-sm text-slate-600 hover:underline">← All conversations</Link>}>
        <ol className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "flex flex-col items-end" : m.role === "system_event" ? "text-center" : ""}>
              {m.role === "system_event" ? (
                <span className="text-xs text-slate-500">— {m.content} —</span>
              ) : (
                <>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] ${m.role === "user" ? "whitespace-pre-wrap rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-slate-100"}`}>
                    {m.role === "assistant" ? (m.content ? <MarkdownLite text={m.content} /> : <i className="text-slate-500">(no text)</i>) : m.content}
                  </div>
                  <div className="mt-0.5 px-1 text-[11px] text-slate-500">
                    {fmtDateTime(m.created_at, tz)}
                    {m.language ? ` · ${m.language}` : ""}
                    {session.isAdmin && m.role === "assistant" ? ` · ${m.first_token_ms ?? "—"}/${m.latency_ms ?? "—"} ms · ${m.input_tokens}+${m.cache_read_tokens}c in / ${m.output_tokens} out · ${fmtUsd(m.cost_usd, 5)}` : ""}
                  </div>
                  {m.tool_calls?.length ? (
                    <details className="mt-1 max-w-[85%] text-xs">
                      <summary className="cursor-pointer text-slate-600">
                        Tools: {m.tool_calls.map((t) => t.name).join(", ")}
                      </summary>
                      <pre className="mt-1 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">{JSON.stringify(m.tool_calls, null, 2)}</pre>
                    </details>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid content-start gap-4">
        <Card title="Details">
          <dl className="grid gap-1 text-sm">
            <dt className="text-slate-500">Started</dt>
            <dd>{fmtDateTime(conv.created_at, tz)}</dd>
            <dt className="text-slate-500">Page</dt>
            <dd className="break-words">{conv.page_url ? <a href={conv.page_url} className="underline" target="_blank" rel="noreferrer">{conv.page_title || conv.page_url}</a> : "—"}</dd>
            <dt className="text-slate-500">Status</dt>
            <dd className="flex flex-wrap gap-1">
              <Badge tone={conv.status === "handed_off" ? "amber" : "gray"}>{conv.status}</Badge>
              {conv.is_test ? <Badge tone="blue">test</Badge> : null}
              {conv.had_unanswered ? <Badge tone="red">unanswered</Badge> : null}
            </dd>
            <dt className="text-slate-500">Visitor</dt>
            <dd className="truncate font-mono text-xs">{conv.visitor_id}</dd>
            {session.isAdmin ? (
              <>
                <dt className="text-slate-500">Cost</dt>
                <dd>{fmtUsd(totalCost, 4)}</dd>
              </>
            ) : null}
          </dl>
        </Card>
        {lead ? (
          <Card title="Lead">
            <p className="font-medium">{lead.name}</p>
            <p className="text-sm">
              <a className="underline" href={`tel:${lead.phone}`}>{lead.phone}</a>
              {lead.email ? <> · {lead.email}</> : null}
            </p>
            {lead.need ? <p className="mt-1 text-sm text-slate-700">{lead.need}</p> : null}
            <div className="mt-2 flex gap-2">
              <Badge>{lead.type}</Badge>
              <Badge tone="blue">{lead.status}</Badge>
            </div>
            <a className="mt-3 inline-block text-sm font-medium text-emerald-700 underline" href={whatsappLink(lead.phone, `Hi ${lead.name}, this is ${bot.org.name}.`)} target="_blank" rel="noreferrer">
              WhatsApp {lead.name}
            </a>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
