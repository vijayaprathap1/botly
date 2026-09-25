import type { LeadNotice, Notifier, SendResult } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderLeadEmail(n: LeadNotice): { subject: string; html: string; text: string } {
  if (n.kind === "quota_warning" && n.quota) {
    const subject = `${n.businessName}: chat assistant at ${Math.round((n.quota.used / n.quota.limit) * 100)}% of this month's conversations`;
    const text = `${n.botName} has used ${n.quota.used} of ${n.quota.limit} conversations this month. At 100% the widget shows your contact details instead of AI replies until the month resets or the plan is upgraded.`;
    return { subject, text, html: `<p>${esc(text)}</p>` };
  }
  const l = n.lead!;
  const label = n.kind === "handoff" ? "wants to talk to a person" : l.type === "callback" ? "asked for a callback" : `new ${l.type} lead`;
  const subject = `${l.name} ${n.kind === "handoff" ? "wants to talk to a person" : "— new lead"} · ${n.businessName}`;
  const rows: [string, string][] = [
    ["Name", l.name],
    ["Phone", l.phoneDisplay],
    ...(l.email ? ([["Email", l.email]] as [string, string][]) : []),
    ...(l.need ? ([["Need", l.need]] as [string, string][]) : []),
    ["Type", l.type],
    ...(l.preferredTime ? ([["Preferred time", l.preferredTime]] as [string, string][]) : []),
  ];
  const text = [
    `${l.name} ${label} on ${n.businessName}.`,
    n.summary,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    n.whatsappUrl ? `WhatsApp them: ${n.whatsappUrl}` : "",
    n.transcriptUrl ? `Read the conversation: ${n.transcriptUrl}` : "",
  ]
    .filter((x) => x !== undefined)
    .join("\n");
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:16px">
<p style="font-size:16px;margin:0 0 8px"><strong>${esc(l.name)}</strong> ${esc(label)} on ${esc(n.businessName)}.</p>
<p style="color:#374151;margin:0 0 16px;white-space:pre-line">${esc(n.summary)}</p>
<table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`)
    .join("")}</table>
<p>${n.whatsappUrl ? `<a href="${esc(n.whatsappUrl)}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;margin-right:8px">WhatsApp ${esc(l.name)}</a>` : ""}<a href="tel:${esc(l.phone)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none">Call</a></p>
${n.transcriptUrl ? `<p style="font-size:14px"><a href="${esc(n.transcriptUrl)}">Read the full conversation</a></p>` : ""}
<p style="font-size:12px;color:#9ca3af">Sent by Botly for ${esc(n.botName)}.</p></body></html>`;
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
