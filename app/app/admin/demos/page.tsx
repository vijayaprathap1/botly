import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, btn, Card, Empty, Notice, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { demoConfig, demoUrl } from "@/lib/demo/service";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DemoSiteRow } from "@/lib/types";
import { demoAction } from "./actions";
import { AutoRefresh, NewDemoForm } from "./new-demo-form";

export const metadata: Metadata = { title: "Demos" };
export const dynamic = "force-dynamic";
// Recopy and Retrain run after the action returns, inside this page's function.
export const maxDuration = 300;

const TONE = { ready: "green", copying: "blue", training: "blue", pending: "blue", failed: "red", expired: "gray" } as const;
const LABEL = { ready: "Ready", copying: "Copying homepage", training: "Training assistant", pending: "Starting", failed: "Failed", expired: "Expired" } as const;

function Act({ id, action, children, className, pendingText = "…" }: { id: string; action: string; children: React.ReactNode; className?: string; pendingText?: string }) {
  return (
    <form action={demoAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton className={className ?? btn.ghost} pendingText={pendingText}>{children}</SubmitButton>
    </form>
  );
}

export default async function DemosPage() {
  await requireAdmin();
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("demo_sites")
    .select("id, created_at, slug, org_id, bot_id, source_url, final_url, business_name, html_bytes, mode, status, error, progress, max_pages, views, first_viewed_at, last_viewed_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const demos = (data ?? []) as DemoSiteRow[];
  const building = demos.some((d) => d.status === "pending" || d.status === "copying" || d.status === "training");

  // Replies used and conversations started, per demo.
  const [{ data: orgs }, { data: convs }] = demos.length
    ? await Promise.all([
        db.from("organizations").select("id, trial_replies_used, trial_reply_limit").in("id", demos.map((d) => d.org_id)),
        db.from("conversations").select("bot_id").in("bot_id", demos.map((d) => d.bot_id)).limit(5000),
      ])
    : [{ data: [] }, { data: [] }];
  const replies = new Map((orgs ?? []).map((o) => [o.id as string, o]));
  const chats = new Map<string, number>();
  for (const c of convs ?? []) chats.set(c.bot_id as string, (chats.get(c.bot_id as string) ?? 0) + 1);
  const contact = demoConfig.contact;

  return (
    <div className="grid gap-4">
      <AutoRefresh active={building} />
      <PageHeader title="Demos" sub="Paste a business's website and get a private link showing their homepage with a Botly assistant trained on it. For pitching that business's owner only." />
      {error ? <Notice tone="red">Demos aren&apos;t set up yet: run <code className="font-mono text-[12px]">supabase/migrations/0009_demos.sql</code> in the Supabase SQL editor, then reload this page.</Notice> : null}

      <Card title="New demo" sub={`Each demo gets ${fmtInt(demoConfig.replyLimit)} AI replies. Leads and "talk to a person" requests from a demo come to you, never to the business.`}>
        <NewDemoForm defaultDays={demoConfig.defaultDays} />
      </Card>

      {!contact.phone && !contact.whatsapp ? (
        <Notice tone="amber">
          When a demo runs out of replies or expires, visitors are shown how to reach you. Only {contact.email ? `your email (${contact.email})` : "nothing"} is set: add <code className="font-mono text-[12px]">DEMO_CONTACT_PHONE</code> and <code className="font-mono text-[12px]">DEMO_CONTACT_WHATSAPP</code> on Vercel so they can call or message you.
        </Notice>
      ) : null}

      {demos.length === 0 && !error ? (
        <Empty title="No demos yet">Create one above. It takes two to four minutes.</Empty>
      ) : (
        <div className="grid gap-3">
          {demos.map((d) => {
            const url = demoUrl(d.slug);
            const o = replies.get(d.org_id);
            const host = (() => {
              try {
                return new URL(d.final_url ?? d.source_url).hostname.replace(/^www\./, "");
              } catch {
                return d.source_url;
              }
            })();
            const working = d.status === "pending" || d.status === "copying" || d.status === "training";
            const lapsed = new Date(d.expires_at).getTime() <= Date.now();
            return (
              <Card key={d.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-zinc-950">{d.business_name}</span>
                      <Badge tone={TONE[d.status]} dot>{LABEL[d.status]}</Badge>
                      {d.mode === "rendered" && d.status === "ready" ? <Badge>Rendered copy</Badge> : null}
                    </div>
                    <a href={d.final_url ?? d.source_url} target="_blank" rel="noreferrer" className="text-[13px] text-zinc-500 hover:text-zinc-900 hover:underline">{host}</a>
                    {working && d.progress ? <p className="mt-1.5 text-[13px] text-brand-700" aria-live="polite">{d.progress}</p> : null}
                    {d.status === "failed" && d.error ? <p className="mt-1.5 text-[13px] text-red-700">{d.error}</p> : null}
                  </div>
                  {d.status === "ready" ? (
                    <div className="flex flex-wrap gap-2">
                      <CopyButton text={url} label="Copy link" />
                      <a className={btn.secondary} href={url} target="_blank" rel="noreferrer">Open ↗</a>
                    </div>
                  ) : null}
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-5">
                  <div><dt className="text-zinc-500">Opened</dt><dd className="font-medium tabular-nums">{fmtInt(d.views)} time{d.views === 1 ? "" : "s"}</dd></div>
                  <div><dt className="text-zinc-500">First opened</dt><dd className="font-medium">{d.first_viewed_at ? fmtDateTime(d.first_viewed_at) : "Not yet"}</dd></div>
                  <div><dt className="text-zinc-500">Chats</dt><dd className="font-medium tabular-nums">{fmtInt(chats.get(d.bot_id) ?? 0)}</dd></div>
                  <div><dt className="text-zinc-500">AI replies</dt><dd className="font-medium tabular-nums">{fmtInt(o?.trial_replies_used ?? 0)} of {fmtInt(o?.trial_reply_limit ?? demoConfig.replyLimit)}</dd></div>
                  <div><dt className="text-zinc-500">{lapsed ? "Expired" : "Expires"}</dt><dd className={`font-medium ${lapsed ? "text-red-700" : ""}`}>{fmtDate(d.expires_at)}</dd></div>
                </dl>

                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-3">
                  <Link className={btn.ghost} href={`/app/bots/${d.bot_id}/conversations`}>Conversations</Link>
                  <Link className={btn.ghost} href={`/app/bots/${d.bot_id}/knowledge`}>Knowledge</Link>
                  {d.status === "failed" ? <Act id={d.id} action="retry" pendingText="Starting…">Retry</Act> : null}
                  {d.status === "ready" ? <Act id={d.id} action="recopy" pendingText="Starting…">Refresh copy</Act> : null}
                  {d.status === "ready" ? <Act id={d.id} action="retrain" pendingText="Starting…">Retrain</Act> : null}
                  {!working ? <Act id={d.id} action="extend">+14 days</Act> : null}
                  {d.status === "ready" ? <Act id={d.id} action="expire">Expire now</Act> : null}
                  <span className="ml-auto" />
                  {!working ? <Act id={d.id} action="delete" className={`${btn.ghost} text-red-700 hover:bg-red-50 hover:text-red-800`} pendingText="Deleting…">Delete</Act> : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-[12.5px] leading-relaxed text-zinc-500">
        A demo shows a copy of someone else&apos;s homepage. Use it only to pitch that business&apos;s owner, never in advertising or to the public. Every demo page says it is a Botly preview and not the official website, isn&apos;t indexed by search engines, and is deleted 30 days after it expires.
      </p>
    </div>
  );
}
