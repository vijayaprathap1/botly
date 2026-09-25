import Link from "next/link";
import { setBotStatus } from "@/app/app/actions";
import { revokeOwner } from "@/app/app/actions-phase2";
import { InviteForm } from "./client-access";
import { CopyButton, SubmitButton } from "@/components/client";
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

  return (
    <div className="grid gap-4">
      {sp.welcome ? (
        <Notice tone="green">
          Your assistant is ready. Try it below, check your business profile, then add the one-line install code to your website.
        </Notice>
      ) : null}
      {sp.live === "blocked" ? (
        <Notice tone="amber">
          {session.isAdmin ? (
            <>Can&apos;t go live yet: the prompt-injection safety checks didn&apos;t all pass. Check the eval results (<code>npm run eval -- --bot {bot.id}</code>).</>
          ) : (
            <>The safety check didn&apos;t pass yet, so the assistant stays in preview. Add more details in Knowledge and try again, or contact support.</>
          )}
        </Notice>
      ) : null}
      {trial ? (
        <div className={`rounded-xl border p-4 ${trial.over ? "border-red-200 bg-red-50" : "border-brand-100 bg-brand-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <b>{trial.over ? "Your free trial has ended." : "Free trial"}</b>{" "}
              {trial.over
                ? "Visitors now see your contact details instead of AI replies. Choose a plan to switch the assistant back on."
                : `${trial.left} of ${trial.limit} AI replies left · ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left.`}
            </div>
            <Link href="/app/billing" className={btn.primary}>{trial.over ? "Choose a plan" : "Upgrade"}</Link>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div className={`h-full ${trial.over ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${Math.min(100, (trial.used / Math.max(1, trial.limit)) * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {approved === 0 && session.isAdmin ? (
        <Notice tone="amber">
          No approved knowledge yet. The assistant will say &quot;I don&apos;t know&quot; to everything. <Link className="underline" href={`/app/bots/${bot.id}/onboarding`}>Start onboarding</Link>.
        </Notice>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Conversations" value={`${fmtInt(m.conversations)}`} hint={bot.org.plan === "trial" ? "this month" : `of ${fmtInt(m.quota)} this month · ${q.percent}%`} />
        <Stat label="Leads" value={fmtInt(m.leads)} hint="this month" />
        <Stat label="Unanswered" value={fmtInt(m.unanswered)} hint="open questions" />
        {session.isAdmin ? <Stat label="Cost" value={fmtUsd(m.costUsd)} hint={`${fmtInt(m.messages)} messages · p50 first token ${p50 != null ? `${p50} ms` : "—"}`} /> : null}
      </div>

      {!session.isAdmin ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Try your assistant" actions={<a className="text-sm text-brand-700 underline" href={testUrl} target="_blank" rel="noreferrer">Open full screen</a>}>
            <iframe title="Assistant preview" src={`/t/${bot.test_token}`} className="h-[520px] w-full rounded-lg border border-slate-200" />
            <p className="mt-2 text-xs text-slate-500">Preview replies count toward your plan. Share the full-screen link with your team to test.</p>
          </Card>
          <ProfileCard botId={bot.id} markdown={bot.org.profile_markdown ?? null} businessName={bot.org.name} status={bot.org.onboarding_status ?? "done"} />
        </div>
      ) : null}

      <Card title="Install on the website">
        <p className="mb-2 text-sm text-slate-600">Paste this one line before &lt;/body&gt; (Shopify: theme.liquid · WordPress: footer · Wix: Custom code → Body end).</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[13px] text-slate-100">{snippet}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={snippet} label="Copy install snippet" />
          <span className="self-center text-xs text-slate-500">Allowed domains: {bot.allowed_origins.length ? bot.allowed_origins.join(", ") : "none yet (set them in Settings)"}</span>
        </div>
      </Card>

      {!session.isAdmin ? (
        <Card title={bot.status === "live" ? "Live on your website" : "Go live"}>
          <p className="text-sm text-slate-700">
            {bot.status === "live"
              ? `The assistant answers visitors on ${bot.allowed_origins.length ? bot.allowed_origins.join(", ") : "your website (add your domain in Settings)"}. Plan: ${plan.name}${bot.org.plan !== "trial" ? ` (${fmtInr(plan.priceInr)}/month)` : ""}.`
              : "Before going live we run safety checks: the assistant must refuse fake discounts and prompt tricks. It takes about 20 seconds."}
          </p>
          <form action={setBotStatus.bind(null, bot.id)} className="mt-3">
            <input type="hidden" name="status" value={bot.status === "live" ? "draft" : "live"} />
            <SubmitButton className={bot.status === "live" ? btn.secondary : btn.primary} pendingText={bot.status === "live" ? "Updating…" : "Running safety checks…"}>
              {bot.status === "live" ? "Pause (preview only)" : "Run checks and go live"}
            </SubmitButton>
          </form>
          {evalRun ? <p className="mt-2 text-xs text-slate-500">Last safety check {fmtDateTime(evalRun.created_at, bot.org.timezone)}: {evalRun.passed}/{evalRun.total} passed.</p> : null}
        </Card>
      ) : null}

      {session.isAdmin ? (
        <>
          <Card title="Private test link">
            <p className="mb-2 text-sm text-slate-600">Works before launch. Not indexed by search engines. Share it only with the client.</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-slate-100 px-2 py-1 text-[13px]">{testUrl}</code>
              <CopyButton text={testUrl} label="Copy test link" />
              <a className={btn.secondary} href={testUrl} target="_blank" rel="noreferrer">
                Open
              </a>
            </div>
          </Card>
          <Card title="Client access">
            <p className="mb-3 text-sm text-slate-600">
              Clients sign in with their email to see conversations, leads, unanswered questions and reports for their business only. They never see cost, model settings or other clients.
            </p>
            <InviteForm botId={bot.id} orgId={bot.org_id} />
            {invites?.length ? (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate">
                      {i.email} <span className="text-xs text-slate-500">{i.accepted_at ? "· active" : "· invited, not signed in yet"}</span>
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
          <Card title="Launch">
            <div className="text-sm text-slate-700">
              {evalRun ? (
                <p>
                  Last eval {fmtDateTime(evalRun.created_at, bot.org.timezone)}: <b>{evalRun.passed}/{evalRun.total}</b> passed · injection{" "}
                  {evalRun.injection_passed ? <span className="text-emerald-700">all passed</span> : <span className="text-red-700">failures</span>}
                  {evalRun.first_token_p50_ms ? ` · first token p50 ${evalRun.first_token_p50_ms} ms` : ""}
                </p>
              ) : (
                <p>No eval run yet. Run <code className="rounded bg-slate-100 px-1">npm run eval -- --bot {bot.id}</code> before going live.</p>
              )}
            </div>
            <form action={setBotStatus.bind(null, bot.id)} className="mt-3">
              <input type="hidden" name="status" value={bot.status === "live" ? "draft" : "live"} />
              <SubmitButton className={bot.status === "live" ? btn.secondary : btn.primary} pendingText="Updating…">
                {bot.status === "live" ? "Move back to draft" : "Go live"}
              </SubmitButton>
            </form>
          </Card>
        </>
      ) : null}
    </div>
  );
}
