import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { LANGUAGE_LABEL, type Lang } from "./language";
import { escapeHtml, sendEmail } from "./notify/email";
import { buildReport, type Report } from "./reports";
import type { BotWithOrg } from "./types";

export function renderWeeklyEmail(bot: BotWithOrg, r: Report): { subject: string; html: string; text: string } {
  const pct = Math.round(r.unanswered_rate * 100);
  const langs = Object.entries(r.languages).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${LANGUAGE_LABEL[k as Lang] ?? k} ${v}`).join(", ");
  const tops = r.top_questions.slice(0, 5);
  const link = `${config.appUrl}/app/bots/${bot.id}/reports`;
  const lines = [
    `${r.conversations} conversations, ${r.leads} leads, ${r.handoffs} asked for a person.`,
    `Unanswered rate ${pct}%. Estimated ${r.hours_saved} hours of replies saved.`,
    langs ? `Languages: ${langs}.` : "",
  ].filter(Boolean);
  const subject = `${bot.org.name}: your assistant this week (${r.conversations} chats, ${r.leads} leads)`;
  const text = [`Weekly summary for ${bot.org.name} (${r.label})`, "", ...lines, "", "Top questions:", ...tops.map((q, i) => `${i + 1}. ${q.question} (${q.count})`), "", `Full report: ${link}`].join("\n");
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:16px">
<h2 style="margin:0 0 4px;font-size:18px">${escapeHtml(bot.org.name)}: your assistant this week</h2>
<p style="margin:0 0 16px;color:#6b7280;font-size:13px">${escapeHtml(r.label)}</p>
${lines.map((l) => `<p style="margin:0 0 6px">${escapeHtml(l)}</p>`).join("")}
${tops.length ? `<h3 style="font-size:15px;margin:16px 0 6px">Top questions</h3><ol style="margin:0;padding-left:20px">${tops.map((q) => `<li>${escapeHtml(q.question)} <span style="color:#6b7280">(${q.count})</span></li>`).join("")}</ol>` : ""}
<p style="margin-top:16px"><a href="${escapeHtml(link)}">Open the full report</a></p>
<p style="font-size:12px;color:#9ca3af">Sent by Botly every Monday.</p></body></html>`;
  return { subject, html, text };
}

/** Weekly report email for every active Growth bot (P14, Phase 3). */
export async function sendWeeklyReports(db: SupabaseClient, now = new Date()): Promise<{ bots: number; sent: number; failed: number }> {
  const { data } = await db.from("bots").select("*, org:organizations(*)").eq("active", true);
  const bots = ((data ?? []) as BotWithOrg[]).filter((b) => b.org.plan === "growth");
  const to = now.toISOString();
  const from = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const fmt = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(d));
  let sent = 0;
  let failed = 0;
  for (const bot of bots) {
    const report = await buildReport(db, bot, { from, to, label: `${fmt(from)} – ${fmt(to)}` });
    const { data: invites } = await db.from("org_invites").select("email").eq("org_id", bot.org_id).not("accepted_at", "is", null);
    const recipients = [...new Set([...bot.notify_emails, ...(invites ?? []).map((i) => i.email as string)])];
    const mail = renderWeeklyEmail(bot, report);
    for (const email of recipients) {
      const r = await sendEmail({ to: email, ...mail });
      if (r.sent) sent++;
      else failed++;
      await db.from("notifications").insert({
        bot_id: bot.id, lead_id: null, kind: "weekly_report", channel: "email", recipient: email,
        status: r.sent ? "sent" : r.error?.includes("not configured") ? "pending_credentials" : "failed",
        attempts: 1, error: r.error ?? null, provider_id: r.id ?? null, sent_at: r.sent ? new Date().toISOString() : null,
      });
    }
  }
  return { bots: bots.length, sent, failed };
}
