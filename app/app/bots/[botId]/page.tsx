import Link from "next/link";
import { setBotStatus } from "@/app/app/actions";
import { revokeOwner } from "@/app/app/actions-phase2";
import { InviteForm } from "./client-access";
import { CopyButton, SubmitButton } from "@/components/client";
import { CodeBlock } from "@/components/code-block";
import { Activity, Inbox, MessagesSquare, UserRound, Wallet } from "lucide-react";
import { btn, Card, Notice, Stat } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { botMetrics, getBot, installSnippet } from "@/lib/dashboard";
import { fmtDateTime, fmtInt, fmtUsd } from "@/lib/format";
import { quotaState } from "@/lib/quota";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtInr, planDef, trialState } from "@/lib/plans";
import { ProfileCard } from "./profile-card";

export default async function BotOverview({ params, searchParams }: { params: Promise<{ botId: string }>; searchParams: Promise<{ live?: string; welcome?: string }> }) {
  const { botId } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  const bot = await getBot(botId);
  const m = (await botMetrics([bot])).get(bot.id)!;
  const q = quotaState(m.conversations, m.quota);
  const snippet = installSnippet(config.appUrl, bot.public_key);
  const testUrl = `${config.appUrl}/t/${bot.test_token}`;
  const db = await supabaseServer();
  const [{ data: evalRun }, { count: approved }, { data: perf }] = await Promise.all([
    supabaseAdmin().from("eval_runs").select("created_at, passed, total, injection_passed, first_token_p50_ms").eq("bot_id", bot.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("knowledge_sources").select("id", { count: "exact", head: true }).eq("bot_id", bot.id).eq("status", "approved"),
    session.isAdmin
      ? db.from("messages").select("first_token_ms, conversations!inner(bot_id)").eq("conversations.bot_id", bot.id).eq("role", "assistant").not("first_token_ms", "is", null).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: null }),
  ]);
  const { data: invites } = session.isAdmin
    ? await db.from("org_invites").select("id, email, accepted_at, created_at").eq("org_id", bot.org_id).order("created_at")
    : { data: null };
  const ft = ((perf ?? []) as { first_token_ms: number }[]).map((r) => r.first_token_ms).sort((a, b) => a - b);
  const p50 = ft.length ? ft[Math.floor(ft.length / 2)] : null;

  const trial = trialState(bot.org);
  const plan = planDef(bot.org.plan);

  const liveLabel = bot.allowed_origins.length ? bot.allowed_origins.join(", ") : "none yet";
  return (
    <div className="grid gap-5">
      {sp.welcome ? <Notice tone="green">Your assistant is ready. Try it below, check your business profile, then add the install code to your website.</Notice> : null}
      {sp.live === "blocked" ? (
        <Notice tone="amber">
          {session.isAdmin ? (
            <>Can&apos;t go live yet: the prompt-injection safety checks didn&apos;t all pass. See the eval results (<code className="font-mono text-[12px]">npm run eval -- --bot {bot.id}</code>).</>
          ) : (
            <>The safety check didn&apos;t pass yet, so the assistant stays in preview. Add more details in Knowledge and try again, or contact support.</>
          )}
        </Notice>
      ) : null}
      {approved === 0 ? (
        <Notice tone="amber">
          No approved knowledge yet, so the assistant will say it doesn&apos;t know. <Link className="font-medium underline" href={`/app/bots/${bot.id}/onboarding`}>Import your details</Link>.
        </Notice>
      ) : null}
      {trial?.over ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/70 px-5 py-4">
          <div>
            <p className="text-[14px] font-semibold text-red-900">Your free trial has ended.</p>
            <p className="text-[13px] text-red-800">Visitors now see your contact details instead of AI replies. Choose a plan to switch answers back on.</p>
          </div>
          <Link href="/app/billing" className={btn.primary}>Choose a plan</Link>
        </div>
      ) : null}

      <div className={`grid grid-cols-2 gap-3 ${session.isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Stat label="Conversations" icon={<MessagesSquare className="h-4 w-4" />} value={fmtInt(m.conversations)} hint={bot.org.plan === "trial" ? "this month" : `of ${fmtInt(m.quota)} this month · ${q.percent}%`} />
        <Stat label="Leads" icon={<UserRound className="h-4 w-4" />} value={fmtInt(m.leads)} hint="this month" />
        <Stat label="Unanswered" icon={<Inbox className="h-4 w-4" />} value={fmtInt(m.unanswered)} hint={m.unanswered ? <Link className="font-medium text-brand-700 hover:underline" href={`/app/bots/${bot.id}/unanswered`}>Review questions →</Link> : "nothing waiting"} />
        {session.isAdmin ? <Stat label="AI cost" icon={<Wallet className="h-4 w-4" />} value={fmtUsd(m.costUsd)} hint={`${fmtInt(m.messages)} messages · p50 first token ${p50 != null ? `${p50} ms` : "—"}`} /> : null}
      </div>

      {!session.isAdmin ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Try your assistant" sub="Exactly what visitors see. Preview replies count toward your plan." actions={<a className={btn.ghost} href={testUrl} target="_blank" rel="noreferrer">Full screen ↗</a>}>
            <iframe title="Assistant preview" src={`/t/${bot.test_token}`} className="h-[540px] w-full rounded-lg border border-zinc-200 bg-zinc-50" />
          </Card>
          <ProfileCard botId={bot.id} markdown={bot.org.profile_markdown ?? null} businessName={bot.org.name} status={bot.org.onboarding_status ?? "done"} />
        </div>
      ) : null}

      <Card title="Install on your website" sub="Paste this one line just before </body>. Works on Shopify (theme.liquid), WordPress (footer), Wix (Custom code → Body end) and any other site.">
        <CodeBlock code={snippet} />
        <p className="mt-3 text-[12.5px] text-zinc-500">
          Shows only on: <span className="font-medium text-zinc-700">{liveLabel}</span> · <Link className="text-brand-700 hover:underline" href={`/app/bots/${bot.id}/settings`}>change domains</Link>
        </p>
      </Card>

      {!session.isAdmin ? (
        <Card title={bot.status === "live" ? "Live on your website" : "Go live"} sub={bot.status === "live" ? `Plan: ${plan.name}${bot.org.plan !== "trial" ? ` · ${fmtInr(plan.priceInr)}/month` : ""}` : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-[13.5px] text-zinc-600">
              {bot.status === "live"
                ? `The assistant is answering visitors on ${liveLabel}. Pause it any time; your install code can stay in place.`
                : "Before going live we run safety checks: the assistant must refuse fake discounts and prompt tricks. It takes about 20 seconds."}
            </p>
            <form action={setBotStatus.bind(null, bot.id)}>
              <input type="hidden" name="status" value={bot.status === "live" ? "draft" : "live"} />
              <SubmitButton className={bot.status === "live" ? btn.secondary : btn.primary} pendingText={bot.status === "live" ? "Updating…" : "Running safety checks…"}>
                {bot.status === "live" ? "Pause (preview only)" : "Run checks and go live"}
              </SubmitButton>
            </form>
          </div>
          {evalRun ? <p className="mt-3 flex items-center gap-1.5 text-[12px] text-zinc-500"><Activity className="h-3.5 w-3.5" />Last safety check {fmtDateTime(evalRun.created_at, bot.org.timezone)}: {evalRun.passed}/{evalRun.total} passed</p> : null}
        </Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Private test link" sub="Works before launch and isn't indexed. Share it only with the client.">
              <code className="block truncate rounded-md bg-zinc-100 px-2.5 py-1.5 font-mono text-[12px] text-zinc-700">{testUrl}</code>
              <div className="mt-3 flex gap-2">
                <CopyButton text={testUrl} label="Copy link" />
                <a className={btn.secondary} href={testUrl} target="_blank" rel="noreferrer">Open ↗</a>
              </div>
            </Card>
            <Card title="Launch" sub="Going live requires every prompt-injection check to pass.">
              <p className="text-[13.5px] text-zinc-700">
                {evalRun ? (
                  <>
                    Last eval {fmtDateTime(evalRun.created_at, bot.org.timezone)}: <b className="num">{evalRun.passed}/{evalRun.total}</b> passed ·{" "}
                    {evalRun.injection_passed ? <span className="text-emerald-700">injection checks passed</span> : <span className="text-red-700">injection failures</span>}
                    {evalRun.first_token_p50_ms ? ` · p50 ${evalRun.first_token_p50_ms} ms` : ""}
                  </>
                ) : (
                  <>No eval yet. Going live runs the safety check automatically.</>
                )}
              </p>
              <form action={setBotStatus.bind(null, bot.id)} className="mt-3">
                <input type="hidden" name="status" value={bot.status === "live" ? "draft" : "live"} />
                <SubmitButton className={bot.status === "live" ? btn.secondary : btn.primary} pendingText="Updating…">
                  {bot.status === "live" ? "Move back to draft" : "Go live"}
                </SubmitButton>
              </form>
            </Card>
          </div>
          <Card title="Client access" sub="Clients sign in with their email and see only their business: conversations, leads, unanswered questions and reports. Never cost, model settings or other clients.">
            <InviteForm botId={bot.id} orgId={bot.org_id} />
            {invites?.length ? (
              <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-[13.5px]">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate">
                      {i.email} <span className="text-[12px] text-zinc-500">{i.accepted_at ? "· active" : "· invited"}</span>
                    </span>
                    <form action={revokeOwner.bind(null, bot.id)}>
                      <input type="hidden" name="inviteId" value={i.id} />
                      <SubmitButton className={btn.ghost} pendingText="…">Remove</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
