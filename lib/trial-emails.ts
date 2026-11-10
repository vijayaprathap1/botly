import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { sendEmail } from "./notify/email";
import { brandEmail, type BrandEmail } from "./notify/layout";
import { fmtInr, planDef, plans, trialState } from "./plans";
import type { OrgRow } from "./types";

export type TrialEmailKey = "welcome" | "replies80" | "ending" | "ended";

/**
 * The one trial email an organization should get today, or null. Each is sent once;
 * later stages win (an ended trial never gets "2 days left"). New Free workspaces get
 * only the welcome email.
 */
export function nextTrialEmail(org: Pick<OrgRow, "plan" | "trial_ends_at" | "trial_reply_limit" | "trial_replies_used" | "trial_emails" | "suspended"> & { created_at?: string }, now = new Date()): TrialEmailKey | null {
  const sent = org.trial_emails ?? {};
  const age = org.created_at ? now.getTime() - Date.parse(org.created_at) : Infinity;
  if (org.plan === "free") return !org.suspended && age < 3 * 86_400_000 && !sent.welcome ? "welcome" : null;
  const t = trialState(org, now);
  if (!t || org.suspended) return null;
  if (t.over) return sent.ended ? null : "ended";
  if (t.daysLeft <= 2 && !sent.ending) return "ending";
  if (t.used >= Math.ceil(t.limit * 0.8) && !sent.replies80) return "replies80";
  if (age < 3 * 86_400_000 && !sent.welcome) return "welcome";
  return null;
}

export function renderTrialEmail(key: TrialEmailKey, org: Pick<OrgRow, "name" | "trial_reply_limit" | "trial_replies_used" | "trial_ends_at"> & { plan?: OrgRow["plan"] }, now = new Date()) {
  const t = trialState({ ...org, plan: "trial" }, now)!;
  const onFree = org.plan === "free";
  const free = plans().free;
  const app = config.appUrl;
  const billing = `${app}/app/billing`;
  const starter = planDef("starter");
  const copy: Record<TrialEmailKey, { subject: string; lines: string[]; cta: [string, string] }> = {
    welcome: {
      subject: `Your ${org.name} assistant is ready`,
      lines: [
        "Your AI assistant has read your business details and is ready to answer customers.",
        "Three quick steps: try it in Preview, check the business profile, then paste the one-line install code on your website.",
        onFree
          ? `You're on the Free plan: ${free.conversations} conversations a month. Upgrade any time from Billing.`
          : `Your free trial includes ${t.limit} AI replies over ${t.daysLeft} days.`,
      ],
      cta: ["Open your assistant", `${app}/app`],
    },
    replies80: {
      subject: `${org.name}: ${t.left} free replies left`,
      lines: [
        `Your assistant has used ${t.used} of its ${t.limit} free AI replies. Customers are asking.`,
        `When the free replies run out, visitors see your phone and email instead of instant answers. Starter keeps it answering: ${starter.conversations.toLocaleString("en-IN")} conversations a month.`,
      ],
      cta: ["Choose a plan", billing],
    },
    ending: {
      subject: `${org.name}: your free trial ends in ${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"}`,
      lines: [
        `Your free trial ends in ${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"}. After that, the assistant shows your contact details instead of answering.`,
        `Choose a plan to keep it answering, or move to the Free plan (${free.conversations} conversations a month). Everything you set up stays as it is.`,
      ],
      cta: ["Keep my assistant on", billing],
    },
    ended: {
      subject: `${org.name}: your free trial has ended`,
      lines: [
        "Your free trial has ended, so your website chat now shows your contact details instead of AI answers.",
        `Your knowledge, conversations and leads are all saved. Choose a plan, or move to the Free plan (${free.conversations} conversations a month), and the assistant starts answering again straight away.`,
      ],
      cta: ["Turn answers back on", billing],
    },
  };
  const c = copy[key];
  // Each stage of the trial gets its own look: a calm welcome, an amber heads-up, a red stop.
  const days = `${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"}`;
  const usage = [
    { value: `${t.left} of ${t.limit}`, label: "free AI replies left" },
    { value: days, label: "left in your trial" },
  ];
  const design: Record<TrialEmailKey, Partial<BrandEmail> & { heading: string }> = {
    welcome: {
      tone: "brand",
      badge: "&#127881;",
      eyebrow: "You're all set",
      heading: `Your ${org.name} assistant is ready`,
      paragraphs: [
        "Your AI assistant has read your business details and is ready to answer customers on your website.",
        ...(onFree ? [`You're on the Free plan: ${free.conversations} conversations a month. Upgrade any time from Billing.`] : []),
      ],
      stats: onFree ? [{ value: `${free.conversations}`, label: "free conversations a month" }, { value: fmtInr(planDef("starter").priceInr), label: "Starter, per month" }] : usage,
      steps: {
        title: "Three quick steps",
        items: ["Try it in Preview: ask what your customers ask.", "Check the business profile it wrote and fix anything that's off.", "Paste the one-line install code on your website. That's it."],
      },
    },
    replies80: { tone: "warning", badge: "&#9889;", eyebrow: "Customers are asking", heading: `${t.left} free replies left`, stats: usage },
    ending: { tone: "warning", badge: "&#9203;", eyebrow: "Trial ending", heading: `Your free trial ends in ${days}`, stats: usage },
    ended: { tone: "danger", badge: "&#9208;", eyebrow: "Trial ended", heading: "Your assistant has stopped answering" },
  };
  const { html, text } = brandEmail({
    preheader: c.lines[0],
    paragraphs: c.lines,
    cta: { label: c.cta[0], url: c.cta[1] },
    reason: onFree ? `You're getting this because you created a Botly account for ${org.name}.` : `You're getting this because you started a Botly trial for ${org.name}.`,
    ...design[key],
  });
  return { subject: c.subject, html, text };
}

/** Daily: sends at most one email per trial workspace (and new Free workspace) and records it. */
export async function sendTrialEmails(db: SupabaseClient, now = new Date()): Promise<{ sent: number; skipped: number }> {
  const [{ data: trials }, { data: fresh }] = await Promise.all([
    db.from("organizations").select("*").eq("plan", "trial").limit(1000),
    db.from("organizations").select("*").eq("plan", "free").gte("created_at", new Date(now.getTime() - 3 * 86_400_000).toISOString()).limit(1000),
  ]);
  let sent = 0;
  let skipped = 0;
  for (const org of [...(trials ?? []), ...(fresh ?? [])] as (OrgRow & { created_at: string })[]) {
    if (org.is_demo) continue;
    const key = nextTrialEmail(org, now);
    if (!key) continue;
    let to = org.billing_email ?? null;
    if (!to && org.created_by) to = (await db.auth.admin.getUserById(org.created_by)).data.user?.email ?? null;
    if (!to) {
      skipped++;
      continue;
    }
    const msg = renderTrialEmail(key, org, now);
    const r = await sendEmail({ to, ...msg });
    if (!r.sent) {
      console.warn("[trial-emails]", org.id, key, r.error);
      skipped++;
      continue;
    }
    await db.from("organizations").update({ trial_emails: { ...(org.trial_emails ?? {}), [key]: now.toISOString() } }).eq("id", org.id);
    sent++;
  }
  return { sent, skipped };
}
