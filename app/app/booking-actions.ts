"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { ActionState } from "@/app/app/actions";
import { requireBotEditor } from "@/lib/bot-access";
import { notifyCustomerStatus } from "@/lib/booking/notify";
import { defaultSettings, type AppointmentRow, type BookingSettingsRow } from "@/lib/booking/types";
import { overrideFormSchema, parseWeeklyHours, serviceFormSchema, settingsFormSchema } from "@/lib/booking/validate";
import { bookingPlan, hasBooking } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Booking settings, services, date overrides and appointment status. Who may change them:
 * the super admin or an owner of the bot's business (requireBotEditor). Writes use the
 * service role with whitelisted fields only.
 */
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const uuid = z.string().uuid();
const path = (botId: string) => `/app/bots/${botId}/booking`;
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Please check the form.";
const missingTable = (msg: string) => /booking_|appointments/.test(msg) && /does not exist|schema cache/i.test(msg);
const dbError = (msg: string) => (missingTable(msg) ? "Booking isn't set up on the server yet (database update 0016 is pending)." : msg);

export async function saveBookingSettings(botId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { bot } = await requireBotEditor(botId);
  const enabled = form.get("enabled") === "on";
  if (enabled && !hasBooking(bot.org.plan)) {
    return { error: `Appointment booking is on the ${bookingPlan().name} plan and above. Upgrade from Billing to switch it on.` };
  }
  const parsed = settingsFormSchema.safeParse({
    title: text(form.get("title")),
    slot_interval_minutes: text(form.get("slot_interval_minutes")),
    buffer_minutes: text(form.get("buffer_minutes")),
    min_notice_minutes: text(form.get("min_notice_minutes")),
    max_days_ahead: text(form.get("max_days_ahead")),
    capacity_per_slot: text(form.get("capacity_per_slot")),
    daily_limit: text(form.get("daily_limit")),
    confirmation_mode: text(form.get("confirmation_mode")),
    collect_email: text(form.get("collect_email")),
    instructions: text(form.get("instructions")),
    cancellation_policy: text(form.get("cancellation_policy")),
    notify_customer: form.get("notify_customer") === "on",
    timezone: text(form.get("timezone")) || bot.org.timezone || "Asia/Kolkata",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const weekly = parseWeeklyHours(text(form.get("weekly_hours")));
  if (typeof weekly === "string") return { error: weekly };
  if (enabled && !Object.values(weekly).some((r) => r && r.length)) return { error: "Add opening hours for at least one day before switching booking on." };

  const { error } = await supabaseAdmin()
    .from("booking_settings")
    .upsert({ bot_id: bot.id, enabled, ...parsed.data, weekly_hours: weekly, updated_at: new Date().toISOString() }, { onConflict: "bot_id" });
  if (error) return { error: dbError(error.message) };
  revalidatePath(path(bot.id));
  return { ok: true, message: enabled ? "Saved. Booking is on in your chat widget." : "Saved. Booking is off." };
}

export async function saveBookingService(botId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { bot } = await requireBotEditor(botId);
  const parsed = serviceFormSchema.safeParse({
    name: text(form.get("name")),
    description: text(form.get("description")),
    duration_minutes: text(form.get("duration_minutes")),
    price_inr: text(form.get("price_inr")),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const id = text(form.get("serviceId"));
  const db = supabaseAdmin();
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Bad service id" };
    const { error } = await db.from("booking_services").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", id).eq("bot_id", bot.id);
    if (error) return { error: dbError(error.message) };
  } else {
    const { count } = await db.from("booking_services").select("id", { count: "exact", head: true }).eq("bot_id", bot.id);
    if ((count ?? 0) >= 30) return { error: "Up to 30 services per assistant." };
    const { error } = await db.from("booking_services").insert({ bot_id: bot.id, ...parsed.data, sort: count ?? 0 });
    if (error) return { error: dbError(error.message) };
  }
  revalidatePath(path(bot.id));
  return { ok: true, message: id ? "Service updated." : "Service added." };
}

export async function deleteBookingService(botId: string, form: FormData) {
  const { bot } = await requireBotEditor(botId);
  const id = text(form.get("serviceId"));
  if (!uuid.safeParse(id).success) return;
  // Past and upcoming appointments keep the service name (copied when booked).
  await supabaseAdmin().from("booking_services").delete().eq("id", id).eq("bot_id", bot.id);
  revalidatePath(path(bot.id));
}

export async function saveDateOverride(botId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { bot } = await requireBotEditor(botId);
  const parsed = overrideFormSchema.safeParse({
    date: text(form.get("date")),
    closed: text(form.get("kind")) !== "hours",
    hours: text(form.get("hours")),
    note: text(form.get("note")),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await supabaseAdmin().from("booking_date_overrides").upsert({ bot_id: bot.id, ...parsed.data }, { onConflict: "bot_id,date" });
  if (error) return { error: dbError(error.message) };
  revalidatePath(path(bot.id));
  return { ok: true, message: parsed.data.closed ? "Day marked closed." : "Special hours saved." };
}

export async function deleteDateOverride(botId: string, form: FormData) {
  const { bot } = await requireBotEditor(botId);
  const id = text(form.get("overrideId"));
  if (!uuid.safeParse(id).success) return;
  await supabaseAdmin().from("booking_date_overrides").delete().eq("id", id).eq("bot_id", bot.id);
  revalidatePath(path(bot.id));
}

const NEXT_STATUS = { confirm: "confirmed", cancel: "cancelled", complete: "completed" } as const;

/** Confirm, cancel or mark done. Confirm and cancel email the customer when they gave an email. */
export async function setAppointmentStatus(botId: string, form: FormData) {
  const { bot } = await requireBotEditor(botId);
  const id = text(form.get("appointmentId"));
  const act = text(form.get("act")) as keyof typeof NEXT_STATUS;
  if (!uuid.safeParse(id).success || !(act in NEXT_STATUS)) return;
  const status = NEXT_STATUS[act];
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const reason = text(form.get("reason")).slice(0, 300) || null;
  const patch =
    status === "confirmed" ? { status, confirmed_at: now } : status === "cancelled" ? { status, cancelled_at: now, cancel_reason: reason } : { status, completed_at: now };
  const allowedFrom = status === "confirmed" ? ["pending"] : status === "cancelled" ? ["pending", "confirmed"] : ["confirmed", "pending"];
  const { data } = await db.from("appointments").update({ ...patch, updated_at: now }).eq("id", id).eq("bot_id", bot.id).in("status", allowedFrom).select("*").maybeSingle();
  const appt = data as AppointmentRow | null;
  if (appt && (status === "confirmed" || status === "cancelled") && !appt.is_test) {
    const { data: s } = await db.from("booking_settings").select("*").eq("bot_id", bot.id).maybeSingle();
    const settings = (s as BookingSettingsRow | null) ?? defaultSettings(bot.id);
    after(() => notifyCustomerStatus(status, appt, bot, settings).catch((e) => console.error("[booking] status email", e)));
  }
  revalidatePath(path(bot.id));
}
