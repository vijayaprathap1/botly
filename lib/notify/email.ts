import { brandEmail } from "./layout";
import type { LeadNotice, Notifier, SendResult } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderLeadEmail(n: LeadNotice): { subject: string; html: string; text: string } {
  if (n.kind === "quota_warning" && n.quota) {
    const pct = Math.round((n.quota.used / n.quota.limit) * 100);
    const subject = `${n.businessName}: chat assistant at ${pct}% of this month's conversations`;
    const { html, text } = brandEmail({
      tone: "warning",
      badge: "&#128200;",
      eyebrow: "Usage heads-up",
      preheader: `${n.quota.used} of ${n.quota.limit} conversations used this month.`,
      heading: `${pct}% of this month's conversations used`,
      paragraphs: [
        `${n.botName} has used ${n.quota.used} of ${n.quota.limit} conversations this month.`,
        "At 100% the widget shows your contact details instead of AI replies until the month resets or the plan is upgraded.",
      ],
      stats: [
        { value: `${n.quota.used}`, label: "conversations used" },
        { value: `${Math.max(0, n.quota.limit - n.quota.used)}`, label: "left this month" },
      ],
      reason: `Sent by Botly for ${n.botName}.`,
    });
    return { subject, html, text };
  }
  const l = n.lead!;
  const handoff = n.kind === "handoff";
  const label = handoff ? "wants to talk to a person" : l.type === "callback" ? "asked for a callback" : `new ${l.type} lead`;
  const subject = `${l.name} ${handoff ? "wants to talk to a person" : "\u2014 new lead"} \u00b7 ${n.businessName}`;
  const rows: [string, string][] = [
    ["Name", l.name],
    ["Phone", l.phoneDisplay],
    ...(l.email ? ([["Email", l.email]] as [string, string][]) : []),
    ...(l.need ? ([["Need", l.need]] as [string, string][]) : []),
    ["Type", l.type],
    ...(l.preferredTime ? ([["Preferred time", l.preferredTime]] as [string, string][]) : []),
  ];
  // The owner acts on this from their phone: the first button should start the conversation.
  const call = { label: "Call", url: `tel:${l.phone}` };
  const { html, text } = brandEmail({
    tone: handoff ? "warning" : "success",
    badge: handoff ? "&#128587;" : "&#127919;",
    eyebrow: handoff ? "Needs a person" : l.type === "callback" ? "Callback request" : "New lead",
    preheader: `${l.name} \u00b7 ${l.phoneDisplay}${l.need ? ` \u00b7 ${l.need}` : ""}`,
    heading: handoff ? `${l.name} wants to talk to a person` : l.type === "callback" ? `${l.name} asked for a callback` : `New lead: ${l.name}`,
    paragraphs: [`${l.name} ${label} on ${n.businessName}.`, ...n.summary.split("\n").filter(Boolean)],
    cta: n.whatsappUrl ? { label: `WhatsApp ${l.name}`, url: n.whatsappUrl } : call,
    secondary: [...(n.whatsappUrl ? [call] : []), ...(n.transcriptUrl ? [{ label: "Read the chat", url: n.transcriptUrl }] : [])],
    panel: { title: "Contact details", rows },
    note: "Leads who hear back within a few minutes are far more likely to buy. Reply while they are still on your website.",
    reason: `Sent by Botly for ${n.botName}.`,
  });
  return { subject, html, text };
}

/** Resend over HTTPS (no SDK needed). https://resend.com/docs/api-reference/emails/send-email */
export class ResendNotifier implements Notifier {
  readonly channel = "email" as const;
  configured() {
    return Boolean(process.env.RESEND_API_KEY);
  }
  async send(to: string, notice: LeadNotice): Promise<SendResult> {
    const { subject, html, text } = renderLeadEmail(notice);
    const res = await fetch(`${process.env.RESEND_API_URL || "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "Botly <onboarding@resend.dev>", to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { id?: string };
    return { providerId: body.id };
  }
}

/** Plain transactional email (invites, weekly reports). Returns instead of throwing. */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { sent: false, error: "RESEND_API_KEY not configured" };
  let lastError = "";
  for (const delay of [0, 1500, 5000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetch(`${process.env.RESEND_API_URL || "https://api.resend.com"}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || "Botly <onboarding@resend.dev>", to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { sent: true, id: ((await res.json()) as { id?: string }).id };
      lastError = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status < 500 && res.status !== 429) break; // not retryable
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { sent: false, error: lastError };
}

export const escapeHtml = esc;
