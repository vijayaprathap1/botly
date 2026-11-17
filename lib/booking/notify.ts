import { config } from "../config";
import { brandEmail } from "../notify/layout";
import { sendEmail } from "../notify/email";
import type { BotWithOrg } from "../types";
import { isValidEmail, whatsappLink } from "../validation/phone";
import { localDate, localTime, dayLabel, time12 } from "./slots";
import type { AppointmentRow, BookingSettingsRow } from "./types";

/** "Tue 18 Nov, 10:30 am" in the booking timezone. */
export function whenLabel(startIso: string, tz: string): string {
  const at = new Date(startIso);
  return `${dayLabel(localDate(at, tz))}, ${time12(localTime(at, tz))}`;
}

const phoneDisplay = (e164: string) => (/^\+91\d{10}$/.test(e164) ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164);

/** To the business: a new booking (or a request waiting for their OK). */
export function renderBusinessBookingEmail(a: AppointmentRow, bot: BotWithOrg, s: BookingSettingsRow) {
  const business = (bot.org.is_demo ? "[DEMO] " : a.is_test ? "[TEST] " : "") + bot.org.name;
  const when = whenLabel(a.start_at, s.timezone);
  const pending = a.status === "pending";
  const tel = `tel:${a.customer_phone}`;
  const listUrl = `${config.appUrl}/app/bots/${bot.id}/booking`;
  const rows: ([string, string] | [string, string, string])[] = [
    ["When", `${when} (${a.duration_minutes} min)`],
    ["Service", a.service_name],
    ["Name", a.customer_name],
    ["Phone", phoneDisplay(a.customer_phone), tel],
    ...(a.customer_email ? ([["Email", a.customer_email, `mailto:${a.customer_email}`]] as [string, string, string][]) : []),
    ...(a.notes ? ([["Notes", a.notes]] as [string, string][]) : []),
  ];
  const subject = `${pending ? "Booking request" : "New booking"}: ${a.customer_name}, ${when} · ${business}`;
  const { html, text } = brandEmail({
    tone: pending ? "warning" : "success",
    badge: "&#128197;",
    eyebrow: pending ? "Needs your OK" : "New booking",
    preheader: `${a.service_name} · ${when} · ${a.customer_name}`,
    heading: pending ? `${a.customer_name} asked to book ${when}` : `${a.customer_name} booked ${when}`,
    paragraphs: [
      pending
        ? `Confirm or decline it from your dashboard. The customer has been told you'll confirm.`
        : `It's in your Bookings list. The time is now taken for other visitors.`,
    ],
    cta: { label: pending ? "Confirm or decline" : "Open bookings", url: listUrl },
    secondary: [
      { label: `WhatsApp ${a.customer_name}`, url: whatsappLink(a.customer_phone, `Hi ${a.customer_name}, this is ${bot.org.name} about your appointment on ${when}.`) },
      { label: "Call", url: tel },
    ],
    panel: { title: "Appointment", rows },
    reason: `Sent by Botly for ${bot.org.name}.`,
  });
  return { subject, html, text };
}

export type CustomerEmailKind = "received" | "confirmed" | "cancelled";

/** To the customer, only when they gave an email and the business keeps customer emails on. */
export function renderCustomerBookingEmail(kind: CustomerEmailKind, a: AppointmentRow, bot: BotWithOrg, s: BookingSettingsRow) {
  const business = bot.org.name;
  const when = whenLabel(a.start_at, s.timezone);
  const contact = bot.fallback_contact ?? {};
  const heading =
    kind === "cancelled" ? `Your appointment on ${when} is cancelled` : kind === "confirmed" ? `You're booked for ${when}` : `We've got your request for ${when}`;
  const lead =
    kind === "cancelled"
      ? `${business} cancelled this appointment${a.cancel_reason ? `: ${a.cancel_reason}` : "."} Reply to them to find another time.`
      : kind === "confirmed"
        ? `${business} has confirmed your appointment.`
        : `${business} will confirm your appointment soon.`;
  const subject = kind === "cancelled" ? `Cancelled: ${a.service_name} on ${when} · ${business}` : kind === "confirmed" ? `Confirmed: ${a.service_name} on ${when} · ${business}` : `Request received: ${a.service_name} on ${when} · ${business}`;
  const paragraphs: string[] = [`Hi ${a.customer_name},`, lead];
  if (kind !== "cancelled" && s.instructions) paragraphs.push(s.instructions);
  if (kind !== "cancelled" && s.cancellation_policy) paragraphs.push(`Changes and cancellations: ${s.cancellation_policy}`);
  const rows: [string, string][] = [
    ["When", `${when} (${a.duration_minutes} min)`],
    ["Service", a.service_name],
    ["With", business],
    ...(contact.phone ? ([["Phone", contact.phone]] as [string, string][]) : []),
  ];
  const { html, text } = brandEmail({
    tone: kind === "cancelled" ? "danger" : kind === "confirmed" ? "success" : "brand",
    badge: kind === "cancelled" ? "&#10006;" : "&#128197;",
    eyebrow: kind === "cancelled" ? "Appointment cancelled" : kind === "confirmed" ? "Appointment confirmed" : "Booking request",
    preheader: `${a.service_name} · ${when} · ${business}`,
    heading,
    paragraphs,
    panel: { title: "Your appointment", rows },
    note: "To change or cancel, contact the business directly.",
    reason: `You booked on ${business}'s website. Sent by Botly on their behalf.`,
  });
  return { subject, html, text };
}

/** Customers' replies go to the business's public contact email when it has one. */
const replyToFor = (bot: BotWithOrg) => (bot.fallback_contact?.email && isValidEmail(bot.fallback_contact.email) ? bot.fallback_contact.email.trim() : undefined);

/** Business emails + the customer's, for a new booking. Never throws. Returns what was sent. */
export async function notifyNewBooking(a: AppointmentRow, bot: BotWithOrg, s: BookingSettingsRow): Promise<{ business: boolean; customer: boolean }> {
  const result = { business: false, customer: false };
  const biz = renderBusinessBookingEmail(a, bot, s);
  for (const to of (bot.notify_emails ?? []).filter((e) => isValidEmail(e)).slice(0, 5)) {
    const r = await sendEmail({ to, ...biz }).catch((e) => ({ sent: false, error: String(e) }));
    if (r.sent) result.business = true;
    else console.error("[booking] business email failed", r.error);
  }
  if (s.notify_customer && a.customer_email && isValidEmail(a.customer_email)) {
    const msg = renderCustomerBookingEmail(a.status === "confirmed" ? "confirmed" : "received", a, bot, s);
    const r = await sendEmail({ to: a.customer_email, replyTo: replyToFor(bot), ...msg }).catch((e) => ({ sent: false, error: String(e) }));
    result.customer = r.sent;
    if (!r.sent) console.error("[booking] customer email failed", r.error);
  }
  return result;
}

export async function notifyCustomerStatus(kind: "confirmed" | "cancelled", a: AppointmentRow, bot: BotWithOrg, s: BookingSettingsRow): Promise<boolean> {
  if (!s.notify_customer || !a.customer_email || !isValidEmail(a.customer_email)) return false;
  const r = await sendEmail({ to: a.customer_email, replyTo: replyToFor(bot), ...renderCustomerBookingEmail(kind, a, bot, s) }).catch(() => ({ sent: false }));
  return r.sent;
}
