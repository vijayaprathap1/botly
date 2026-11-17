import type { SupabaseClient } from "@supabase/supabase-js";
import { hasBooking } from "../plans";
import type { BotWithOrg } from "../types";
import { addDays, availability, bookingWindow, findSlot, summarizeAvailability, zonedTime, type Busy, type DaySlots, type Slot } from "./slots";
import {
  effectiveServices,
  overridesFrom,
  rulesFrom,
  type AppointmentRow,
  type BookingServiceRow,
  type BookingSettingsRow,
  type DateOverrideRow,
} from "./types";

export type BookingContext = {
  settings: BookingSettingsRow;
  services: BookingServiceRow[];
  overrides: DateOverrideRow[];
  busy: Busy[];
};

/** What the chat engine and the widget API need from the database (a fake in tests). */
export interface BookingSource {
  /** Settings when booking is switched on for this assistant, else null. One small read. */
  enabledSettings(botId: string): Promise<BookingSettingsRow | null>;
  /** Services, date overrides and active appointments inside the booking window. */
  context(settings: BookingSettingsRow, now: Date): Promise<BookingContext>;
}

/** Booking is offered only when the plan includes it AND the owner switched it on. */
export function bookingAllowed(bot: Pick<BotWithOrg, "org">, settings: Pick<BookingSettingsRow, "enabled"> | null): settings is BookingSettingsRow {
  return Boolean(settings?.enabled) && hasBooking(bot.org.plan) && !bot.org.suspended;
}

export class SupabaseBookingSource implements BookingSource {
  constructor(private db: SupabaseClient) {}

  async enabledSettings(botId: string) {
    const { data, error } = await this.db.from("booking_settings").select("*").eq("bot_id", botId).eq("enabled", true).maybeSingle();
    if (error) {
      // Before migration 0016 is applied the table doesn't exist: booking is simply off.
      if (!/does not exist|schema cache/i.test(error.message)) console.error("[booking] settings read failed", error.message);
      return null;
    }
    return (data as BookingSettingsRow | null) ?? null;
  }

  async context(settings: BookingSettingsRow, now: Date): Promise<BookingContext> {
    const rules = rulesFrom(settings);
    const { first, last } = bookingWindow(rules, now);
    // A day either side, so appointments straddling the window edges still count.
    const from = zonedTime(addDays(first, -1), "00:00", rules.timezone).toISOString();
    const to = zonedTime(addDays(last, 2), "00:00", rules.timezone).toISOString();
    const [services, overrides, appts] = await Promise.all([
      this.db.from("booking_services").select("*").eq("bot_id", settings.bot_id).eq("active", true).order("sort").order("name"),
      this.db.from("booking_date_overrides").select("*").eq("bot_id", settings.bot_id).gte("date", first).lte("date", last),
      this.db
        .from("appointments")
        .select("start_at, end_at")
        .eq("bot_id", settings.bot_id)
        .in("status", ["pending", "confirmed"])
        .lt("start_at", to)
        .gt("end_at", from),
    ]);
    for (const r of [services, overrides, appts]) if (r.error) throw new Error(`booking context: ${r.error.message}`);
    return {
      settings,
      services: (services.data ?? []) as BookingServiceRow[],
      overrides: (overrides.data ?? []) as DateOverrideRow[],
      busy: ((appts.data ?? []) as { start_at: string; end_at: string }[]).map((a) => ({ start: a.start_at, end: a.end_at })),
    };
  }
}

export function pickService(ctx: BookingContext, idOrName?: string | null): BookingServiceRow {
  const list = effectiveServices(ctx.services, ctx.settings);
  if (!idOrName) return list[0]!;
  const want = idOrName.trim().toLowerCase();
  return (
    list.find((s) => s.id === idOrName) ??
    list.find((s) => s.name.toLowerCase() === want) ??
    list.find((s) => s.name.toLowerCase().includes(want) || (want.length >= 4 && want.includes(s.name.toLowerCase()))) ??
    list[0]!
  );
}

/** Free slots for one service across the booking window. */
export function serviceAvailability(ctx: BookingContext, service: BookingServiceRow, now: Date): DaySlots[] {
  return availability({ rules: rulesFrom(ctx.settings), overrides: overridesFrom(ctx.overrides), durationMinutes: service.duration_minutes, busy: ctx.busy, now });
}

export function checkSlot(ctx: BookingContext, service: BookingServiceRow, startIso: string, now: Date): Slot | null {
  return findSlot({ startIso, rules: rulesFrom(ctx.settings), overrides: overridesFrom(ctx.overrides), durationMinutes: service.duration_minutes, busy: ctx.busy, now });
}

/** What the chat tool tells the model: real free times only. */
export function availabilityForModel(ctx: BookingContext, service: BookingServiceRow, now: Date, date?: string | null) {
  const days = serviceAvailability(ctx, service, now);
  const fromDate = date ? days.filter((d) => d.date >= date) : days;
  return { service: service.name, duration_minutes: service.duration_minutes, timezone: ctx.settings.timezone, next_free: summarizeAvailability(fromDate) };
}

export type NewAppointment = Omit<AppointmentRow, "id" | "created_at" | "confirmed_at" | "cancelled_at" | "cancel_reason" | "completed_at"> & { confirmed_at?: string | null };

export type CreateResult = { ok: true; appointment: AppointmentRow } | { ok: false; reason: "full" | "duplicate" | "error"; message?: string };

/** Insert; the database trigger is the final word on capacity (race-safe). */
export async function insertAppointment(db: SupabaseClient, row: NewAppointment): Promise<CreateResult> {
  const { data, error } = await db.from("appointments").insert(row).select("*").single();
  if (!error) return { ok: true, appointment: data as AppointmentRow };
  if (error.code === "23P01" || /booking_(slot|day)_full/.test(error.message)) return { ok: false, reason: "full" };
  if (error.code === "23505") return { ok: false, reason: "duplicate" };
  return { ok: false, reason: "error", message: error.message };
}
