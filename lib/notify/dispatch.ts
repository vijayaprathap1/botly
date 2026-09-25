import type { ChatStore } from "../chat/store";
import { ResendNotifier } from "./email";
import type { LeadNotice, Notifier } from "./types";
import { WhatsAppCloudNotifier } from "./whatsapp";

export function defaultNotifiers(): Notifier[] {
  return [new ResendNotifier(), new WhatsAppCloudNotifier()];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, delaysMs = [0, 1500, 5000]): Promise<{ value?: T; attempts: number; error?: string }> {
  let lastError = "";
  for (let i = 0; i < delaysMs.length; i++) {
    if (delaysMs[i]) await sleep(delaysMs[i]!);
    try {
      return { value: await fn(), attempts: i + 1 };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { attempts: delaysMs.length, error: lastError };
}

/**
 * Sends a notice on every channel to every recipient, with retry, and logs each
 * outcome to `notifications`. Marks the lead notified per channel on first success.
 * Never throws: it runs after the response has been sent.
 */
export async function dispatchNotice(args: {
  store: ChatStore;
  notifiers: Notifier[];
  botId: string;
  leadId: string | null;
  notice: LeadNotice;
  emails: string[];
  whatsapps: string[];
  delaysMs?: number[];
}): Promise<void> {
  const { store, notifiers, notice } = args;
  for (const notifier of notifiers) {
    const recipients = notifier.channel === "email" ? args.emails : args.whatsapps;
    if (recipients.length === 0) continue;
    let anySent = false;
    for (const to of recipients) {
      if (!notifier.configured()) {
        console.warn(`[notify] ${notifier.channel} pending: credentials not configured (bot ${args.botId})`);
        await store.logNotification({ bot_id: args.botId, lead_id: args.leadId, kind: notice.kind, channel: notifier.channel, recipient: to, status: "pending_credentials", attempts: 0 });
        continue;
      }
      const r = await withRetry(() => notifier.send(to, notice), args.delaysMs);
      if (r.error === undefined) anySent = true;
      await store.logNotification({
        bot_id: args.botId,
        lead_id: args.leadId,
        kind: notice.kind,
        channel: notifier.channel,
        recipient: to,
        status: r.error === undefined ? "sent" : "failed",
        attempts: r.attempts,
        error: r.error ?? null,
        provider_id: r.value?.providerId ?? null,
      });
      if (r.error) console.error(`[notify] ${notifier.channel} failed after ${r.attempts} attempts (bot ${args.botId}): ${r.error}`);
    }
    if (anySent && args.leadId) {
      const now = new Date().toISOString();
      await store
        .updateLead(args.leadId, notifier.channel === "email" ? { notified_email_at: now } : { notified_whatsapp_at: now })
        .catch((e) => console.error("[notify] mark lead", e));
    }
  }
}
