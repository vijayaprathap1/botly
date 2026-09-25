export type LeadNotice = {
  kind: "new_lead" | "handoff" | "quota_warning";
  businessName: string;
  botName: string;
  lead?: {
    name: string;
    phone: string;
    phoneDisplay: string;
    email: string | null;
    need: string | null;
    type: string;
    preferredTime?: string | null;
  };
  /** Two short lines: what they want, and where it came from. */
  summary: string;
  transcriptUrl?: string;
  whatsappUrl?: string;
  quota?: { used: number; limit: number };
};

export type SendResult = { providerId?: string };

/** A delivery channel. `configured()` false → the dispatcher records "pending_credentials". */
export interface Notifier {
  readonly channel: "email" | "whatsapp";
  configured(): boolean;
  send(to: string, notice: LeadNotice): Promise<SendResult>;
}
