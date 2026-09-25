import type { LeadNotice, Notifier, SendResult } from "./types";

/**
 * Meta WhatsApp Cloud API: sends the approved utility template (default `new_lead`)
 * with 4 body variables: business, lead name, lead phone, need/summary.
 * Inactive until WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set;
 * the dispatcher then logs "pending_credentials" and email carries the lead.
 * NOTE: written against the documented API but not yet exercised with live credentials.
 */
export class WhatsAppCloudNotifier implements Notifier {
  readonly channel = "whatsapp" as const;
  configured() {
    return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }
  async send(to: string, n: LeadNotice): Promise<SendResult> {
    if (n.kind === "quota_warning" || !n.lead) return {};
    const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s).replace(/\s+/g, " ");
    const res = await fetch(`${process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v21.0"}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE_NAME || "new_lead",
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: clip(n.businessName, 60) },
                { type: "text", text: clip(n.lead.name, 60) },
                { type: "text", text: n.lead.phoneDisplay },
                { type: "text", text: clip(n.lead.need || n.summary, 400) },
              ],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { messages?: { id: string }[] };
    return { providerId: body.messages?.[0]?.id };
  }
}
