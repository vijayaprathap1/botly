import "server-only";
import { WhatsAppCloudNotifier } from "./whatsapp";

/**
 * What the Leads list shows for a lead's WhatsApp alert. "pending" only when it can still
 * go out; when WhatsApp Cloud isn't configured, or the assistant has no WhatsApp numbers,
 * it never will, so say so instead of "pending" forever (QA audit R20).
 */
export function whatsappLeadStatus(notifiedAt: string | null, botNumbers: string[], configured = new WhatsAppCloudNotifier().configured()): "sent" | "pending" | "not set up" {
  if (notifiedAt) return "sent";
  if (!configured || botNumbers.length === 0) return "not set up";
  return "pending";
}
