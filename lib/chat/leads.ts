import { config } from "../config";
import { dispatchNotice } from "../notify/dispatch";
import type { Notifier } from "../notify/types";
import type { BotWithOrg, LeadRow, LeadType } from "../types";
import { isValidEmail, normalizePhone, whatsappLink } from "../validation/phone";
import type { ChatStore } from "./store";

export type LeadInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  need?: string | null;
  type: LeadType;
  summary?: string | null;
  preferred_time?: string | null;
};

export type SaveLeadResult =
  | { ok: true; lead: LeadRow; phoneDisplay: string; duplicate: boolean; notify: (() => Promise<void>) | null }
  | { ok: false; field: "name" | "phone" | "email"; error: string };

const clean = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Validates and saves a lead (from the model's tool call or the widget form),
 * links it to the conversation, and returns a notify() job to run after the response.
 */
export async function saveLead(args: {
  store: ChatStore;
  notifiers: Notifier[];
  bot: BotWithOrg;
  conversationId: string | null;
  input: LeadInput;
  handoff: boolean;
  isTest: boolean;
  pageTitle?: string | null;
}): Promise<SaveLeadResult> {
  const { store, bot, conversationId, input } = args;
  const name = clean(input.name, 80);
  if (name.length < 2) return { ok: false, field: "name", error: "Please share your name." };
  const phone = normalizePhone(input.phone ?? "");
  if (!phone.ok) return { ok: false, field: "phone", error: phone.error };
  const email = clean(input.email, 200) || null;
  if (email && !isValidEmail(email)) return { ok: false, field: "email", error: "That email doesn't look right." };
  const need = clean(input.need, 500) || null;
  const summary = clean(input.summary, 400) || null;

  const conversation = conversationId ? await store.getConversation(conversationId) : null;
  const existing = conversation?.lead_id ? await store.getLead(conversation.lead_id) : null;

  let lead: LeadRow;
  let duplicate = false;
  if (existing && existing.phone === phone.e164) {
    duplicate = true;
    const patch: Partial<LeadRow> = {
      need: need ?? existing.need,
      email: email ?? existing.email,
      summary: summary ?? existing.summary,
      ...(args.handoff ? { type: "human" as const } : {}),
    };
    await store.updateLead(existing.id, patch);
    lead = { ...existing, ...patch };
  } else {
    lead = await store.createLead({
      bot_id: bot.id,
      conversation_id: conversationId,
      name,
      phone: phone.e164,
      email,
      need,
      type: args.handoff && input.type === "other" ? "human" : input.type,
      summary,
      preferred_time: clean(input.preferred_time, 80) || null,
    });
  }

  if (conversationId) {
    await store.setConversation(conversationId, {
      lead_id: lead.id,
      ...(args.handoff ? { status: "handed_off" as const } : {}),
    });
  }

  // Notify on a new lead, or when an existing lead now asks for a human.
  const alreadyHandedOff = conversation?.status === "handed_off";
  const shouldNotify = !duplicate || (args.handoff && !alreadyHandedOff);
  const business = bot.org.name;
  const where = args.pageTitle ? `From the chat on "${clean(args.pageTitle, 80)}".` : "From the website chat.";
  const notify = shouldNotify
    ? () =>
        dispatchNotice({
          store,
          notifiers: args.notifiers,
          botId: bot.id,
          leadId: lead.id,
          emails: bot.notify_emails,
          whatsapps: bot.notify_whatsapp,
          notice: {
            kind: args.handoff ? "handoff" : "new_lead",
            businessName: (args.isTest ? "[TEST] " : "") + business,
            botName: bot.name,
            lead: {
              name: lead.name,
              phone: lead.phone,
              phoneDisplay: phone.display,
              email: lead.email,
              need: lead.need,
              type: lead.type,
              preferredTime: lead.preferred_time,
            },
            summary: [lead.summary ?? lead.need ?? (args.handoff ? "Asked to talk to a person." : "Interested in buying."), where].join("\n"),
            transcriptUrl: conversationId ? `${config.appUrl}/app/bots/${bot.id}/conversations/${conversationId}` : undefined,
            whatsappUrl: whatsappLink(lead.phone, `Hi ${lead.name}, this is ${business}. Thanks for reaching out on our website!`),
          },
        })
    : null;

  return { ok: true, lead, phoneDisplay: phone.display, duplicate, notify };
}
